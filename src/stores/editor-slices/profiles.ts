import { v4 as uuidv4 } from 'uuid';
import { arrayMove } from '@dnd-kit/sortable';
import type { Profile } from '@/types/config';
import {
  getActiveScreens,
  withProfiles,
  withActiveProfile,
} from '@/lib/editor-multi-display';
import { COALESCE_KEYS } from '@/stores/editor-save';
import type { EditorGet, MutateConfig, ProfileActions } from './types';

/** Profile CRUD, ordering, and activation on the active display. */
export function createProfileSlice(
  get: EditorGet,
  mutateConfig: MutateConfig,
): ProfileActions {
  return {
    addProfile: (name: string) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => {
        const newProfile: Profile = {
          id: uuidv4(),
          name,
          screenIds: getActiveScreens(config, selectedDisplayId).map((s) => s.id),
        };
        return {
          config: withProfiles(config, selectedDisplayId, (profiles) => [...profiles, newProfile]),
        };
      });
    },

    removeProfile: (id: string) => {
      const { selectedDisplayId } = get();
      // clearActiveProfile drops the removed id from the owning display's
      // activeProfile, or (in global mode) from config.settings plus every
      // sibling display, so nothing dangles for the writeConfig validator.
      mutateConfig((config) => ({
        config: withProfiles(
          config,
          selectedDisplayId,
          (profiles) => profiles.filter((p) => p.id !== id),
          { clearActiveProfile: id },
        ),
      }));
    },

    updateProfile: (id: string, updates: Partial<Profile>) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: withProfiles(config, selectedDisplayId, (profiles) =>
          profiles.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        ),
      }), { coalesce: COALESCE_KEYS.updateProfile(id) });
    },

    reorderProfiles: (fromIndex: number, toIndex: number) => {
      const { config, selectedDisplayId } = get();
      if (!config) return;
      mutateConfig(() => ({
        // Guard before arrayMove: dnd-kit's arrayMove on an empty list
        // splices `undefined` in, producing `[undefined]` in the config.
        config: withProfiles(config, selectedDisplayId, (profiles) =>
          profiles.length < 2 ? profiles : arrayMove(profiles, fromIndex, toIndex),
        ),
      }), { coalesce: COALESCE_KEYS.reorderProfiles });
    },

    setActiveProfile: (id: string | undefined) => {
      const { selectedDisplayId } = get();
      // withActiveProfile routes to display.activeProfile only when the display
      // OWNS its profile list. Shared-pool displays and legacy single-display
      // installs write to config.settings.activeProfile, which is what
      // ProfilesSection's read path checks for those cases.
      mutateConfig(
        (config) => ({ config: withActiveProfile(config, selectedDisplayId, id) }),
        { coalesce: COALESCE_KEYS.activeProfile },
      );
    },
  };
}
