import type { DockButton, ModuleType, Screen } from '@/types/config';
import type { TranslateFn } from '@/i18n';
import { getModuleDefinition, resolveModuleLabel } from '@/lib/module-registry';
import { resolveScreenTargetIndex } from '@/lib/resolve-screen-target';

/**
 * What the Display Control dock knows about one screen of the rotation. Built
 * once per rotation list by the provider (ScreenRotator or the editor canvas),
 * so the dock never walks module lists itself.
 */
export interface DockScreen {
  id: string;
  /** The screen's own name; what a `goto-screen` to another display sends. */
  name: string;
  /** The module that stands for the screen on its tile; null for an empty screen. */
  iconType: ModuleType | null;
  /** Words under the tile when the button has its own; otherwise the name. */
  label?: string;
  /** The button's own icon (emoji, `fa:` or `custom:` value) instead of the module's. */
  icon?: string;
  /** The button's own colour instead of the palette's. */
  color?: string;
  /**
   * Drawn dimmed, and its button does nothing. In the editor's copy: a screen
   * that shows only when opened and is outside its hours (or its conditions
   * do not match) right now; the wall leaves such a screen out of its list,
   * and the editor dims its open buttons so the household sees what the wall
   * does. In a dock aimed at another display: a screen that display has no
   * screen of the same name for (`dockScreensOn`).
   */
  unavailable?: boolean;
}

/**
 * The module whose icon represents a screen: the biggest one by area, ties
 * going to the earlier one. Disabled modules still count, since the screen
 * is still "the calendar screen" while its calendar is switched off for the
 * night. A module shown on every screen says nothing about this one, and a
 * hidden background copy is never drawn, so neither counts. Null when
 * nothing is left.
 */
export function dominantModuleType(screen: Pick<Screen, 'modules'>): ModuleType | null {
  let best: { type: ModuleType; area: number } | null = null;
  for (const mod of screen.modules) {
    if (mod.showOnEveryScreen || mod.backgroundProvider) continue;
    const area = Math.max(0, mod.size.w) * Math.max(0, mod.size.h);
    if (!best || area > best.area) best = { type: mod.type, area };
  }
  return best?.type ?? null;
}

export function toDockScreen(screen: Pick<Screen, 'id' | 'name' | 'modules'>): DockScreen {
  return { id: screen.id, name: screen.name, iconType: dominantModuleType(screen) };
}

/**
 * The dock's list. Without `buttons` it is the rotation as it stands. With
 * them, each button in order, looked up among every switched-on screen of
 * the display so a screen outside the rotation right now (off its schedule,
 * condition unmet, off-profile) keeps its button; a button whose screen is
 * gone or switched off is skipped. Overrides ride along as the tile's own
 * label, icon and colour; an empty label counts as unset.
 */
export function resolveDockButtons(
  buttons: readonly DockButton[] | undefined,
  rotation: readonly DockScreen[],
  allScreens: readonly DockScreen[],
): DockScreen[] {
  if (!buttons) return [...rotation];
  const byId = new Map(allScreens.map((s) => [s.id, s]));
  const out: DockScreen[] = [];
  for (const button of buttons) {
    const screen = byId.get(button.screenId);
    if (!screen) continue;
    const label = button.label?.trim();
    out.push({
      ...screen,
      ...(label ? { label } : {}),
      ...(button.icon ? { icon: button.icon } : {}),
      ...(button.color ? { color: button.color } : {}),
    });
  }
  return out;
}

/** What a dock tile sends another display: the screen's name, which that display's screen of the same name answers. */
export function dockGotoTarget(screen: Pick<DockScreen, 'id' | 'name'>): string {
  return screen.name.trim() || screen.id;
}

/**
 * The dock's tiles as another display can follow them: each one whose name
 * `there` (that display's switched-on screens) has no screen for is drawn
 * unavailable, matched the way the hub's `goto-screen` matches. `there`
 * unknown leaves every tile as it is.
 */
export function dockScreensOn(screens: DockScreen[], there: ReadonlyArray<{ id: string; name: string }> | undefined): DockScreen[] {
  if (!there) return screens;
  return screens.map((s) => (resolveScreenTargetIndex(there, dockGotoTarget(s)) === -1 ? { ...s, unavailable: true } : s));
}

/**
 * Tile colours by position. Eight hues far enough apart that neighbours never
 * read as the same screen, in an order that keeps warm and cool alternating.
 */
export const DOCK_PALETTE: readonly string[] = [
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#ef4444', // red
];

export function dockTileColor(index: number): string {
  return DOCK_PALETTE[((index % DOCK_PALETTE.length) + DOCK_PALETTE.length) % DOCK_PALETTE.length];
}

/** View values whose editor label key does not follow `view` + PascalCase(value). */
const VIEW_LABEL_KEYS: Record<string, string> = { 'fullscreen-meal-planner:recipes': 'viewRecipeBook' };

/**
 * The label of a full-screen module's view, as its settings list it, or null
 * for a module that is not full-screen, has no view, or whose view has no
 * label (the caller falls back to the module's name).
 */
function fullscreenViewLabel(mod: Screen['modules'][number], t: TranslateFn): string | null {
  if (getModuleDefinition(mod.type)?.category !== 'Full Screen') return null;
  const view = typeof mod.config?.view === 'string' ? mod.config.view : null;
  if (!view) return null;
  const keyName = VIEW_LABEL_KEYS[`${mod.type}:${view}`]
    ?? `view${view.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
  const key = `configSections.${mod.type}.${keyName}`;
  const label = t(key);
  return label && label !== key ? label : null;
}

/** How many module names a screen's description lists before "and more". */
const DESCRIBED_MODULES = 4;

/**
 * What a screen holds, in words, for a list that names screens the household
 * never renamed ("Screen 3"): the labels of its modules in reading order (top
 * to bottom, left to right), up to four, with the rest counted, joined the
 * way the language joins a list. Modules shown on every screen and hidden
 * background copies say nothing about this screen. Empty for an empty
 * screen, and empty when the screen holds one module whose label is the
 * screen's own name: "Recipe Book shows Recipe Book" says nothing.
 */
export function describeScreenContents(screen: Pick<Screen, 'modules' | 'name'>, t: TranslateFn, locale?: string): string {
  // One full-screen module: named by the view it is set to, which is what
  // the household picked ("Full-Screen Meal Planner, Recipe Book view").
  const drawn = screen.modules.filter((mod) => !mod.showOnEveryScreen && !mod.backgroundProvider);
  if (drawn.length === 1) {
    const view = fullscreenViewLabel(drawn[0], t);
    if (view) return t('propertyPanel.openButton.holdsView', { module: resolveModuleLabel(drawn[0].type, t), view });
  }
  const own = screen.modules
    .filter((mod) => !mod.showOnEveryScreen && !mod.backgroundProvider)
    .map((mod) => ({ label: resolveModuleLabel(mod.type, t), y: mod.position.y, x: mod.position.x }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const labels = own.map((m) => m.label);
  const unique = labels.filter((label, i) => labels.indexOf(label) === i);
  if (unique.length === 1 && unique[0].trim().toLowerCase() === screen.name.trim().toLowerCase()) return '';
  const shown = unique.slice(0, DESCRIBED_MODULES);
  const more = unique.length - shown.length;
  if (more > 0) shown.push(t('propertyPanel.openButton.andMore', { count: more }));
  try {
    return new Intl.ListFormat(locale, { type: 'conjunction' }).format(shown);
  } catch {
    return shown.join(', ');
  }
}
