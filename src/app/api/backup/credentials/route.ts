import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, parseJsonBody, getClientIP, SMALL_BODY_BYTES } from '@/lib/api-utils';
import { isAuthEnabled } from '@/lib/auth';
import { collectCredentials } from '@/lib/backup-credentials';
import { encryptCredentials } from '@/lib/backup-crypto';
import { audit } from '@/lib/audit';
import {
  MIN_PASSPHRASE_LENGTH,
  type CredentialEnvelope,
} from '@/lib/backup-credentials-types';

export const dynamic = 'force-dynamic';

/**
 * Build the credential section of a backup bundle. The editor calls this only
 * when the user has ticked "include my keys and accounts", then merges the
 * result into the bundle from `GET /api/backup` before writing the download.
 *
 * Why a separate POST rather than a flag on `GET /api/backup`:
 *  - the passphrase must not travel in a URL (browser history, proxy logs),
 *  - and `GET /api/backup` stays credential-free, so nothing that already
 *    polls it silently starts emitting secrets.
 *
 * With no passphrase the envelope is plaintext — a deliberate, warned-about
 * choice in the UI, not an accident.
 */
export const POST = withAuth(async (request: NextRequest) => {
  // `withAuth` is not enough here. `requireSession` returns early when no
  // editor password is set (lib/auth.ts, `// auth disabled`), which is the
  // default — so on a stock install this route would hand every API key,
  // iCloud app password, OAuth refresh token and data/auth.json to any client
  // on the network, unauthenticated.
  //
  // That is worse in kind than the rest of the surface a password-less install
  // already exposes: this is the only route that returns raw secret VALUES
  // (/api/secrets returns booleans, /api/icloud/accounts strips passwords),
  // and the refresh tokens in it keep working from anywhere on the internet
  // long after the attacker has left the network.
  //
  // There is no way to secure this for an install with no password — nothing
  // distinguishes the owner from anyone else on the LAN — so it requires one.
  if (!(await isAuthEnabled())) {
    audit({ action: 'credential_backup_denied', ip: getClientIP(request) });
    return NextResponse.json(
      { error: 'Set an editor password before saving your keys in a backup.', code: 'editor_password_required' },
      { status: 403 },
    );
  }

  const body = await parseJsonBody<{ passphrase?: unknown }>(request, { maxBytes: SMALL_BODY_BYTES });
  if (body instanceof NextResponse) return body;

  const passphrase = typeof body.passphrase === 'string' ? body.passphrase : '';
  if (passphrase && passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return NextResponse.json(
      { error: `The backup password must be at least ${MIN_PASSPHRASE_LENGTH} characters.`, code: 'passphrase_too_short' },
      { status: 400 },
    );
  }

  const payload = await collectCredentials();
  const sections = Object.keys(payload).length;

  const envelope: CredentialEnvelope = passphrase
    ? await encryptCredentials(payload, passphrase)
    : { encrypted: false, data: payload };

  audit({ action: 'credential_backup_export', encrypted: !!passphrase, sections });

  return NextResponse.json(envelope, {
    headers: { 'Cache-Control': 'no-store' },
  });
}, 'Failed to export credentials');
