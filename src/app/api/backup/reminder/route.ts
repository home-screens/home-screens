import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readBackupState, writeBackupState } from '@/lib/backup-state';
import { withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async () => {
  const state = await readBackupState();
  return NextResponse.json(state);
}, 'Failed to read backup state');

export const POST = withDisplayAuth(async (request: NextRequest) => {
  const { action } = await request.json();
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
