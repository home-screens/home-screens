'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import {
  toConfigSettings,
  toFormState,
  type SettingsState,
} from '@/lib/settings-form';
import type { GlobalSettings } from '@/types/config';
import { logger } from '@/lib/logger';

const log = logger('useSettingsAutosave');

/** Stable empty set so the "nothing just saved" state keeps one identity. */
const EMPTY_FIELD_IDS: ReadonlySet<string> = new Set<string>();

/** How long a just-saved field keeps its confirmation outline. */
const SAVED_FLASH_MS = 1500;

export type SaveStatus = 'saved' | 'failed' | null;

/** Stages a partial edit into one group of the settings form state. */
export type UpdateSettingsGroup = <K extends keyof SettingsState>(
  group: K,
  updates: Partial<SettingsState[K]>,
) => void;

interface UseSettingsAutosaveParams {
  /** `config.settings` — undefined until config loads. */
  settings: GlobalSettings | undefined;
  /** Store action that stages a settings mutation into the in-memory config. */
  updateSettings: (settings: Partial<GlobalSettings>) => void;
  /** Store action that PUTs the config. */
  saveConfig: () => Promise<void>;
  /** Store's live isSaving flag, subscribed by the caller. */
  storeIsSaving: boolean;
  /** Store's live saveError, subscribed by the caller. */
  storeSaveError: string | null;
}

interface UseSettingsAutosaveReturn {
  state: SettingsState;
  setState: React.Dispatch<React.SetStateAction<SettingsState>>;
  updateGroup: UpdateSettingsGroup;
  saving: boolean;
  saveMessage: SaveStatus;
  /**
   * Field ids (`<group>.<field>`, matching the `data-field-id` attributes the
   * sidebar search already targets) that were part of the save that just
   * landed. `useSavedFieldFlash` turns these into a brief outline on the
   * fields themselves, so a confirmation appears where the edit happened
   * rather than only as a pill in the window chrome, which on a tall page is
   * off screen entirely.
   */
  savedFieldIds: ReadonlySet<string>;
}

/**
 * Owns the settings page's local form state and its debounced auto-save state
 * machine (Defaults pages). Extracted verbatim from the settings page so the
 * timing semantics — one-time hydration, dirty tracking, 500ms debounce,
 * save-in-flight guards, and the coalesced-save "Saved" toast — live in one
 * place. The refs' identity/lifetime is preserved exactly: they are created
 * here and survive for the life of the settings page component.
 */
export function useSettingsAutosave({
  settings,
  updateSettings,
  saveConfig,
  storeIsSaving,
  storeSaveError,
}: UseSettingsAutosaveParams): UseSettingsAutosaveReturn {
  const [state, setState] = useState<SettingsState>(() => toFormState(settings));
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<SaveStatus>(null);

  // Field ids edited since the last successful save, and the ones the last
  // save actually carried. Kept in a ref while pending so accumulating edits
  // during the 500ms debounce doesn't re-render on every keystroke.
  const pendingFieldIdsRef = useRef<Set<string>>(new Set());
  const [savedFieldIds, setSavedFieldIds] = useState<ReadonlySet<string>>(EMPTY_FIELD_IDS);

  // Re-initialize local state once config arrives (initial load only).
  // Imports re-sync via DataSection's onSettingsImported callback.
  // Profile actions that mutate config.settings (e.g. setActiveProfile) must NOT wipe unsaved form edits.
  const settingsInitRef = useRef(false);
  // Declared here (used by the re-hydrate effect below); documented with the
  // auto-save infrastructure further down.
  const userDirtyRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (settings && !settingsInitRef.current) {
      settingsInitRef.current = true;
      setState(toFormState(settings));
    }
  }, [settings]);

  // Re-hydrate whenever the whole config is replaced from outside this
  // session — a reload, a restore, or "Load their changes" after a save
  // conflict. Without this the form keeps the pre-conflict values and the
  // next keystroke writes every field of it over the version the user just
  // chose to keep. Keyed on the store's generation counter, not on
  // `settings` identity, so an ordinary save or profile switch (which also
  // change `settings`) never wipes unsaved edits.
  const configGeneration = useEditorStore((s) => s.configGeneration);
  const seenGenerationRef = useRef(configGeneration);
  useEffect(() => {
    if (seenGenerationRef.current === configGeneration) return;
    seenGenerationRef.current = configGeneration;
    if (!settingsInitRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    userDirtyRef.current = false;
    setState(toFormState(useEditorStore.getState().config?.settings));
  }, [configGeneration]);

  // Auto-save infrastructure.
  //
  // `userDirtyRef` flips to true the first time the user actually edits
  // a form field, so the initial `settingsInitRef` hydration (which calls
  // `setState(toFormState(settings))` once config loads) doesn't trigger
  // a pointless write-back of config-to-itself. Every path that mutates
  // `state` from user input funnels through `updateGroup` below, which
  // sets the flag — so adding a new form field Just Works without having
  // to remember to mark it dirty manually.
  //
  // `autoSaveTimerRef` holds the debounce timer. Every state change
  // cancels any pending timer and schedules a fresh save 500ms out, so
  // slider drags and per-keystroke number inputs collapse into a single
  // PUT instead of hammering the disk on every tick.
  //
  // `latestStateRef` captures the most recent `state` without forcing
  // the auto-save callback to re-capture on every render — the timer
  // fires once and reads the latest state at the moment it runs,
  // regardless of how many renders happened in between.
  const latestStateRef = useRef(state);
  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  // Pulse a "Saved" toast whenever the store's isSaving flag transitions
  // from true back to false without an error. This catches per-display
  // subtab mutations (DisplaySubtab, SleepSubtab, AlertsSubtab, etc.)
  // which call `saveConfig()` directly — their saves would otherwise
  // complete silently with no header feedback. The local auto-save
  // effect for Defaults pages also flips store.isSaving, so this fires
  // for both paths via a single subscription.
  //
  // The save-coalescing retry previously lived here (watching the
  // `isDirty` flag and re-firing saveConfig() after a concurrent
  // subtab write) but it has moved into `saveConfig` itself — the
  // store's `_pendingResave` flag flushes any mutation that landed
  // while a save was in flight, so the race is handled at the source
  // instead of observed from here.
  const prevStoreIsSavingRef = useRef(storeIsSaving);
  useEffect(() => {
    const wasSaving = prevStoreIsSavingRef.current;
    prevStoreIsSavingRef.current = storeIsSaving;
    if (wasSaving && !storeIsSaving && !storeSaveError) {
      // Coalesced-save flicker guard: when a mutation lands during an
      // in-flight save, the store transitions isSaving true→false→true
      // (first save lands, queueMicrotask schedules the re-save). The
      // observer fires on the intermediate false, but a "Saved" toast at
      // that moment is misleading because the latest mutation is still
      // pending. Read the live store state imperatively (no subscription,
      // no extra re-renders) to detect the in-progress re-save: if
      // anything is still dirty or another save has already kicked off,
      // skip the toast and wait for the final transition.
      const live = useEditorStore.getState();
      if (live.isSaving || live.isDirty) return;
      setSaveMessage('saved');
      const timer = setTimeout(
        () => setSaveMessage((prev) => (prev === 'saved' ? null : prev)),
        2000,
      );
      return () => clearTimeout(timer);
    }
  }, [storeIsSaving, storeSaveError]);

  useEffect(() => {
    if (!settingsInitRef.current || !userDirtyRef.current) return;
    // Held while a save conflict waits on the user, like useAutoSave.
    if (useEditorStore.getState().saveConflict) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      setSaveMessage(null);
      try {
        updateSettings(toConfigSettings(latestStateRef.current));
        const justSaved = pendingFieldIdsRef.current;
        pendingFieldIdsRef.current = new Set();
        await saveConfig();
        setSaveMessage('saved');
        if (justSaved.size > 0) {
          setSavedFieldIds(justSaved);
          setTimeout(
            () => setSavedFieldIds((prev) => (prev === justSaved ? EMPTY_FIELD_IDS : prev)),
            SAVED_FLASH_MS,
          );
        }
        // Clear the "Saved" toast after a couple of seconds so it
        // disappears during long idle periods and reappears on the
        // next change.
        setTimeout(() => setSaveMessage((prev) => (prev === 'saved' ? null : prev)), 2000);
      } catch (err) {
        log.error('Auto-save failed:', err);
        setSaveMessage('failed');
      } finally {
        setSaving(false);
      }
    }, 500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [state, updateSettings, saveConfig]);

  const updateGroup = useCallback(<K extends keyof SettingsState>(group: K, updates: Partial<SettingsState[K]>) => {
    // Mark the form as user-dirty so the auto-save effect knows the
    // next state change is a real edit, not hydration. Set before
    // setState so the effect's dependency update sees the flag already
    // true on the subsequent render.
    userDirtyRef.current = true;
    // `<group>.<field>` is the same id shape the fields carry as
    // `data-field-id`, so no separate registry is needed to connect a staged
    // edit to the element the user typed into.
    for (const field of Object.keys(updates)) {
      pendingFieldIdsRef.current.add(`${String(group)}.${field}`);
    }
    setState((prev) => ({ ...prev, [group]: { ...prev[group], ...updates } }));
    setSaveMessage(null);
  }, []);

  return { state, setState, updateGroup, saving, saveMessage, savedFieldIds };
}
