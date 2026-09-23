import { readConfig } from '@/lib/config';
import { readChoreSnapshot } from '@/lib/chore-data';
import { resolveChoreModuleConfig } from '@/lib/chore-module-config';
import ChoresTab from '../remote/components/ChoresTab';
import ChoresEmptyState from './ChoresEmptyState';
import CustomIconSeed from '@/components/custom-icons/CustomIconSeed';
import { readCustomIcons } from '@/lib/custom-icon-data';
import { withUrls } from '@/lib/custom-icon-http';

export const dynamic = 'force-dynamic';

export default async function ChoresPage() {
  const config = await readConfig();

  // Show chores page whenever a chore module exists on any display (even with
  // empty data) so users can manage members/chores from mobile
  const choreData = await readChoreSnapshot();
  const choreConfig = resolveChoreModuleConfig(config);
  // The kid view is open on the LAN with no credentials, so it cannot fetch
  // the icon library itself; its pictures come with the page, like the chores.
  const customIcons = await withUrls(await readCustomIcons());

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
        <CustomIconSeed icons={customIcons} />
        <ChoresTab config={choreConfig} choreData={choreData} />
      </div>
    </div>
  );
}
