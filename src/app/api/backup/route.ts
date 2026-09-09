import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readConfig, writeConfig } from '@/lib/config';
import { readChoreData, writeChoreData } from '@/lib/chore-data';
import { readCompletions, writeCompletions } from '@/lib/chore-completion-data';
import { readMealData, writeMealData } from '@/lib/meal-data';
import { readRewardData, writeRewardData } from '@/lib/reward-data';
import { readRoutinesFile, writeRoutinesFile } from '@/lib/timer-data';
import { readTodoData, writeTodoData, foldInLegacyTodoItemsNow, validateTodoData, settleTodoMigration } from '@/lib/todo-data';
import { writeBackupState } from '@/lib/backup-state';
import { withAuth, parseJsonBody, getClientIP } from '@/lib/api-utils';
import { validateDisplays } from '@/lib/display-filter';
import { applyCredentials, snapshotCredentials } from '@/lib/backup-credentials';
import {
  decryptCredentials,
  BadPassphraseError,
  MalformedEnvelopeError,
} from '@/lib/backup-crypto';
import {
  CREDENTIAL_SECTIONS,
  isCredentialEnvelope,
  isEncryptedEnvelope,
  type CredentialApplyResult,
  type CredentialEnvelope,
  type CredentialPayload,
  type CredentialSection,
} from '@/lib/backup-credentials-types';
import { audit } from '@/lib/audit';
import type { ScreenConfiguration } from '@/types/config';

export const dynamic = 'force-dynamic';

// GET — export a full backup bundle
export const GET = withAuth(async () => {
  // The fold rewrites config.json, so let it finish before the reads below:
  // in parallel the very first export after an upgrade could pair a
  // pre-fold config with post-fold lists and back up neither faithfully.
  await settleTodoMigration();
  const [config, chores, completions, meals, rewards, routines, todos] = await Promise.all([
    readConfig(),
    readChoreData(),
    readCompletions(),
    readMealData(),
    readRewardData(),
    readRoutinesFile(),
    readTodoData(),
  ]);

  const bundle = {
    _type: 'home-screens-backup',
    // v2 adds the optional `credentials` section. A v2 bundle without that
    // section is byte-identical in effect to v1, and v1 bundles still restore.
    _version: 2,
    _createdAt: new Date().toISOString(),
    config,
    chores,
    choreCompletions: completions,
    meals,
    rewards,
    routines,
    todos,
  };

  // Record backup timestamp (fire-and-forget) — write both fields directly
  // to avoid a read-modify-write race with concurrent dismiss POSTs
  writeBackupState({
    lastBackupDate: new Date().toISOString(),
    lastDismissedDate: null,
  }).catch(() => {});

  return NextResponse.json(bundle);
}, 'Failed to create backup');

// Shape + displays validation — mirror /api/config PUT so a restore can't
// persist a config that the editor would reject. Without this gate, a
// malformed bundle (missing screens, duplicate display IDs, non-URL-safe
// slugs, etc.) would be written to config.json as-is and could break
// rendering or invalidate cross-references.
function validateRestoredConfig(config: unknown): string | null {
  if (!config || typeof config !== 'object') {
    return 'Invalid config: must be an object';
  }
  const c = config as Partial<ScreenConfiguration>;
  if (!Array.isArray(c.screens) || !c.settings) {
    return 'Invalid config: must include screens array and settings';
  }
  return validateDisplays(config as ScreenConfiguration);
}

// Fields a restore bundle may carry. Each optional file mirrors the type its
// writer expects; screens/settings let the legacy config-only format be
// recognized before it is written as a full ScreenConfiguration.
interface RestoreBundle {
  _type?: unknown;
  /**
   * Transient: the password for an encrypted `credentials` section. Never
   * part of the bundle on disk — the editor adds it to the request body only,
   * and the handler strips it before anything else touches the object.
   */
  _passphrase?: unknown;
  credentials?: unknown;
  config?: ScreenConfiguration;
  chores?: Parameters<typeof writeChoreData>[0];
  choreCompletions?: Parameters<typeof writeCompletions>[0];
  meals?: Parameters<typeof writeMealData>[0];
  rewards?: Parameters<typeof writeRewardData>[0];
  routines?: Parameters<typeof writeRoutinesFile>[0];
  todos?: Parameters<typeof writeTodoData>[0];
  screens?: unknown;
  settings?: unknown;
}

// POST — restore from a backup bundle (or a legacy config-only file).
//
// Two safety properties beyond the raw writes:
//  1. Validate any incoming config (shape + displays) BEFORE any disk write,
//     so a bad bundle can't clobber config.json past the point of no return.
//  2. Snapshot the current on-disk state of every file we're about to touch,
//     run writes sequentially, and on any failure roll back the writes that
//     already landed. Each individual write is already atomic via tmp+rename
//     (json-store), but there's no cross-file transaction — without rollback
//     a mid-bundle failure leaves mixed old/new data across config, chores,
//     meals, rewards.
// A backup bundle is pure JSON (config + chores + meals + rewards) — this app
// stores no user-uploaded media — so even a very large family's export is a
// few MB at most. Cap the restore upload well above that but firmly bounded so
// the endpoint can't be used to exhaust memory with an oversized body.
const MAX_RESTORE_BYTES = 25 * 1024 * 1024; // 25 MB

/** Which credential sections a decrypted payload actually carries. */
function sectionsPresentIn(payload: CredentialPayload): CredentialSection[] {
  return CREDENTIAL_SECTIONS.filter((section) => payload[section] !== undefined);
}

/**
 * A sentence for anything that prints `error` verbatim, plus the machine code
 * the editor maps to localized copy. Both, always: `error` alone reaches a
 * phone, and a code alone would show it the word `bad_passphrase`.
 */
const CREDENTIAL_ERRORS = {
  passphrase_required: 'This backup\'s saved keys are password protected. Enter the password to restore them.',
  bad_passphrase: 'That password does not match the one this backup was saved with.',
  invalid_credentials: 'The saved keys in this backup are damaged and cannot be read.',
} as const;

function credentialError(code: keyof typeof CREDENTIAL_ERRORS): NextResponse {
  return NextResponse.json({ error: CREDENTIAL_ERRORS[code], code }, { status: 400 });
}

/**
 * Turn the bundle's `credentials` field into a payload we can write, or into
 * the 400 the client needs to drive its passphrase prompt. Runs BEFORE any
 * disk write, so a wrong password costs nothing. `passphrase_required` is
 * what opens the password modal on the restore path.
 */
async function resolveCredentials(
  raw: unknown,
  passphrase: string | undefined,
): Promise<CredentialPayload | NextResponse> {
  if (!isCredentialEnvelope(raw)) {
    return credentialError('invalid_credentials');
  }
  const envelope = raw as CredentialEnvelope;
  if (!isEncryptedEnvelope(envelope)) return envelope.data;

  if (!passphrase) {
    return credentialError('passphrase_required');
  }
  try {
    return await decryptCredentials(envelope, passphrase);
  } catch (err) {
    if (err instanceof BadPassphraseError) {
      return credentialError('bad_passphrase');
    }
    if (err instanceof MalformedEnvelopeError) {
      return credentialError('invalid_credentials');
    }
    throw err;
  }
}

export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<RestoreBundle>(request, {
    maxBytes: MAX_RESTORE_BYTES,
  });
  if (body instanceof NextResponse) return body;

  // Settle any pending to-do migration first: reading the store can rewrite
  // config.json (folding inline items into lists), and a snapshot taken
  // before that would pair a pre-migration config with post-migration lists
  // on rollback, leaving the flag set and the items never folded again.
  await readTodoData().catch(() => {});

  // New bundle format
  if (body._type === 'home-screens-backup') {
    // Strip the transient passphrase before anything else reads the body, so
    // it can't be snapshotted, logged, or written to disk by accident.
    const passphrase = typeof body._passphrase === 'string' ? body._passphrase : undefined;
    delete body._passphrase;

    if (body.config !== undefined) {
      const err = validateRestoredConfig(body.config);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }
    // Same gate for the lists: the file is written whole, and a malformed one
    // would break every read after the restore.
    if (body.todos !== undefined) {
      const err = validateTodoData(body.todos);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }

    // Decrypt before any write: a wrong password must cost nothing, and the
    // client's fallback is to re-post the same bundle with `credentials`
    // stripped, which restores everything except the keys.
    let credentialPayload: CredentialPayload | null = null;
    if (body.credentials !== undefined) {
      const resolved = await resolveCredentials(body.credentials, passphrase);
      if (resolved instanceof NextResponse) return resolved;
      credentialPayload = resolved;
    }

    // Snapshot current state of every file we're about to touch BEFORE any
    // write, so we can roll back to a consistent pre-restore state on failure.
    const snapshots = {
      config: body.config ? await readConfig() : null,
      chores: body.chores ? await readChoreData() : null,
      completions: body.choreCompletions ? await readCompletions() : null,
      meals: body.meals ? await readMealData() : null,
      rewards: body.rewards ? await readRewardData() : null,
      routines: body.routines ? await readRoutinesFile() : null,
      // A restored config can fold inline to-do items into todos.json even
      // when the bundle carries no `todos`, so the snapshot covers both.
      todos: body.todos || body.config ? await readTodoData() : null,
    };
    // Credential snapshot covers exactly the sections about to be written,
    // including the empty ones — "there were no secrets before" is what a
    // rollback has to be able to reinstate.
    const credentialSnapshot = credentialPayload
      ? await snapshotCredentials(sectionsPresentIn(credentialPayload))
      : null;

    // Track which writes actually landed (post-await) so rollback only
    // reverts files that were actually mutated — the failing write itself
    // either completed the rename or didn't touch the file.
    const rollbacks: Array<() => Promise<void>> = [];
    let credentialResult: CredentialApplyResult | null = null;
    try {
      if (body.config) {
        await writeConfig(body.config);
        rollbacks.push(() => writeConfig(snapshots.config!));
      }
      if (body.chores) {
        await writeChoreData(body.chores);
        rollbacks.push(() => writeChoreData(snapshots.chores!));
      }
      if (body.choreCompletions) {
        await writeCompletions(body.choreCompletions);
        rollbacks.push(() => writeCompletions(snapshots.completions!));
      }
      if (body.meals) {
        await writeMealData(body.meals);
        rollbacks.push(() => writeMealData(snapshots.meals!));
      }
      if (body.rewards) {
        await writeRewardData(body.rewards);
        rollbacks.push(() => writeRewardData(snapshots.rewards!));
      }
      if (body.routines) {
        await writeRoutinesFile(body.routines);
        rollbacks.push(() => writeRoutinesFile(snapshots.routines!));
      }
      // Registered whenever a snapshot was taken, before either thing that
      // can change the file: the bundle's own `todos`, and the fold a
      // restored pre-lists config triggers below.
      if (snapshots.todos) rollbacks.push(() => writeTodoData(snapshots.todos!));
      if (body.todos) {
        await writeTodoData(body.todos);
      }
      // A bundle from before lists were shared carries to-do items inline on
      // its modules; the one-time upgrade fold-in has already run on this hub
      // and would not look again, so fold them now.
      if (body.config) {
        await foldInLegacyTodoItemsNow();
      }
      // Credentials go last: applying `auth` replaces the cookie secret and
      // invalidates the session cookie this very request is holding, so
      // everything else must already be on disk by then.
      if (credentialPayload) {
        // Registered BEFORE the call, not after. Unlike the single-file
        // writes above, applyCredentials is itself multi-write and can fail
        // partway through; the snapshot is already taken, and re-applying it
        // when nothing was written is a harmless no-op.
        rollbacks.push(async () => {
          await applyCredentials(credentialSnapshot!, {
            enforceIpGuard: false,
            // Undo plugin credential files the restore newly created.
            prunePlugins: true,
          });
        });
        credentialResult = await applyCredentials(credentialPayload, {
          clientIp: getClientIP(request),
        });
        audit({
          action: 'credential_backup_restore',
          sections: credentialResult.applied.length,
          skipped: credentialResult.skipped,
        });
      }
    } catch (err) {
      // Best-effort rollback in reverse order. allSettled so one failed
      // revert doesn't block the others — surface the original error either way.
      await Promise.allSettled(rollbacks.reverse().map((fn) => fn()));
      throw err;
    }

    return NextResponse.json({
      restored: {
        config: !!body.config,
        chores: !!body.chores,
        choreCompletions: !!body.choreCompletions,
        meals: !!body.meals,
        rewards: !!body.rewards,
        routines: !!body.routines,
      },
      // Present only when the bundle carried credentials. The editor needs
      // `applied` to know whether the session it is holding just died (auth),
      // and `skipped` to tell the user what the lockout guard held back.
      ...(credentialResult ? { credentials: credentialResult } : {}),
    });
  }

  // Legacy format: raw ScreenConfiguration object
  if (body.screens && Array.isArray(body.screens) && body.settings) {
    const err = validateRestoredConfig(body);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    // These are the bundles most likely to carry to-do items inline on
    // their modules; fold them. The fold writes lists before it touches
    // config, so a failure part-way can leave lists behind: both files are
    // snapshotted and both go back.
    const previousConfig = await readConfig();
    const previousTodos = await readTodoData();
    await writeConfig(body as unknown as ScreenConfiguration);
    try {
      await foldInLegacyTodoItemsNow();
    } catch (err) {
      await Promise.allSettled([writeConfig(previousConfig), writeTodoData(previousTodos)]);
      throw err;
    }
    return NextResponse.json({ restored: { config: true } });
  }

  return NextResponse.json(
    { error: 'Unrecognized backup format' },
    { status: 400 },
  );
}, 'Failed to restore backup');
