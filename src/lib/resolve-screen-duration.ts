import type { Screen, GlobalSettings } from '@/types/config';

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
 */
export function resolveScreenDuration(
  screen: Screen,
  settings: GlobalSettings,
): number {
  return screen.rotationDurationMs ?? settings.rotationIntervalMs;
}
