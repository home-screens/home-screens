import { readConfig } from '@/lib/config';
import { readChoreData } from '@/lib/chore-data';
import type { ChoreChartConfig } from '@/types/config';
import RemoteClient from './RemoteClient';

export const dynamic = 'force-dynamic';

export default async function RemotePage() {
  const config = await readConfig();

  const screens = config.screens.map((s) => ({ id: s.id, name: s.name }));
  const profiles = (config.profiles ?? []).map((p) => ({ id: p.id, name: p.name }));
  const activeProfile = config.settings.activeProfile;

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

  // Read shared chore data; assemble a ChoreChartConfig-compatible object
  const choreData = await readChoreData();
  const choreConfig: ChoreChartConfig | null =
    choreData.members.length > 0 && choreData.chores.length > 0
      ? {
          ...choreData,
          weekStartDay: (modConfig?.weekStartDay as 'sunday' | 'monday') ?? 'monday',
          showPoints: (modConfig?.showPoints as boolean) ?? true,
          showStreaks: (modConfig?.showStreaks as boolean) ?? true,
          showTimeOfDay: (modConfig?.showTimeOfDay as boolean) ?? true,
          allowDisplayComplete: (modConfig?.allowDisplayComplete as boolean) ?? true,
          accentColor: (modConfig?.accentColor as string) ?? '#f59e0b',
          view: 'board',
        }
      : null;

  return (
    <RemoteClient
      initialData={{ screens, profiles, activeProfile, choreConfig }}
    />
  );
}
