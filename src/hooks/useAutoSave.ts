'use client';

import { useEffect, useMemo } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { validateAllSchedules, validateDisplays } from '@/lib/display-filter';

const AUTO_SAVE_DELAY = 800;

/**
 * Saves the editor store's draft 800ms after the last edit, and asks before
 * the tab is closed or reloaded with edits the hub does not have yet.
 *
 * Mounted once, from the (editor) layout (`EditorAutoSave`), not from the
 * /editor page. The draft lives in the store, which outlives every
 * client-side move inside the editor (the Settings button, a config
 * section's link to a Settings page, browser Back, "Add display"), so the
 * timer has to outlive them too. Mounted on the page, each of those moves
 * cleared the timer and left a dirty store with nothing arming a save, and
 * Settings had no leave-page guard at all. A full exit (closing the tab, a
 * reload) is what the prompt is for.
 */
export function useAutoSave(): void {
  const config = useEditorStore((s) => s.config);
  const isDirty = useEditorStore((s) => s.isDirty);
  const isSaving = useEditorStore((s) => s.isSaving);
  const saveConfig = useEditorStore((s) => s.saveConfig);
  const saveConflict = useEditorStore((s) => s.saveConflict);
  const saveHeld = useEditorStore((s) => s.saveHeld);

  // A transiently invalid config (e.g. a just-added visibility condition
  // whose key hasn't been typed yet) is an expected editing state, not a
  // failure: don't attempt a save at all; the property panel is already
  // showing the matching inline error. Same validators, same order as the
  // config route, so this can never block a config the server would accept.
  const isInvalid = useMemo(
    () => config != null && (validateDisplays(config) ?? validateAllSchedules(config)) != null,
    [config],
  );

  // Auto-save: debounce 800ms after the last change. Held while a save
  // conflict is waiting on the user (retrying would just be refused again)
  // and while a crashed draft waits for the reload that discards it.
  useEffect(() => {
    if (!isDirty || isSaving || isInvalid || saveConflict || saveHeld) return;
    const timer = setTimeout(() => saveConfig().catch(() => {}), AUTO_SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [config, isDirty, isSaving, isInvalid, saveConflict, saveHeld, saveConfig]);

  // Ask before leaving the page with unsaved changes. Only a real exit
  // raises this; moves inside the editor keep the store and the timer.
  useEffect(() => {
    if (!isDirty || saveHeld) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, saveHeld]);
}
