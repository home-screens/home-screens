import type { ScreenConfiguration } from '@/types/config';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import {
  findMainDisplay,
  validateAllSchedules,
  validateDisplays,
} from '@/lib/display-filter';
import { getActiveScreens } from '@/lib/editor-multi-display';
import { appendHistoryEntry, createPendingResave } from '@/stores/editor-save';
import { syncEditorUrl } from '@/stores/editor-url';
import { CONFIG_REVISION_HEADER } from '@/lib/config-revision';
import { HUB_TIMEZONE_HEADER } from '@/lib/timezone';
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

/**
 * The config in a successful PUT response, when the hub stored something
 * other than what was sent. Null when it matches (the usual case), when the
 * body is not a config, or when it cannot be read at all: a normalisation
 * we fail to parse is not worth failing a save that already landed.
 */
async function readStoredConfig(
  res: Response,
  sent: ScreenConfiguration,
): Promise<ScreenConfiguration | null> {
  try {
    const body = await res.clone().json();
    if (!body || !Array.isArray(body.screens) || !body.settings) return null;
    return JSON.stringify(body) === JSON.stringify(sent) ? null : (body as ScreenConfiguration);
  } catch {
    return null;
  }
}

/** The revision header off a response (tolerant of minimal test doubles). */
function readRevision(res: Response): string | null {
  return res.headers?.get?.(CONFIG_REVISION_HEADER) ?? null;
}

/** The hub refused to hand over the saved setup; `detail` is what it said. */
class LoadFailure extends Error {
  constructor(message: string, readonly detail: string | null) {
    super(message);
  }
}

/** Load, save, and whole-config import. */
export function createConfigSlice(set: EditorSet, get: EditorGet): ConfigActions {
  return {
    loadConfig: async () => {
      try {
        const res = await editorFetch('/api/config');
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: unknown } | null;
          throw new LoadFailure(`Load failed: ${res.status}`, typeof body?.error === 'string' ? body.error : null);
        }
        const config: ScreenConfiguration = await res.json();
        if (!config.screens) throw new Error('Invalid config');
        const configRevision = readRevision(res);
        const hubTimezone = res.headers?.get?.(HUB_TIMEZONE_HEADER) || null;

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
        // A `module` param (the media page's "open in the editor" links) lands
        // with that module selected, so the property panel opens on it.
        const moduleParam = params.get('module');
        const restoredModule = restoredScreen && moduleParam
          ? restoredScreen.modules.find((m) => m.id === moduleParam)
          : undefined;
        set({
          config,
          configRevision,
          hubTimezone,
          configGeneration: get().configGeneration + 1,
          loadError: null,
          saveConflict: null,
          saveHeld: false,
          saveError: null,
          saveErrorKind: null,
          selectedDisplayId,
          selectedScreenId: restoredScreen ? restoredScreen.id : activeScreens[0]?.id ?? null,
          selectedModuleId: restoredModule?.id ?? null,
          isDirty: false,
          _past: [],
          _future: [],
          _lastHistoryTime: 0,
          _lastHistoryActionKey: '',
        });
      } catch (err) {
        log.error('Failed to load config:', err);
        // Only while there is nothing to show: a reload that fails keeps the
        // setup already on screen. A session that ran out is on its way to
        // the login page, which is its own explanation.
        if (!get().config && !isSessionExpired(err)) {
          set({ loadError: { detail: err instanceof LoadFailure ? err.detail : null } });
        }
      }
    },

    saveConfig: async () => {
      const state = get();
      const { config, isSaving } = state;
      if (!config) return;
      // A refused save waits on the user (Load theirs / Keep mine); retrying
      // meanwhile would be refused again and replace the version they are
      // looking at. resolveSaveConflict clears the flag before it saves.
      // A held draft is one the editor crashed on; see discardDraft.
      if (state.saveConflict || state.saveHeld) return;
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
        // The hub can normalise what it stored (it moves a pre-lists todo
        // module's inline items into a shared list and points the module at
        // it). Adopt that answer, or the store keeps editing a shape the
        // hub no longer has: the module would read as "pick a list" and the
        // next save would undo whatever the user picked. Skipped when the
        // user edited during the save, since their copy is newer; the fold
        // is idempotent, so the next save's answer is adopted instead.
        const stored = current === configSnapshot ? await readStoredConfig(res, configSnapshot) : null;
        set({
          isSaving: false,
          isDirty: current !== configSnapshot,
          saveError: null,
          saveErrorKind: null,
          saveConflict: null,
          configRevision: readRevision(res) ?? sentRevision,
          ...(stored ? { config: stored } : {}),
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

    discardDraft: async () => {
      // A re-save queued behind an in-flight PUT is left in place: the
      // in-flight save's finally block runs it, saveConfig returns at once
      // under the hold, and whoever awaits it is released rather than hung.
      set({ saveHeld: true, isDirty: false });
      // The load is what lifts the hold. The error screen reloads the page,
      // but browser Back gets there first and lands on a page that keeps the
      // config already in memory, so the hold must not depend on a reload.
      await get().loadConfig();
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
        loadError: null,
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

    adoptHubRewrite: async ({ rewrite, previousRevision, revision }) => {
      const state = get();
      // Not loaded yet: the load on its way fetches the rewritten file.
      if (!state.config) return;
      // Nothing of the editor's own to keep: the hub's file is the truth.
      if (!state.isDirty && !state.isSaving) {
        await get().loadConfig();
        return;
      }
      // Edits not yet on the hub: make the same change to this copy, so the
      // two merge at the next save. Only a copy of exactly the version the
      // hub rewrote may move onto the version it left. If the hub had moved
      // on before (someone else saved, and this editor's own save failed or
      // was refused), the old revision stays, so the next save is refused as
      // a conflict instead of quietly replacing their changes.
      const config = rewrite(state.config);
      const selectedGone = state.selectedModuleId != null
        && !getActiveScreens(config, state.selectedDisplayId)
          .some((screen) => screen.modules.some((m) => m.id === state.selectedModuleId));
      set({
        config,
        // Like every other replacement from outside the session, so an open
        // settings form re-hydrates instead of writing its older snapshot
        // back over the rewrite on the next keystroke.
        configGeneration: state.configGeneration + 1,
        ...(previousRevision != null && state.configRevision === previousRevision
          ? { configRevision: revision }
          : {}),
        ...(selectedGone ? { selectedModuleId: null } : {}),
      });
    },
  };
}
