import type { Screen, GlobalSettings, DisplayNode } from '@/types/config';

/**
 * Whether automatic rotation is off for a display: its own override when it
 * has one, else the shared default, at or below zero. The screen settings
 * panel and the screen tabs both read this, so the sentence and the badges
 * can never disagree.
 */
export function isRotationOff(
  settings: Pick<GlobalSettings, 'rotationIntervalMs'>,
  display: Pick<DisplayNode, 'settings'> | undefined,
): boolean {
  return (display?.settings?.rotationIntervalMs ?? settings.rotationIntervalMs) <= 0;
}

/**
 * Resolves the effective auto-rotation duration for a screen.
 *
 * Precedence: settings.rotationIntervalMs of 0 (automatic rotation off for
 * the display) wins over everything; then screen.rotationDurationMs (if set);
 * then settings.rotationIntervalMs. A per-screen value of 0 means "sticky"
 * (never auto-advance), and is returned as-is so callers can distinguish it
 * from the global default.
 *
 * Returns milliseconds. A return value of `0` means the screen is
 * sticky — callers must not schedule an auto-advance timer.
 */
export function resolveScreenDuration(
  screen: Screen,
  settings: GlobalSettings,
): number {
  if (settings.rotationIntervalMs <= 0) return 0;
  return screen.rotationDurationMs ?? settings.rotationIntervalMs;
}
