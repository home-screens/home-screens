import type { Screen } from '@/types/config';
import { dominantModuleType } from '@/lib/screen-dock';
import { getModuleDefinition } from '@/lib/module-registry';

/**
 * A screen that shows only when opened: out of the rotation, reachable by a
 * module's open button, a display rule or a dock button, and gone again
 * after its quiet time. The rules live here so the rotator, the editor and
 * the tab strip read the same ones.
 */

/** How long an opened screen stays with nobody touching it when the screen does not say. */
export const DEFAULT_GO_BACK_AFTER_MS = 2 * 60_000;

/** True for a screen that waits to be opened instead of taking a turn. */
export function showsOnlyWhenOpened(screen: Pick<Screen, 'rotation'>): boolean {
  return screen.rotation === 'opened';
}

/** The longest quiet time the editor accepts: a whole day. */
export const MAX_GO_BACK_AFTER_MS = 24 * 60 * 60_000;

/**
 * The quiet time of an opened screen in milliseconds: the screen's own
 * value, the default when unset, and `0` for "stay until someone taps Back".
 * A value that is not a finite non-negative number reads as unset.
 */
export function resolveGoBackAfterMs(screen: Pick<Screen, 'goBackAfterMs'>): number {
  const ms = screen.goBackAfterMs;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return DEFAULT_GO_BACK_AFTER_MS;
  return Math.floor(ms);
}

/**
 * What a typed number of minutes becomes: whole or half minutes, 0 to a day,
 * as milliseconds, plus why it changed when it did (`clamped` past the day,
 * `rounded` to the nearest half minute or up from below zero), or null when
 * the text is not a number at all.
 */
export function goBackAfterFromMinutes(text: string): { ms: number; changed: 'clamped' | 'rounded' | null; from: number; to: number } | null {
  // A decimal comma is a decimal point: "1,5" is a minute and a half, not fifteen.
  const typed = text.trim().replace(',', '.');
  if (typed === '') return null;
  const n = Number(typed);
  if (!Number.isFinite(n)) return null;
  const maxMinutes = MAX_GO_BACK_AFTER_MS / 60_000;
  if (n > maxMinutes) return { ms: MAX_GO_BACK_AFTER_MS, changed: 'clamped', from: n, to: maxMinutes };
  const halves = Math.round(Math.max(0, n) * 2) / 2;
  return { ms: Math.round(halves * 60_000), changed: halves === n ? null : 'rounded', from: n, to: halves };
}

/** The quiet time as the minutes field shows it: half minutes kept ("1.5"), whole ones bare. */
export function goBackAfterMinutesText(ms: number): string {
  const minutes = ms / 60_000;
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
}

/**
 * Whether anything can open `screenId` on a display: a module's open button,
 * a Display Control dock button naming it, or a display rule that shows it.
 * A screen that shows only when opened and has none of these is stranded,
 * and the editor says so.
 */
export function screenHasOpener(screens: readonly Screen[], rules: readonly { action: { kind: string; screenId?: string } }[] | undefined, screenId: string): boolean {
  // A module with "Tap on the Wall" off draws no button, so it opens nothing.
  if (openersOf(screens, screenId).some((o) => o.module.config?.interactive !== false)) return true;
  for (const screen of screens) {
    for (const mod of screen.modules) {
      const buttons = mod.type === 'display-control' ? (mod.config.dockButtons as Array<{ screenId?: string }> | undefined) : undefined;
      if (Array.isArray(buttons) && buttons.some((b) => b?.screenId === screenId)) return true;
    }
  }
  return (rules ?? []).some((r) => r.action?.kind === 'showScreen' && r.action.screenId === screenId);
}

/**
 * The modules that open `screenId`, named for a sentence ("Meal Planner on
 * Kitchen"), with two of the same on one screen counted once ("Meal Planner
 * on Kitchen (2)"). `label` gives a module type's name.
 */
export function openerNames(
  screens: readonly Screen[],
  screenId: string,
  label: (type: Screen['modules'][number]['type']) => string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string[] {
  const counts = new Map<string, number>();
  for (const o of openersOf(screens, screenId)) {
    const name = t('screenSettings.openerName', { screen: o.screen.name, module: label(o.module.type) });
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, n]) => (n > 1 ? t('screenSettings.openerNameCount', { name, count: n }) : name));
}

/** The modules of `screens` whose open button opens `screenId`, with the screen each sits on. */
export function openersOf(screens: readonly Screen[], screenId: string): Array<{ screen: Screen; module: Screen['modules'][number] }> {
  const found: Array<{ screen: Screen; module: Screen['modules'][number] }> = [];
  for (const screen of screens) {
    for (const mod of screen.modules) {
      if (mod.openButtonScreen === screenId) found.push({ screen, module: mod });
    }
  }
  return found;
}

/**
 * The full-screen theme an opened screen is drawn in, for the chrome the
 * display draws over it (the back chip): the theme of the full-screen module
 * that stands for the screen, else the display's default. Undefined when the
 * screen has no full-screen module and no default is set, which the theme
 * lookup reads as Linen.
 */
export function openedScreenTheme(
  screen: Pick<Screen, 'modules'> | null,
  defaultTheme: string | undefined,
): string | undefined {
  if (screen) {
    const type = dominantModuleType(screen);
    if (type && getModuleDefinition(type)?.category === 'Full Screen') {
      const theme = screen.modules.find((m) => m.type === type)?.config?.theme;
      if (typeof theme === 'string' && theme) return theme;
    }
  }
  return defaultTheme;
}
