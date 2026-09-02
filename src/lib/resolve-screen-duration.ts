import type { Screen, GlobalSettings } from '@/types/config';

/**
 * Resolves the effective auto-rotation duration for a screen.
 *
 * Precedence: screen.rotationDurationMs (if set) → settings.rotationIntervalMs.
 * A per-screen value of 0 means "sticky" (never auto-advance), and is returned
 * as-is so callers can distinguish it from the global default.
 *
 * Returns milliseconds. A return value of `0` means the screen is
 * sticky — callers must not schedule an auto-advance timer.
 */
export function resolveScreenDuration(
  screen: Screen,
  settings: GlobalSettings,
): number {
  return screen.rotationDurationMs ?? settings.rotationIntervalMs;
}
