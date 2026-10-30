import { readConfig } from '@/lib/config';
import { readChoreSnapshot } from '@/lib/chore-data';
import { getAllScreens, getDisplayProfiles } from '@/lib/display-filter';
import { resolveChoreModuleConfig } from '@/lib/chore-module-config';
import { slideshowFolders } from '@/lib/media-usage';
import { isSinglePhotoMode } from '@/lib/fullscreen-photo-mode';
import RemoteClient from './RemoteClient';
import { parseUpdateChannel } from '@/lib/semver';

const MEAL_MODULE_TYPES = ['meal-planner', 'fullscreen-meal-planner'];
const PHOTO_MODULE_TYPES = ['fullscreen-photo', 'photo-slideshow'];

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
  const choreData = await readChoreSnapshot();
  const choreConfig = resolveChoreModuleConfig(config);

  // Detect meal and photo modules across every display.
  const allScreens = getAllScreens(config);

  const hasMeals = allScreens.some((s) =>
    s.modules.some((m) => MEAL_MODULE_TYPES.includes(m.type)),
  );
  const hasLists = allScreens.some((s) => s.modules.some((m) => m.type === 'todo'));
  const hasNotes = allScreens.some((s) => s.modules.some((m) => m.type === 'notes'));
  // A calendar that shows day notes, so a note written on the Notes tab's
  // Calendar page shows up on a wall.
  const hasDayNoteCalendar = allScreens.some((s) => s.modules.some((m) =>
    (m.type === 'calendar' || m.type === 'fullscreen-calendar') && (m.config as { showDayNotes?: boolean }).showDayNotes !== false));

  const hasPhotos = allScreens.some((s) => s.modules.some((m) => PHOTO_MODULE_TYPES.includes(m.type)));
  // The Photos tab opens on the first folder a wall shows. Only a slideshow
  // of the hub's own library counts: an iCloud, Immich or OneDrive one names
  // no library folder, however its `directory` was left.
  const photoDirectory = slideshowFolders(config)[0]?.folder ?? '';

  // Screens whose photos the Control tab can step through, with the module
  // types to address (a single-photo full-screen module has nothing to step).
  const slideshowScreens: Record<string, string[]> = {};
  for (const screen of allScreens) {
    const types = [...new Set(screen.modules
      .filter((m) => PHOTO_MODULE_TYPES.includes(m.type) && !(m.type === 'fullscreen-photo' && isSinglePhotoMode(m.config)))
      .map((m) => m.type))];
    if (types.length > 0) slideshowScreens[screen.id] = types;
  }

  const backupReminder = {
    enabled: config.settings.backupReminder?.enabled ?? false,
    intervalDays: config.settings.backupReminder?.intervalDays ?? 7,
  };
  const updateNotification = {
    enabled: config.settings.updateNotification?.enabled ?? false,
  };
  const updateChannel = parseUpdateChannel(config.settings.updateChannel);

  return (
    <RemoteClient
      initialData={{ screens, displayScreens, profiles, activeProfile, choreConfig, choreData, hasLists, hasNotes, hasDayNoteCalendar, hasMeals, hasPhotos, photoDirectory, slideshowScreens, backupReminder, displays, displayProfiles, updateNotification, updateChannel }}
    />
  );
}
