import { NextResponse } from 'next/server';
import { runUpgrade, isUpgradeRunning, isDeploying, cancelUpgrade } from '@/lib/upgrade';
import { withAuth } from '@/lib/api-utils';
import { createTagActionRoute } from '@/lib/route-factories';

export const dynamic = 'force-dynamic';

export const POST = createTagActionRoute(runUpgrade, {
  busyCheck: isUpgradeRunning,
  verb: 'Upgrade',
  errorMsg: 'Failed to start upgrade',
});

export const DELETE = withAuth(async () => {
  if (!isUpgradeRunning()) {
    return NextResponse.json(
      { error: 'No upgrade is currently running' },
      { status: 404 },
    );
  }

  if (isDeploying()) {
    return NextResponse.json(
      { error: 'Cannot cancel during deploy — the update is being installed' },
      { status: 409 },
    );
  }

  const cancelled = cancelUpgrade();
  return NextResponse.json({ ok: cancelled });
}, 'Failed to cancel upgrade');
