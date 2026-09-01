import type { ScreenConfiguration } from '@/types/config';
import { editorFetch } from '@/lib/editor-fetch';
import {
  findMainDisplay,
  validateAllSchedules,
  validateDisplays,
} from '@/lib/display-filter';
import { getActiveScreens } from '@/lib/editor-multi-display';
import { appendHistoryEntry, createPendingResave } from '@/stores/editor-save';
import { syncEditorUrl } from '@/stores/editor-url';
import { CONFIG_REVISION_HEADER } from '@/lib/config-revision';
import { logger } from '@/lib/logger';
import type { ConfigActions, EditorGet, EditorSet, SaveConflict, SaveErrorKind } from './types';

const log = logger('editor-store');

/** What `saveConfig` throws; the catch block turns it into store state. */
interface SaveFailure extends Error {
  saveDetail?: string;
  saveKind?: SaveErrorKind;
  saveConflict?: SaveConflict;
}

function saveFailure(message: string, extra: Omit<SaveFailure, keyof Error>): SaveFailure {
  return Object.assign(new Error(message), extra);
}

/** The revision header off a response (tolerant of minimal test doubles). */
function readRevision(res: Response): string | null {
  return res.headers?.get?.(CONFIG_REVISION_HEADER) ?? null;
}

/** Load, save, and whole-config import. */
export function createConfigSlice(set: EditorSet, get: EditorGet): ConfigActions {
  return {
    loadConfig: async () => {
      try {
        const res = await editorFetch('/api/config');
        if (!res.ok) throw new Error(`Load failed: ${res.status}`);
        const config: ScreenConfiguration = await res.json();
        if (!config.screens) throw new Error('Invalid config');
        const configRevision = readRevision(res);

        // Restore which display the editor was operating on from the URL.
        // Multi-display: default to 'main' when it exists, otherwise the first
        // display in the list. Single-display: null (legacy behavior).
        const params = new URLSearchParams(window.location.search);
        const displayParam = params.get('display');
        let selectedDisplayId: string | null = null;
        if (config.displays && config.displays.length > 0) {
          const fromUrl = displayParam && config.displays.find((d) => d.id === displayParam);
          selectedDisplayId = fromUrl
            ? fromUrl.id
            : findMainDisplay(config.displays)?.id
              ?? config.displays[0]!.id;
        }

        // Pick the selected screen from the active display's list.
        const activeScreens = getActiveScreens(config, selectedDisplayId);
        const screenParam = params.get('screen');
        const restoredScreen = screenParam && activeScreens.find((s) => s.id === screenParam);
        set({
          config,
          configRevision,
          configGeneration: get().configGeneration + 1,
          saveConflict: null,
          saveError: null,
          saveErrorKind: null,
          selectedDisplayId,
          selectedScreenId: restoredScreen ? restoredScreen.id : activeScreens[0]?.id ?? null,
          selectedModuleId: null,
          isDirty: false,
          _past: [],
          _future: [],
          _lastHistoryTime: 0,
          _lastHistoryActionKey: '',
        });
      } catch (err) {
        log.error('Failed to load config:', err);
      }
    },

    saveConfig: async () => {
      const state = get();
      const { config, isSaving } = state;
      if (!config) return;
      // A refused save waits on the user (Load theirs / Keep mine); retrying
      // meanwhile would be refused again and replace the version they are
      // looking at. resolveSaveConflict clears the flag before it saves.
      if (state.saveConflict) return;
      // Coalesce concurrent saves: if one is already in flight, return a
      // deferred promise that resolves when the *next* save run completes.
      // Multiple coalesced callers share a single deferred so they all
      // settle together on the same re-save. The in-flight save's `finally`
      // recursively invokes `saveConfig()` and chains its outcome onto the
      // deferred — preserving the contract that `await saveConfig()` blocks
      // until the caller's mutation has actually landed on disk (relied on
      // by every modal that closes after save and the settings auto-save
      // toast that paints "Saved" only after persistence completes).
      if (isSaving) {
        if (state._pendingResave) return state._pendingResave.promise;
        const pending = createPendingResave();
        set({ _pendingResave: pending });
        return pending.promise;
      }
      const configSnapshot = config;
      const sentRevision = state.configRevision;
      set({ isSaving: true, saveError: null, saveErrorKind: null });
      try {
        // Pre-validate with the SAME validators the config route runs, in the
        // same order. Auto-save fires 800ms after any edit, so a transiently
        // invalid state (e.g. a just-added visibility condition with an empty
        // key) would otherwise PUT a guaranteed 400 on every keystroke pause.
        // Failing here skips the pointless network call; the editor panel is
        // already showing the matching inline error.
        const invalid = validateDisplays(configSnapshot) ?? validateAllSchedules(configSnapshot);
        if (invalid) {
          throw saveFailure(invalid, { saveDetail: invalid, saveKind: 'validation' });
        }
        let res: Response;
        try {
          res = await editorFetch('/api/config', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              // Compare-and-swap: the hub refuses (409) if the config changed
              // since this revision was loaded, instead of clobbering it.
              ...(sentRevision ? { [CONFIG_REVISION_HEADER]: sentRevision } : {}),
            },
            body: JSON.stringify(configSnapshot),
          });
        } catch (err) {
          // editorFetch already redirected on 401; anything else thrown here
          // is the network (hub down, Wi-Fi dropped, wrong address).
          throw saveFailure(err instanceof Error ? err.message : 'Network error', { saveKind: 'network' });
        }
        if (!res.ok) {
          // Surface the server validator's message (e.g. which module has a bad
          // visibility condition) instead of a generic failure; network errors
          // and non-JSON bodies keep the generic string below.
          let detail: string | null = null;
          let theirs: ScreenConfiguration | null = null;
          try {
            const body = await res.json();
            if (body && typeof body.error === 'string' && body.error) detail = body.error;
            if (res.status === 409 && body && Array.isArray(body.config?.screens)) theirs = body.config;
          } catch { /* non-JSON error body */ }
          const theirRevision = readRevision(res);
          if (res.status === 409 && theirs && theirRevision) {
            throw saveFailure(detail ?? 'Changed somewhere else', {
              saveKind: 'conflict',
              saveConflict: { theirs, revision: theirRevision },
            });
          }
          throw saveFailure(detail ?? `Save failed: ${res.status}`, {
            saveDetail: detail ?? undefined,
            saveKind: res.status === 400 ? 'validation' : 'server',
          });
        }
        // Only clear dirty if no new changes occurred during save
        const { config: current } = get();
        set({
          isSaving: false,
          isDirty: current !== configSnapshot,
          saveError: null,
          saveErrorKind: null,
          saveConflict: null,
          configRevision: readRevision(res) ?? sentRevision,
        });
      } catch (err) {
        const failure = err as SaveFailure;
        const detail = failure?.saveDetail;
        set({
          isSaving: false,
          saveError: detail ?? 'Failed to save',
          saveErrorKind: failure?.saveKind ?? 'server',
          ...(failure?.saveConflict ? { saveConflict: failure.saveConflict } : {}),
        });
        // Validation failures (client pre-check or server 400) and conflicts
        // are expected editing states surfaced in the toolbar — warn, don't
        // error, so the Next.js dev overlay only interrupts for unexpected
        // failures.
        if (detail || failure?.saveConflict) log.warn('Config not saved:', failure.message);
        else log.error('Failed to save config:', err);
        throw err;
      } finally {
        // Hand off to the queued re-save (if any). Tying the recursive
        // `saveConfig()` to `pending.resolve`/`pending.reject` settles the
        // deferred when the run that includes the coalesced caller's
        // mutation actually completes — propagating both success and
        // failure correctly. Using a microtask means observers of the
        // just-completed save see `isSaving === false` first, then the
        // next save kicks off — avoids spurious "saving → saving" flicker
        // without the observer ever seeing "saved".
        const pending = get()._pendingResave;
        if (pending) {
          set({ _pendingResave: null });
          queueMicrotask(() => {
            get().saveConfig().then(pending.resolve, pending.reject);
          });
        }
      }
    },

    resolveSaveConflict: async (choice) => {
      const state = get();
      const conflict = state.saveConflict;
      if (!conflict || !state.config) return;
      if (choice === 'mine') {
        // Overwrite exactly the version we were shown; if the hub moved on
        // again in the meantime, the next save conflicts again.
        set({ configRevision: conflict.revision, saveConflict: null, saveError: null, saveErrorKind: null });
        await get().saveConfig();
        return;
      }
      // Take theirs. The local version goes on the undo stack so one Undo
      // brings it back (and re-saves it over theirs, which is then the
      // user's explicit choice).
      const theirs = conflict.theirs;
      const newPast = appendHistoryEntry(state._past, { ...state, config: state.config });
      const displays = theirs.displays ?? [];
      const selectedDisplayId = displays.length === 0
        ? null
        : displays.some((d) => d.id === state.selectedDisplayId)
          ? state.selectedDisplayId
          : findMainDisplay(displays)?.id ?? displays[0]!.id;
      const activeScreens = getActiveScreens(theirs, selectedDisplayId);
      const selectedScreenId = activeScreens.some((s) => s.id === state.selectedScreenId)
        ? state.selectedScreenId
        : activeScreens[0]?.id ?? null;
      set({
        config: theirs,
        configRevision: conflict.revision,
        configGeneration: state.configGeneration + 1,
        selectedDisplayId,
        selectedScreenId,
        selectedModuleId: null,
        isDirty: false,
        saveError: null,
        saveErrorKind: null,
        saveConflict: null,
        _past: newPast,
        _future: [],
        _lastHistoryTime: 0,
        _lastHistoryActionKey: '',
      });
      if (selectedScreenId !== state.selectedScreenId || selectedDisplayId !== state.selectedDisplayId) {
        syncEditorUrl({ screen: selectedScreenId, display: selectedDisplayId });
      }
    },

    importConfig: (json, revision) => {
      const parsed = JSON.parse(json) as ScreenConfiguration;
      if (!parsed.screens || !Array.isArray(parsed.screens) || !parsed.settings) {
        throw new Error('Invalid config file: missing screens or settings');
      }
      const state = get();
      let newPast = state._past;
      if (state.config) {
        newPast = appendHistoryEntry(state._past, { ...state, config: state.config });
      }
      const nextDisplayId = findMainDisplay(parsed.displays)?.id ?? null;
      const activeScreens = getActiveScreens(parsed, nextDisplayId);
      const firstId = activeScreens[0]?.id ?? null;
      set({
        config: parsed,
        ...(revision ? { configRevision: revision } : {}),
        configGeneration: state.configGeneration + 1,
        saveConflict: null,
        selectedDisplayId: nextDisplayId,
        selectedScreenId: firstId,
        selectedModuleId: null,
        isDirty: true, saveError: null, saveErrorKind: null,
        _past: newPast, _future: [], _lastHistoryTime: 0, _lastHistoryActionKey: '',
      });
      if (firstId) {
        syncEditorUrl({ screen: firstId });
      }
    },
  };
}
