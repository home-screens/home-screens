import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, parseJsonBody, getClientIP, SMALL_BODY_BYTES } from '@/lib/api-utils';
import { isAuthEnabled } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { MIN_PASSPHRASE_LENGTH } from '@/lib/backup-credentials-types';
import { updateAutoBackupSecrets } from '@/lib/auto-backup-secrets';
import { startOffsiteRecord } from '@/lib/auto-backup-state';
import { MAX_SECRET_FIELD, destinationFromBody, isDestinationRefusal } from '@/lib/auto-backup-destination';
import { destinationPlace, destinationSummary } from '@/lib/storage-destination';

export const dynamic = 'force-dynamic';

interface SecretsBody {
  /** A new backup password, or null to forget the saved one. Absent leaves it alone. */
  backupPassword?: unknown;
  /** The storage folder (a WebDAV folder or a network share), or null to stop sending. Absent leaves it alone. */
  destination?: unknown;
}

/**
 * Set or clear what automatic backups keep secret: the backup password and
 * the storage folder. Saved the moment the button is pressed, never through
 * the editor's config or its undo history, and never sent back.
 */
export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<SecretsBody>(request, { maxBytes: SMALL_BODY_BYTES });
  if (body instanceof NextResponse) return body;

  if (typeof body.backupPassword === 'string') {
    // The same rule as keys in a downloaded backup (see the credentials
    // route): with no editor password, anyone on the network could switch
    // the keys on and pick where the copies go.
    if (!(await isAuthEnabled())) {
      audit({ action: 'credential_backup_denied', ip: getClientIP(request) });
      return NextResponse.json(
        { error: 'Set an editor password before saving your keys in a backup.', code: 'editor_password_required' },
        { status: 403 },
      );
    }
    if (body.backupPassword.length < MIN_PASSPHRASE_LENGTH || body.backupPassword.length > MAX_SECRET_FIELD) {
      return NextResponse.json(
        { error: `The backup password must be at least ${MIN_PASSPHRASE_LENGTH} characters.`, code: 'passphrase_too_short' },
        { status: 400 },
      );
    }
  } else if (body.backupPassword !== undefined && body.backupPassword !== null) {
    return NextResponse.json({ error: 'backupPassword must be text or null.' }, { status: 400 });
  }

  let destinationChanged = false;
  let refusal = null as NextResponse | null;
  const secrets = await updateAutoBackupSecrets((current) => {
    const next = { ...current };
    if (typeof body.backupPassword === 'string') next.backupPassword = body.backupPassword;
    else if (body.backupPassword === null) delete next.backupPassword;
    if (body.destination === null) {
      destinationChanged = !!current.destination;
      delete next.destination;
    } else if (body.destination !== undefined) {
      const dest = destinationFromBody(body.destination, current.destination);
      if (isDestinationRefusal(dest)) {
        refusal = NextResponse.json(dest, { status: 400 });
        return current;
      }
      destinationChanged = !current.destination || destinationPlace(current.destination) !== destinationPlace(dest);
      next.destination = dest;
    }
    return next;
  });
  if (refusal) return refusal;

  if (body.backupPassword !== undefined) audit({ action: 'auto_backup_password', change: body.backupPassword === null ? 'removed' : 'set' });
  if (body.destination !== undefined) {
    audit({
      action: 'auto_backup_destination',
      change: body.destination === null ? 'removed' : 'set',
      ...(secrets.destination && body.destination !== null ? { kind: secrets.destination.kind } : {}),
    });
  }
  // A new folder starts with a clean slate: the old one's files are not
  // there to remove, and its last failure is not this folder's.
  if (destinationChanged) await startOffsiteRecord();

  return NextResponse.json({
    hasBackupPassword: !!secrets.backupPassword,
    destination: secrets.destination ? destinationSummary(secrets.destination) : null,
  });
}, 'Failed to save the backup settings');
