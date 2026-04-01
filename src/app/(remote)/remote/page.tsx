import { readConfig } from '@/lib/config';
import { readChoreData } from '@/lib/chore-data';
import type { ChoreChartConfig } from '@/types/config';
import RemoteClient from './RemoteClient';

const MEAL_MODULE_TYPES = ['meal-planner', 'fullscreen-meal-planner'];
const PHOTO_MODULE_TYPES = ['fullscreen-photo'];

export const dynamic = 'force-dynamic';

export default async function RemotePage() {
  const config = await readConfig();

  const screens = config.screens
    .filter((s) => s.enabled !== false)
    .map((s) => ({ id: s.id, name: s.name }));
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
  // Show chores tab whenever a chore module exists (even with empty data) so
  // users can manage members/chores from mobile
  const choreData = await readChoreData();
  const choreConfig: ChoreChartConfig | null =
    modConfig !== null
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

  // Detect if any meal planner module exists
  const hasMeals = config.screens.some((s) =>
    s.modules.some((m) => MEAL_MODULE_TYPES.includes(m.type)),
  );

  // Detect photo modules and extract directory config from the first match
  let photoDirectory = '';
  let hasPhotos = false;
  for (const screen of config.screens) {
    for (const mod of screen.modules) {
      if (PHOTO_MODULE_TYPES.includes(mod.type)) {
        photoDirectory = (mod.config.directory as string) ?? '';
        hasPhotos = true;
        break;
      }
    }
    if (hasPhotos) break;
  }

  return (
    <RemoteClient
      initialData={{ screens, profiles, activeProfile, choreConfig, hasMeals, hasPhotos, photoDirectory }}
    />
  );
}
