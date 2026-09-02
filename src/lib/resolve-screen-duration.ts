import type { Screen, GlobalSettings } from '@/types/config';
import { MIN_SCREEN_DURATION_MS } from '@/lib/constants';

/**
 * Resolves the effective auto-rotation duration for a screen.
 *
 * The fallback chain is Screen > Global. Display-level overrides flow
 * through `settings` because `filterConfigForDisplay` already folds
 * `DisplayNodeSettings.rotationIntervalMs` into the returned settings,
 * so this helper does not need to know about the display registry.
 *
 * Returns milliseconds. A return value of `0` means the screen is
 * sticky — callers must not schedule an auto-advance timer.
 *
 * A positive per-screen override is held to `MIN_SCREEN_DURATION_MS`: the
 * editor already refuses to save less, and this catches configs written
 * before the floor existed. The global default is returned as-is.
 */
export function resolveScreenDuration(
  screen: Screen,
  settings: GlobalSettings,
): number {
  const override = screen.rotationDurationMs;
  if (override === undefined) return settings.rotationIntervalMs;
  if (override <= 0) return 0;
  return Math.max(override, MIN_SCREEN_DURATION_MS);
}
