import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { withAuth } from '@/lib/api-utils';
import { audit } from '@/lib/audit';
import { readAutoBackupSecrets, updateAutoBackupSecrets } from '@/lib/auto-backup-secrets';
import { updateAutoBackupState } from '@/lib/auto-backup-state';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** The private download link's token, for "Show link". 404 when there is no link. */
export const GET = withAuth(async () => {
  const { linkToken } = await readAutoBackupSecrets();
  if (!linkToken) return NextResponse.json({ error: 'There is no download link.' }, { status: 404, headers: NO_STORE });
  return NextResponse.json({ token: linkToken }, { headers: NO_STORE });
}, 'Failed to read the download link');

/** Make the link, or a new one: the old one stops working straight away. */
export const POST = withAuth(async () => {
  const token = randomBytes(32).toString('base64url');
  await updateAutoBackupSecrets((current) => ({ ...current, linkToken: token }));
  await updateAutoBackupState((current) => ({ ...current, lastPulledAt: null }));
  audit({ action: 'auto_backup_link', change: 'created' });
  return NextResponse.json({ token }, { headers: NO_STORE });
}, 'Failed to make the download link');

/** Remove the link. Anything that fetched with it gets a 404 from now on. */
export const DELETE = withAuth(async () => {
  await updateAutoBackupSecrets((current) => {
    const { linkToken: _removed, ...rest } = current;
    return rest;
  });
  await updateAutoBackupState((current) => ({ ...current, lastPulledAt: null }));
  audit({ action: 'auto_backup_link', change: 'removed' });
  return NextResponse.json({ ok: true });
}, 'Failed to remove the download link');
