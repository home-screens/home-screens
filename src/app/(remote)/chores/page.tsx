import { readConfig } from '@/lib/config';
import { readChoreData } from '@/lib/chore-data';
import { resolveChoreModuleConfig } from '@/lib/chore-module-config';
import ChoresTab from '../remote/components/ChoresTab';
import ChoresEmptyState from './ChoresEmptyState';

export const dynamic = 'force-dynamic';

export default async function ChoresPage() {
  const config = await readConfig();

  // Show chores page whenever a chore module exists on any display (even with
  // empty data) so users can manage members/chores from mobile
  const choreData = await readChoreData();
  const choreConfig = resolveChoreModuleConfig(config);

  if (!choreConfig) {
    return <ChoresEmptyState />;
  }

  // Same 16px gutter /remote gives the tab, plus the phone's own safe areas so
  // nothing sits under a rounded corner or the home indicator.
  return (
    <div
      className="min-h-screen bg-hs-body"
      style={{
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
        paddingBottom: 'calc(32px + env(safe-area-inset-bottom))',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="mx-auto max-w-3xl">
        <ChoresTab config={choreConfig} choreData={choreData} />
      </div>
    </div>
  );
}
