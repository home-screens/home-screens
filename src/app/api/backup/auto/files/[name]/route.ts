import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { audit } from '@/lib/audit';
import { autoBackupPath, removeAutoBackup } from '@/lib/auto-backup-files';
import { backupFileResponse } from '@/lib/backup-file-response';
import { summarizeBackupFile } from '@/lib/backup-contents-summary';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ name: string }>;
}

const GONE = { error: 'That backup is no longer on the hub.' };

/**
 * One copy: the file as a download, or with `?summary=1` what it holds (keys,
 * locked or not, icons, pictures) for the restore prompts. The name is
 * checked against the automatic backup names before anything on disk is
 * touched.
 */
export const GET = withAuth(async (request: NextRequest, { params }: Params) => {
  const file = autoBackupPath((await params).name);
  if (!file) return NextResponse.json(GONE, { status: 404 });
  if (request.nextUrl.searchParams.get('summary') === '1') {
    const summary = await summarizeBackupFile(file).catch(() => null);
    return summary ? NextResponse.json(summary) : NextResponse.json(GONE, { status: 404 });
  }
  return (await backupFileResponse(file)) ?? NextResponse.json(GONE, { status: 404 });
}, 'Failed to read the backup');

/** Remove one copy from the hub. Copies already sent somewhere else stay there. */
export const DELETE = withAuth(async (_request: NextRequest, { params }: Params) => {
  const { name } = await params;
  if (!(await removeAutoBackup(name))) return NextResponse.json(GONE, { status: 404 });
  audit({ action: 'auto_backup_removed', file: name });
  return NextResponse.json({ ok: true });
}, 'Failed to remove the backup');
