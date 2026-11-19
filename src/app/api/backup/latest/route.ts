import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { createRateLimiter, getClientIP } from '@/lib/api-utils';
import { audit } from '@/lib/audit';
import { readAutoBackupSecrets } from '@/lib/auto-backup-secrets';
import { updateAutoBackupState } from '@/lib/auto-backup-state';
import { autoBackupPath, listAutoBackups } from '@/lib/auto-backup-files';
import { backupFileResponse } from '@/lib/backup-file-response';

export const dynamic = 'force-dynamic';

/** Wrong tokens from one address before it waits a quarter of an hour. */
const wrongTokens = createRateLimiter(10, 15 * 60_000);

const NOT_FOUND = () => NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

function tokenFrom(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim() || null;
  return request.nextUrl.searchParams.get('token');
}

/** Equal, in time that does not depend on where they differ. Hashing first makes the lengths equal. */
function sameToken(given: string, saved: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(saved).digest();
  return timingSafeEqual(a, b);
}

/**
 * The private download link: the newest automatic backup, for a NAS task, a
 * cron job or a backup server at home that runs its own schedule. No session:
 * the token is the proof, from `Authorization: Bearer` or `?token=`. The IP
 * allowlist in `src/proxy.ts` still applies.
 *
 * It only ever serves a copy that already exists. It never builds one, so it
 * cannot be used to make the hub work or to mint a fresh copy of the keys,
 * and any keys inside a copy are always locked with the backup password.
 * No link, a wrong token and no copy yet all look the same from outside.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const ip = getClientIP(request);
  if (wrongTokens.isLimited(ip)) {
    return NextResponse.json({ error: 'Too many tries. Wait a while and try again.' }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
  }
  const given = tokenFrom(request);
  const { linkToken } = await readAutoBackupSecrets();
  if (!given || !linkToken || !sameToken(given, linkToken)) {
    wrongTokens.recordFailure(ip);
    audit({ action: 'auto_backup_pull_denied', ip });
    return NOT_FOUND();
  }
  wrongTokens.clear(ip);
  const newest = (await listAutoBackups())[0];
  const file = newest ? autoBackupPath(newest.name) : null;
  const response = file ? await backupFileResponse(file) : null;
  if (!newest || !response) return NOT_FOUND();
  audit({ action: 'auto_backup_pulled', ip, file: newest.name });
  await updateAutoBackupState((current) => ({ ...current, lastPulledAt: new Date().toISOString() })).catch(() => {});
  return response;
}
