import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readConfig } from '@/lib/config';
import { readChoreData } from '@/lib/chore-data';
import { readCompletions } from '@/lib/chore-completion-data';
import { readMealData } from '@/lib/meal-data';
import { readRewardData } from '@/lib/reward-data';
import { readRoutinesFile, validateRoutines } from '@/lib/timer-data';
import { readTodoData, validateTodoData, settleTodoMigration } from '@/lib/todo-data';
import { writeBackupState } from '@/lib/backup-state';
import { withAuth, parseJsonBody, getClientIP } from '@/lib/api-utils';
import { validateDisplays } from '@/lib/display-filter';
import { planCredentialRestore } from '@/lib/backup-credentials';
import { withFamilyData } from '@/lib/family-api';
import { readFamilyData, familyValidationError } from '@/lib/family-data';
import { planFamilyRestore, type FamilyRestoreContent } from '@/lib/family-import';
import { commitDataTransaction, withDataTransaction } from '@/lib/data-transaction';
import {
  decryptCredentials,
  BadPassphraseError,
  MalformedEnvelopeError,
} from '@/lib/backup-crypto';
import {
  isCredentialEnvelope,
  isEncryptedEnvelope,
  type CredentialApplyResult,
  type CredentialEnvelope,
  type CredentialPayload,
} from '@/lib/backup-credentials-types';
import { audit } from '@/lib/audit';
import type { ScreenConfiguration } from '@/types/config';

export const dynamic = 'force-dynamic';

// GET — export a full backup bundle
export const GET = withAuth(async () => withFamilyData(async () => {
  // The fold rewrites config.json, so let it finish before the reads below:
  // in parallel the very first export after an upgrade could pair a
  // pre-fold config with post-fold lists and back up neither faithfully.
  await settleTodoMigration();
  const [config, chores, completions, meals, rewards, routines, todos, family] = await Promise.all([
    readConfig(),
    readChoreData(),
    readCompletions(),
    readMealData(),
    readRewardData(),
    readRoutinesFile(),
    readTodoData(),
    readFamilyData(),
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
    family,
  };

  // Record backup timestamp before releasing the snapshot lock; write both fields directly
  // to avoid a read-modify-write race with concurrent dismiss POSTs
  await writeBackupState({
    lastBackupDate: new Date().toISOString(),
    lastDismissedDate: null,
  }).catch(() => {});

  return NextResponse.json(bundle);
}), 'Failed to create backup');

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
  const mappings = c.settings.calendar?.personSources;
  if (mappings !== undefined && (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)
    || Object.values(mappings).some((ids) => !Array.isArray(ids) || ids.some((id) => typeof id !== 'string')))) return 'Calendar ownership must list calendar source ids for each person.';
  return validateDisplays(config as ScreenConfiguration);
}

// Fields a restore bundle may carry. Each optional file mirrors the type its
// writer expects; screens/settings let the legacy config-only format be
// recognized before it is written as a full ScreenConfiguration.
interface RestoreBundle extends FamilyRestoreContent {
  _type?: unknown;
  /**
   * Transient: the password for an encrypted `credentials` section. Never
   * part of the bundle on disk — the editor adds it to the request body only,
   * and the handler strips it before anything else touches the object.
   */
  _passphrase?: unknown;
  credentials?: unknown;
  screens?: unknown;
  settings?: unknown;
}

// Restore is planned completely before publication. Content, credentials and
// any legacy folds share a durable journal; handled failures record rollback
// before restoring before-images, and a restart resumes the saved decision.
const MAX_RESTORE_BYTES = 25 * 1024 * 1024; // 25 MB

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

export const POST = withAuth(async (request: NextRequest) => withDataTransaction(async () => {
  const body = await parseJsonBody<RestoreBundle>(request, {
    maxBytes: MAX_RESTORE_BYTES,
  });
  if (body instanceof NextResponse) return body;

  // Pending journals recover under the coordinator. Do not migrate or read
  // current sources before validating the replacement: a good full backup
  // must be able to repair corrupt files it replaces.

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

    if (body.family !== undefined) {
      const error = familyValidationError(body.family);
      if (error) return NextResponse.json({ error }, { status: 400 });
    }
    const invalid = validateContentSections(body);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    const planned = await planFamilyRestore(body);
    let credentialResult: CredentialApplyResult | null = null;
    if (credentialPayload) {
      const credentials = await planCredentialRestore(credentialPayload, getClientIP(request));
      planned.changes.push(...credentials.changes);
      credentialResult = credentials.result;
    }
    await commitDataTransaction({ kind: 'backup-restore', changes: planned.changes, evidence: planned.evidence, rollbackOnError: true });
    if (credentialResult) audit({ action: 'credential_backup_restore', sections: credentialResult.applied.length, skipped: credentialResult.skipped });

    return NextResponse.json({
      restored: {
        config: !!body.config,
        family: !!body.family,
        todos: !!body.todos,
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
    const planned = await planFamilyRestore({ config: body as unknown as ScreenConfiguration });
    await commitDataTransaction({ kind: 'backup-restore', changes: planned.changes, evidence: planned.evidence, rollbackOnError: true });
    return NextResponse.json({ restored: { config: true } });
  }

  return NextResponse.json(
    { error: 'Unrecognized backup format' },
    { status: 400 },
  );
}), 'Failed to restore backup');

function validateContentSections(body: FamilyRestoreContent): string | null {
  const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');
  if (body.chores !== undefined && (!record(body.chores) || !Array.isArray(body.chores.chores)
    || body.chores.chores.some((chore) => !record(chore) || typeof chore.id !== 'string' || !stringArray(chore.assigneeIds)
      || (chore.schedule !== undefined && (!record(chore.schedule) || Object.values(chore.schedule).some((days) => !Array.isArray(days) || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6))))))) return 'Chore data needs valid chores and assignee lists.';
  if (body.choreCompletions !== undefined && (!record(body.choreCompletions) || !Array.isArray(body.choreCompletions.completions)
    || body.choreCompletions.completions.some((entry) => !record(entry) || typeof entry.choreId !== 'string' || typeof entry.memberId !== 'string' || typeof entry.date !== 'string'))) return 'Chore history needs valid completion entries.';
  if (body.rewards !== undefined && (!record(body.rewards) || !Array.isArray(body.rewards.rewards) || !record(body.rewards.balances) || !Array.isArray(body.rewards.redemptions)
    || Object.values(body.rewards.balances).some((value) => typeof value !== 'number' || !Number.isFinite(value))
    || body.rewards.rewards.some((reward) => !record(reward) || typeof reward.id !== 'string' || typeof reward.name !== 'string' || !stringArray(reward.memberIds) || typeof reward.cost !== 'number' || !Number.isFinite(reward.cost))
    || body.rewards.redemptions.some((redemption) => !record(redemption) || typeof redemption.redeemedAt !== 'string'))) return 'Rewards need valid choices, balances and history.';
  if (body.meals !== undefined && (!record(body.meals) || !Array.isArray(body.meals.savedMeals) || !Array.isArray(body.meals.plan)
    || (body.meals.groceryChecked !== undefined && !stringArray(body.meals.groceryChecked))
    || body.meals.savedMeals.some((meal) => !record(meal) || typeof meal.id !== 'string' || typeof meal.name !== 'string')
    || body.meals.plan.some((meal) => !record(meal) || (typeof meal.date !== 'string' && typeof meal.day !== 'number')))) return 'Meals need valid saved meals and a plan.';
  if (body.routines !== undefined) {
    if (!record(body.routines)) return 'Routines must be an object.';
    const error = validateRoutines(body.routines.routines);
    if (error) return error;
  }
  return null;
}
