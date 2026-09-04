import type { ModuleInstance, ModuleType } from '@/types/config';
import { matrixSettings } from '../helpers/module-fixtures';

/**
 * A settings + style profile the whole module matrix is rendered under.
 *
 * The gallery exists to prove that a change did not repaint a wall someone
 * already built (see `.claude/plans/50` and `51`). Each scenario is a
 * population of users: `default` is everyone who never touched a control and
 * must never move, and the rest are the people who did touch one, where an
 * intended change is allowed to show and has to be explained shot by shot.
 */
export interface GalleryScenario {
  label: string;
  /** One line on who this represents, printed in the spec title. */
  who: string;
  /** Merged over `matrixSettings()`. */
  settings?: Record<string, unknown>;
  /** Merged over the instance's registry-default style. */
  style?: Partial<ModuleInstance['style']>;
  /** Multiplier on the registry default size (fillsCanvas modules are exempt). */
  sizeScale?: number;
}

export const SCENARIOS: GalleryScenario[] = [
  {
    label: 'default',
    who: 'never touched a control — must never move',
  },
  {
    label: 'styled',
    who: 'set colours, padding and text size by hand',
    // Dark-on-light is the case that exposes anything hardcoded to white:
    // `text-white/N` in sports and standings, the `DIVIDER` tiers, the analog
    // clock's numeral fill (audit items 3, 3b, 4).
    style: {
      textColor: '#101010',
      backgroundColor: 'rgba(255, 255, 255, 0.92)',
      borderColor: 'rgba(0, 0, 0, 0.2)',
      padding: 32,
      fontSize: 24,
      fontWeight: 600,
      backdropBlur: 0,
    },
  },
  {
    label: 'bigbox',
    who: 'dropped a module into a card far larger than its default',
    sizeScale: 3,
  },
  {
    // The regression guard for audit item 6. A German household that never
    // opened the time-format setting gets 24-hour times today, from the
    // locale's hour cycle, in todoist and the fullscreen photo clock. It must
    // still get them afterwards. This is the single most important scenario
    // in the set.
    label: 'intl-default',
    who: 'German locale, never opened the time-format setting — must never move',
    settings: { locale: 'de-DE' },
  },
  {
    label: 'intl-24h',
    who: 'German locale and explicitly chose 24-hour',
    settings: { locale: 'de-DE', timeFormat: '24h' },
  },
];

/** Global settings for a scenario: the matrix baseline plus its overrides. */
export function scenarioSettings(scenario: GalleryScenario): Record<string, unknown> {
  return { ...matrixSettings(), ...(scenario.settings ?? {}) };
}

/** Apply a scenario's style and size to a built instance. */
export function applyScenario(
  mod: ModuleInstance,
  scenario: GalleryScenario,
  opts: { fillsCanvas: boolean; displayW: number; displayH: number },
): ModuleInstance {
  const style = { ...mod.style, ...(scenario.style ?? {}) };
  // A fillsCanvas module is already the whole canvas; scaling it would only
  // push it off the screen, and it has no Style panel to honour either.
  if (opts.fillsCanvas) return { ...mod, style: mod.style };
  const scale = scenario.sizeScale ?? 1;
  const size = scale === 1
    ? mod.size
    : {
        w: Math.min(opts.displayW, Math.round(mod.size.w * scale)),
        h: Math.min(opts.displayH, Math.round(mod.size.h * scale)),
      };
  return { ...mod, style, size };
}

/**
 * Extra shots for views the default config does not reach.
 *
 * The matrix renders each module in its registry-default view, which leaves
 * every other view outside the gate. That is fine until a change touches one:
 * wave 2 rewrote the sun arc, the sun circle and the analog clock face, and all
 * three came back "unchanged" simply because none of them was ever rendered.
 *
 * So this list is not a general view matrix (`module-views.spec.ts` is that).
 * It is the set of non-default views some fix has actually touched, and it
 * should grow whenever one does.
 */
export interface GalleryViewVariant {
  type: ModuleType;
  /** Suffix for the shot filename. */
  name: string;
  config: Record<string, unknown>;
}

export const VIEW_VARIANTS: GalleryViewVariant[] = [
  // Wave 2, item 16: user-unit SVG text, biased by Style > Font size.
  { type: 'sunrise-sunset', name: 'arc', config: { view: 'arc' } },
  { type: 'sunrise-sunset', name: 'circle', config: { view: 'circle' } },
  // Wave 2, item 3b: a clock face drawn entirely in hardcoded white. The
  // numerals are behind `showNumerals`, so the plain analog shot renders the
  // ring, ticks and hands but not them — hence the second variant.
  { type: 'clock', name: 'analog', config: { view: 'analog' } },
  { type: 'clock', name: 'analog-numerals', config: { view: 'analog', showNumerals: true } },
];
