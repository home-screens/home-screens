import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readBackupState, writeBackupState } from '@/lib/backup-state';
import { withAuth, withDisplayAuth, parseJsonBody, SMALL_BODY_BYTES } from '@/lib/api-utils';
import { readConfigCached } from '@/lib/config-cache';
import { readAutoBackupState } from '@/lib/auto-backup-state';
import { autoBackupReminder } from '@/lib/backup-reminder-auto';

export const dynamic = 'force-dynamic';

/**
 * The manual backup's dates, plus `auto`: whether automatic backups are
 * working, and when a copy last left the hub (see `backup-reminder-auto.ts`).
 */
export const GET = withDisplayAuth(async () => {
  const [state, config, autoState] = await Promise.all([readBackupState(), readConfigCached(), readAutoBackupState()]);
  return NextResponse.json({
    ...state,
    auto: autoBackupReminder(config.settings?.autoBackup?.enabled === true, autoState),
  });
}, 'Failed to read backup state');

// Only the editor and the phone dismiss the reminder or record a backup, so a
// wall's display token must not be able to silence it.
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ action?: unknown }>(request, { maxBytes: SMALL_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  const { action } = body;
  const state = await readBackupState();

  if (action === 'dismiss') {
    state.lastDismissedDate = new Date().toISOString();
    await writeBackupState(state);
    return NextResponse.json(state);
  }

  if (action === 'backed-up') {
    state.lastBackupDate = new Date().toISOString();
    state.lastDismissedDate = null;
    await writeBackupState(state);
    return NextResponse.json(state);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}, 'Failed to update backup state');
