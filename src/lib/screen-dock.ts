import type { DockButton, ModuleType, Screen } from '@/types/config';

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
