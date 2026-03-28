import { runRollback, isUpgradeRunning } from '@/lib/upgrade';
import { createTagActionRoute } from '@/lib/route-factories';

export const dynamic = 'force-dynamic';

export const POST = createTagActionRoute(runRollback, {
  busyCheck: isUpgradeRunning,
  verb: 'Rollback',
  errorMsg: 'Rollback failed',
});
