import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { settleTodoMigration } from '@/lib/todo-data';
import { writeBackupState } from '@/lib/backup-state';
import { withAuth, parseJsonBody, getClientIP } from '@/lib/api-utils';
import { newerSchemaProblem, validateConfigForWrite } from '@/lib/config-validation';
import { planCredentialRestore } from '@/lib/backup-credentials';
import { withFamilyData } from '@/lib/family-api';
import { planFamilyRestore } from '@/lib/family-import';
import { BACKUP_SECTIONS, type BackupContent } from '@/lib/backup-sections';
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
import { planCustomIconRestore, readCustomIcons, sweepCustomIconFiles, verifyCustomIconBackup } from '@/lib/custom-icon-data';
import { missingCustomIconIds } from '@/lib/custom-icon-usage';
import type { ScreenConfiguration } from '@/types/config';

export const dynamic = 'force-dynamic';

// GET: export a full backup bundle, one field per section in BACKUP_SECTIONS.
export const GET = withAuth(async () => withFamilyData(async () => {
  // The fold rewrites config.json, so let it finish before the reads below:
  // in parallel the very first export after an upgrade could pair a
  // pre-fold config with post-fold lists and back up neither faithfully.
  await settleTodoMigration();
  const sections = await Promise.all(BACKUP_SECTIONS.map(async (section) => [section.key, await section.read()] as const));

  const bundle = {
    _type: 'home-screens-backup',
    // v2 adds the optional `credentials` section. A v2 bundle without that
    // section is byte-identical in effect to v1, and v1 bundles still restore.
    _version: 2,
    _createdAt: new Date().toISOString(),
    // A section whose store has nothing saved reads as null and is left out,
    // so a restore does not create its file.
    ...Object.fromEntries(sections.filter(([, value]) => value !== null)),
  };

  // Record backup timestamp before releasing the snapshot lock; write both fields directly
  // to avoid a read-modify-write race with concurrent dismiss POSTs
  await writeBackupState({
    lastBackupDate: new Date().toISOString(),
    lastDismissedDate: null,
  }).catch(() => {});

  return NextResponse.json(bundle);
}), 'Failed to create backup');

// Fields a restore bundle may carry beyond its content sections.
// screens/settings let the legacy config-only format be recognized before it
// is written as a full ScreenConfiguration.
interface RestoreBundle extends BackupContent {
  _type?: unknown;
  /**
   * Transient: the password for an encrypted `credentials` section. Never
   * part of the bundle on disk: the editor adds it to the request body only,
   * and the handler strips it before anything else touches the object.
   */
  _passphrase?: unknown;
  credentials?: unknown;
  /**
   * Optional: the family's own icons, when the export left them in. Not a
   * content section: the pictures come as base64 and are checked and written
   * by the icon store itself, and `GET /api/backup/custom-icons` is where
   * they are exported from.
   */
  customIcons?: unknown;
  screens?: unknown;
  settings?: unknown;
}

// Restore is planned completely before publication. Content, credentials and
// any legacy folds share a durable journal; handled failures record rollback
// before restoring before-images, and a restart resumes the saved decision.
// 100 MB: a full icon library is 60 MB of pictures, a third more as base64.
const MAX_RESTORE_BYTES = 100 * 1024 * 1024;

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

// Everything up to the plan runs outside the data lock: the body can be
// 25 MB over a phone's Wi-Fi, and every display poll queues behind the lock
// while it is held. Validation and decryption read only the body, so no
// current source is consulted before the replacement has been checked; a good
// full backup must be able to repair corrupt files it replaces. Pending
// journals recover when the lock is taken for the plan and commit.
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<RestoreBundle>(request, {
    maxBytes: MAX_RESTORE_BYTES,
  });
  if (body instanceof NextResponse) return body;

  // New bundle format
  if (body._type === 'home-screens-backup') {
    // Strip the transient passphrase before anything else reads the body, so
    // it can't be snapshotted, logged, or written to disk by accident.
    const passphrase = typeof body._passphrase === 'string' ? body._passphrase : undefined;
    delete body._passphrase;

    // Every section is written whole, and a malformed one would break every
    // read after the restore, so each is held to the rule its own save
    // route applies.
    for (const section of BACKUP_SECTIONS) {
      if (body[section.key] === undefined) continue;
      const error = section.validate(body[section.key]);
      if (error) return NextResponse.json({ error }, { status: 400 });
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

    // A bundle without the section leaves the library alone: a small backup
    // restored on the same device must not cost it its icons.
    const icons = body.customIcons === undefined ? null : await verifyCustomIconBackup(body.customIcons);
    if (typeof icons === 'string') return NextResponse.json({ error: icons }, { status: 400 });
    const clientIp = getClientIP(request);
    const credentialResult = await withDataTransaction(async () => {
      const planned = await planFamilyRestore(body);
      let result: CredentialApplyResult | null = null;
      if (credentialPayload) {
        const credentials = await planCredentialRestore(credentialPayload, clientIp);
        planned.changes.push(...credentials.changes);
        result = credentials.result;
      }
      if (icons) {
        const change = await planCustomIconRestore(icons);
        if (change) planned.changes.push(change);
      }
      await commitDataTransaction({ kind: 'backup-restore', changes: planned.changes, evidence: planned.evidence, rollbackOnError: true });
      return result;
    });
    if (credentialResult) audit({ action: 'credential_backup_restore', sections: credentialResult.applied.length, skipped: credentialResult.skipped });
    if (icons) await sweepCustomIconFiles().catch(() => {});
    // Restored meals, chores and screens that point at icons this device does
    // not have show a standard picture; the family is told why. Only a backup
    // made without its icons is to blame: one that carried them restores the
    // library it was made with, and anything else it points at had already
    // been removed on purpose.
    const missingIcons = icons ? 0 : missingCustomIconIds(
      BACKUP_SECTIONS.map((section) => body[section.key]),
      new Set((await readCustomIcons()).map((icon) => icon.id)),
    ).length;

    return NextResponse.json({
      restored: {
        ...Object.fromEntries(BACKUP_SECTIONS.map((section) => [section.key, body[section.key] !== undefined])),
        customIcons: !!icons,
      },
      missingIcons,
      // Present only when the bundle carried credentials. The editor needs
      // `applied` to know whether the session it is holding just died (auth),
      // and `skipped` to tell the user what the lockout guard held back.
      ...(credentialResult ? { credentials: credentialResult } : {}),
    });
  }

  // Legacy format: raw ScreenConfiguration object
  if (body.screens && Array.isArray(body.screens) && body.settings) {
    const err = validateConfigForWrite(body) ?? newerSchemaProblem(body);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    await withDataTransaction(async () => {
      const planned = await planFamilyRestore({ config: body as unknown as ScreenConfiguration });
      await commitDataTransaction({ kind: 'backup-restore', changes: planned.changes, evidence: planned.evidence, rollbackOnError: true });
    });
    return NextResponse.json({ restored: { config: true } });
  }

  return NextResponse.json(
    { error: 'Unrecognized backup format' },
    { status: 400 },
  );
}, 'Failed to restore backup');
