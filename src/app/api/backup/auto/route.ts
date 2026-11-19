import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { runAutoBackup } from '@/lib/auto-backup-run';
import { readAutoBackupStatus } from '@/lib/auto-backup-status';

export const dynamic = 'force-dynamic';

/**
 * Automatic backups for Settings > Backups & data: the last run, the next
 * one, the copies kept on the hub, and what is set up. Never a password or
 * the download link's token.
 */
export const GET = withAuth(async () => {
  return NextResponse.json(await readAutoBackupStatus(), { headers: { 'Cache-Control': 'no-store' } });
}, 'Failed to read automatic backups');

/**
 * "Back up now": one run, answered once it has finished (a backup with
 * pictures can take a while). A failed run is still a 200: the status says
 * what went wrong, the same way a scheduled failure is shown.
 */
export const POST = withAuth(async () => {
  const outcome = await runAutoBackup({ reason: 'manual' });
  if (!outcome.ran) {
    return NextResponse.json(
      outcome.reason === 'busy'
        ? { error: 'A backup is being saved right now. Try again in a moment.', code: 'busy' }
        : { error: 'An update is being installed. Try again when it has finished.', code: 'updating' },
      { status: 409 },
    );
  }
  return NextResponse.json(await readAutoBackupStatus());
}, 'Failed to save a backup');
