import { readConfig } from '@/lib/config';
import { readChoreData } from '@/lib/chore-data';
import { getAllScreens, getDisplayProfiles } from '@/lib/display-filter';
import { resolveChoreModuleConfig } from '@/lib/chore-module-config';
import RemoteClient from './RemoteClient';

const MEAL_MODULE_TYPES = ['meal-planner', 'fullscreen-meal-planner'];
const PHOTO_MODULE_TYPES = ['fullscreen-photo'];

export const dynamic = 'force-dynamic';

export default async function RemotePage() {
  const config = await readConfig();

  // Fallback flat list, used only in legacy single-display mode. In
  // multi-display mode `displayScreens` below is authoritative, because the
  // rotation index this list is indexed by is per-display.
  const screens = getAllScreens(config)
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

  // Per-display screen lists. The remote resolves a screen *name* from the
  // rotation index reported by a specific display's heartbeat, so the lookup
  // has to use that display's own screens — a flat list across displays would
  // resolve the wrong name at the same index.
  const displayScreens: Record<string, Array<{ id: string; name: string }>> = {};
  for (const d of config.displays ?? []) {
    displayScreens[d.id] = d.screens
      .filter((s) => s.enabled !== false)
      .map((s) => ({ id: s.id, name: s.name }));
  }

  // Read shared chore data; assemble a ChoreChartConfig-compatible object.
  // Show chores tab whenever a chore module exists on any display (even with
  // empty data) so users can manage members/chores from mobile.
  const choreData = await readChoreData();
  const choreConfig = resolveChoreModuleConfig(config);

  // Detect meal and photo modules across every display.
  const allScreens = getAllScreens(config);

  const hasMeals = allScreens.some((s) =>
    s.modules.some((m) => MEAL_MODULE_TYPES.includes(m.type)),
  );

  let photoDirectory = '';
  let hasPhotos = false;
  for (const screen of allScreens) {
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
      initialData={{ screens, displayScreens, profiles, activeProfile, choreConfig, choreData, hasMeals, hasPhotos, photoDirectory, backupReminder, displays, displayProfiles, updateNotification, updateChannel }}
    />
  );
}
