import type { Screen } from '@/types/config';
import { isScreenEmpty } from '@/lib/display-filter';
import { isPinnedModule } from '@/lib/pinned-modules';

/**
 * The screens the wall actually cycles through.
 *
 * A screen with nothing on it is not content, it is a screen somebody has not
 * finished yet: adding one in the editor used to put it straight into the
 * rotation, so a wall that cycled three screens went black for a whole
 * interval in every four with nothing anywhere to say why.
 *
 * "Nothing on it" is `isScreenEmpty`: no modules AND no background of its own.
 * A wallpaper-only screen is deliberate content and keeps rotating, and so
 * does a screen whose modules are all switched off or outside their schedule
 * window: somebody put those there, and the wall showing an authored screen
 * as blank is a different conversation from the wall showing a screen nobody
 * has filled in yet.
 *
 * A screen whose only modules are drawn elsewhere (shown on every screen, or
 * hidden background copies) has nothing of its own to show either: a
 * dedicated "Dock" screen holding the pinned dock would otherwise get a turn
 * as a blank screen with the dock over it, plus a dot and a dock tile.
 *
 * When every screen is empty the whole list comes back unchanged. That is the
 * fresh-install shape, where the display's setup watermark (see the hint in
 * ScreenRotator) is the right answer rather than an empty rotation, and it
 * mirrors the same "better to show something" fallback the schedule and
 * profile filters above it already use.
 */
export function selectRotatingScreens(screens: Screen[]): Screen[] {
  const withContent = screens.filter((screen) => !hasNothingOfItsOwn(screen));
  return withContent.length > 0 ? withContent : screens;
}

function hasNothingOfItsOwn(screen: Screen): boolean {
  if (isScreenEmpty(screen)) return true;
  return !screen.backgroundImage
    && !screen.backgroundRotation?.enabled
    && screen.modules.every((mod) => isPinnedModule(mod) || mod.backgroundProvider === true);
}
