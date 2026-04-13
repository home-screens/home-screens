import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import {
  getPendingRollback,
  confirmRollback,
  uninhibitWatchdog,
} from '@/lib/network-commands';
import { validateUUID } from '@/lib/network-validation';

export const dynamic = 'force-dynamic';

/* ─── GET: Check rollback status ────────────── */

export const GET = withAuth(async () => {
  const pending = getPendingRollback();

  if (!pending) {
    return NextResponse.json({ pending: false });
  }

  return NextResponse.json({
    pending: true,
    rollbackId: pending.id,
    remainingMs: pending.timeoutMs,
  });
}, 'Failed to check rollback status');

/* ─── POST: Confirm network change ─────────── */

export const POST = withAuth(async (request: NextRequest) => {
  let body: { rollbackId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { rollbackId } = body;

  // 1. Validate rollback ID
  const uuidResult = validateUUID(rollbackId);
  if (!uuidResult.valid) {
    return NextResponse.json({ error: uuidResult.error }, { status: 400 });
  }

  // 2. Confirm the rollback (cancels the auto-revert timer)
  const confirmed = confirmRollback(rollbackId);

  if (!confirmed) {
    return NextResponse.json(
      { ok: false, error: 'No matching pending rollback' },
      { status: 404 },
    );
  }

  // 3. Uninhibit the watchdog now that the change is confirmed
  await uninhibitWatchdog();

  return NextResponse.json({ ok: true });
}, 'Failed to confirm network change');
