'use client';

import { useEffect } from 'react';

/**
 * Briefly outline the fields a save just carried.
 *
 * Every settings page auto-saves, but the only acknowledgement was a small
 * pill in the top-right of the window: on a tall page that is hundreds of
 * pixels from the field you touched, and often off screen. This puts the
 * confirmation where the edit happened.
 *
 * Deliberately a class toggle on the existing `data-field-id` elements rather
 * than a rendered indicator: those wrappers already exist for the sidebar's
 * field search (see `useSettingsHighlight`, which uses the same lookup), and
 * an outline costs no layout. Anything inserted into a field's markup would
 * reflow the row every time an autosave landed, which in a two-column grid
 * pushes one column out of alignment with the other for the duration.
 */
export function useSavedFieldFlash(savedFieldIds: ReadonlySet<string>): void {
  useEffect(() => {
    if (savedFieldIds.size === 0) return;
    const nodes: Element[] = [];
    for (const id of savedFieldIds) {
      const el = document.querySelector(`[data-field-id="${CSS.escape(id)}"]`);
      // A field can be absent: the save may have carried a value whose input
      // lives on another tab, or on a page the user has already left.
      if (el) {
        el.classList.add('settings-field-saved');
        nodes.push(el);
      }
    }
    return () => {
      for (const el of nodes) el.classList.remove('settings-field-saved');
    };
  }, [savedFieldIds]);
}
