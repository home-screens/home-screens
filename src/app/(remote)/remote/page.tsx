import { readConfig } from '@/lib/config';
import { readChoreData } from '@/lib/chore-data';
import { getDisplayProfiles } from '@/lib/display-filter';
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
  const displays = (config.displays ?? []).map((d) => ({ id: d.id, name: d.name }));

  // Per-display resolved profile pools. `getDisplayProfiles` applies the
  // owned → global precedence, matching the server-side
  // `/api/display/profile` validator so the picker can never show an option
  // the API would reject. `activeProfile` falls back to the global setting
  // only when the display hasn't pinned its own.
  const displayProfiles: Record<
    string,
    { profiles: Array<{ id: string; name: string }>; activeProfile?: string }
  > = {};
  for (const d of config.displays ?? []) {
    displayProfiles[d.id] = {
      profiles: getDisplayProfiles(d, config.profiles).map((p) => ({ id: p.id, name: p.name })),
      activeProfile: d.activeProfile ?? config.settings.activeProfile,
    };
  }

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
          weekStartDay: (modConfig?.weekStartDay as 'sunday' | 'monday') ?? 'monday',
          showPoints: (modConfig?.showPoints as boolean) ?? true,
          showStreaks: (modConfig?.showStreaks as boolean) ?? true,
          showTimeOfDay: (modConfig?.showTimeOfDay as boolean) ?? true,
          allowDisplayComplete: true, // always allow on phone — display toggle is kiosk-only
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

  const backupReminder = {
    enabled: config.settings.backupReminder?.enabled ?? false,
    intervalDays: config.settings.backupReminder?.intervalDays ?? 7,
  };
  const updateNotification = {
    enabled: config.settings.updateNotification?.enabled ?? false,
  };
  const updateChannel: 'stable' | 'dev' =
    config.settings.updateChannel === 'dev' ? 'dev' : 'stable';

  return (
    <RemoteClient
      initialData={{ screens, profiles, activeProfile, choreConfig, choreData, hasMeals, hasPhotos, photoDirectory, backupReminder, displays, displayProfiles, updateNotification, updateChannel }}
    />
  );
}
