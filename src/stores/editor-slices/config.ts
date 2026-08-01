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
import { logger } from '@/lib/logger';
import type { ConfigActions, EditorGet, EditorSet } from './types';

const log = logger('editor-store');

/** Load, save, and whole-config import. */
export function createConfigSlice(set: EditorSet, get: EditorGet): ConfigActions {
  return {
    loadConfig: async () => {
      try {
        const res = await editorFetch('/api/config');
        if (!res.ok) throw new Error(`Load failed: ${res.status}`);
        const config: ScreenConfiguration = await res.json();
        if (!config.screens) throw new Error('Invalid config');

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
      set({ isSaving: true, saveError: null });
      try {
        // Pre-validate with the SAME validators the config route runs, in the
        // same order. Auto-save fires 800ms after any edit, so a transiently
        // invalid state (e.g. a just-added visibility condition with an empty
        // key) would otherwise PUT a guaranteed 400 on every keystroke pause.
        // Failing here skips the pointless network call; the editor panel is
        // already showing the matching inline error.
        const invalid = validateDisplays(configSnapshot) ?? validateAllSchedules(configSnapshot);
        if (invalid) {
          const preErr = new Error(invalid) as Error & { saveDetail?: string };
          preErr.saveDetail = invalid;
          throw preErr;
        }
        const res = await editorFetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configSnapshot),
        });
        if (!res.ok) {
          // Surface the server validator's message (e.g. which module has a bad
          // visibility condition) instead of a generic failure; network errors
          // and non-JSON bodies keep the generic string below.
          let detail: string | null = null;
          try {
            const body = await res.json();
            if (body && typeof body.error === 'string' && body.error) detail = body.error;
          } catch { /* non-JSON error body */ }
          const saveErr = new Error(detail ?? `Save failed: ${res.status}`) as Error & { saveDetail?: string };
          if (detail) saveErr.saveDetail = detail;
          throw saveErr;
        }
        // Only clear dirty if no new changes occurred during save
        const { config: current } = get();
        set({ isSaving: false, isDirty: current !== configSnapshot, saveError: null });
      } catch (err) {
        const detail = (err as { saveDetail?: string })?.saveDetail;
        set({
          isSaving: false,
          saveError: detail ?? 'Failed to save',
        });
        // Validation failures (client pre-check or server 400) are an expected
        // editing state surfaced in the toolbar — warn, don't error, so the
        // Next.js dev overlay only interrupts for unexpected failures.
        if (detail) log.warn('Config not saved:', detail);
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

    importConfig: (json: string) => {
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
        selectedDisplayId: nextDisplayId,
        selectedScreenId: firstId,
        selectedModuleId: null,
        isDirty: true, saveError: null,
        _past: newPast, _future: [], _lastHistoryTime: 0, _lastHistoryActionKey: '',
      });
      if (firstId) {
        syncEditorUrl({ screen: firstId });
      }
    },
  };
}
