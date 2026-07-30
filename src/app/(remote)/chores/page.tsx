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

  return (
    <div className="min-h-screen bg-hs-body">
      <ChoresTab config={choreConfig} choreData={choreData} />
    </div>
  );
}
