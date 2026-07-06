'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import {
  toConfigSettings,
  toFormState,
  type SettingsState,
} from '@/lib/settings-form';
import type { GlobalSettings } from '@/types/config';

type SaveStatus = 'saved' | 'failed' | null;

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
  updateGroup: <K extends keyof SettingsState>(group: K, updates: Partial<SettingsState[K]>) => void;
  saving: boolean;
  saveMessage: SaveStatus;
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

  // Re-initialize local state once config arrives (initial load only).
  // Imports re-sync via DataSection's onSettingsImported callback.
  // Profile actions that mutate config.settings (e.g. setActiveProfile) must NOT wipe unsaved form edits.
  const settingsInitRef = useRef(false);
  useEffect(() => {
    if (settings && !settingsInitRef.current) {
      settingsInitRef.current = true;
      setState(toFormState(settings));
    }
  }, [settings]);

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
  const userDirtyRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      setSaveMessage(null);
      try {
        updateSettings(toConfigSettings(latestStateRef.current));
        await saveConfig();
        setSaveMessage('saved');
        // Clear the "Saved" toast after a couple of seconds so it
        // disappears during long idle periods and reappears on the
        // next change.
        setTimeout(() => setSaveMessage((prev) => (prev === 'saved' ? null : prev)), 2000);
      } catch (err) {
        console.error('Auto-save failed:', err);
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
    setState((prev) => ({ ...prev, [group]: { ...prev[group], ...updates } }));
    setSaveMessage(null);
  }, []);

  return { state, setState, updateGroup, saving, saveMessage };
}
