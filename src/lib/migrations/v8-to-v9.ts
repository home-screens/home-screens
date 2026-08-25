/**
 * Migration 009 — a fullscreen module's accent follows its theme.
 *
 * Themes now carry their own accent color, but only when the module leaves
 * `accentColor` empty: a set value is treated as a deliberate user choice and
 * always wins. The registry used to ship a real hex in the defaults of the
 * full-screen calendar, chore chart, and meal planner, so every existing
 * instance carries that hex without anyone having chosen it, and would paint
 * an orange today-marker or amber progress bar on top of Aurora's mint or
 * Vellum's red.
 *
 * Clearing the retired default restores the "unset = follow the theme"
 * meaning. Only that exact value is cleared, per module type; any other color
 * stays. A hand-typed copy of the default is indistinguishable from the
 * shipped one and is cleared too, which is the right call: on every theme
 * without an accent of its own it still paints the same color.
 *
 * On the six original themes the repaint is a near no-op: the light ones
 * fall back to the very same hex, and the dark ones move from the lifted
 * orange (`rgb(255,101,14)`) to the tuned `#F97316` the fallback now carries.
 */

import type { ScreenConfiguration } from '@/types/config';
import { mapConfigModules } from './module-walk';

/** The values the registry used to ship as each module's default accent
 *  (lowercase; compared case-insensitively). Frozen history, deliberately
 *  not imported from the live constants. */
const RETIRED_DEFAULT_ACCENTS: Record<string, string> = {
  'fullscreen-calendar': '#ea580c',
  'fullscreen-chore-chart': '#f59e0b',
  'fullscreen-meal-planner': '#f59e0b',
};

export const v8ToV9 = {
  version: 9,
  description: 'Clear the retired fullscreen module default accents so themed accents apply',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({
    ...config,
    version: 9,
    ...mapConfigModules(config, (mod) => {
      const retired = RETIRED_DEFAULT_ACCENTS[mod.type];
      if (!retired) return mod;
      const cfg = mod.config as Record<string, unknown> | undefined;
      if (!cfg || typeof cfg !== 'object') return mod;
      const accent = cfg.accentColor;
      if (typeof accent !== 'string' || accent.toLowerCase() !== retired) return mod;
      return { ...mod, config: { ...cfg, accentColor: '' } } as typeof mod;
    }),
  }),
};
