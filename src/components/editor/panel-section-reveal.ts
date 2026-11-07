'use client';

import { useEffect } from 'react';

/**
 * Lets one part of the Property Panel open another part's accordion.
 *
 * The sections are uncontrolled (`AccordionSection` keeps its own open
 * state), which is right for a panel the household opens and closes by
 * hand, but a shortcut such as the Rain Map's "only show when rain is
 * likely" button lands its change in the Conditions section, and leaving
 * that section folded would hide what just happened. A section registers
 * under an id; `revealPanelSection(id)` opens it. A tiny module-level
 * registry rather than store state, because nothing about this is worth
 * persisting or undoing.
 */

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

export const PANEL_SECTION_CONDITIONS = 'conditions';
/** The screen's own settings (rotation, schedule, conditions), opened from a module's Open button section. */
export const PANEL_SECTION_SCREEN_SETTINGS = 'screen-settings';
/** A module's Open button section, opened by a click on its pill on the canvas. */
export const PANEL_SECTION_OPEN_BUTTON = 'open-button';

/** Open the section registered under `id`, if it is mounted. */
export function revealPanelSection(id: string): void {
  listeners.get(id)?.forEach((fn) => fn());
}

/** Register `onReveal` for `id` while mounted. No-op without an id. */
export function usePanelSectionReveal(id: string | undefined, onReveal: Listener): void {
  useEffect(() => {
    if (!id) return;
    let set = listeners.get(id);
    if (!set) {
      set = new Set();
      listeners.set(id, set);
    }
    set.add(onReveal);
    return () => {
      set.delete(onReveal);
      if (set.size === 0) listeners.delete(id);
    };
  }, [id, onReveal]);
}
