import { readConfig } from '@/lib/config';
import { readChoreData } from '@/lib/chore-data';
import type { ChoreChartConfig } from '@/types/config';
import ChoresTab from '../remote/components/ChoresTab';
import ChoresEmptyState from './ChoresEmptyState';

export const dynamic = 'force-dynamic';

export default async function ChoresPage() {
  const config = await readConfig();

  // Find display settings from the first chore module in config
  let modConfig: Record<string, unknown> | null = null;
  for (const screen of config.screens) {
    for (const mod of screen.modules) {
      if (mod.type === 'chore-chart' || mod.type === 'fullscreen-chore-chart') {
        modConfig = mod.config;
        break;
      }
    }
    if (modConfig) break;
  }

  // Show chores page whenever a chore module exists (even with empty data)
  // so users can manage members/chores from mobile
  const choreData = await readChoreData();
  const choreConfig: ChoreChartConfig | null =
    modConfig !== null
      ? {
          ...choreData,
          weekStartDay: (modConfig?.weekStartDay as 'sunday' | 'monday') ?? 'monday',
          showPoints: (modConfig?.showPoints as boolean) ?? true,
          showStreaks: (modConfig?.showStreaks as boolean) ?? true,
          showTimeOfDay: (modConfig?.showTimeOfDay as boolean) ?? true,
          allowDisplayComplete: true, // always allow on phone — display toggle is kiosk-only
          accentColor: (modConfig?.accentColor as string) ?? '#f59e0b',
          view: 'board',
        }
      : null;

  if (!choreConfig) {
    return <ChoresEmptyState />;
  }

  return (
    <div className="min-h-screen bg-hs-body">
      <ChoresTab config={choreConfig} />
    </div>
  );
}
