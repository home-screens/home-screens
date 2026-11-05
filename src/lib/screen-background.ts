import type { BackgroundRotationSourceId, Screen } from '@/types/config';
import { displaySizedUrl, type PictureBox } from '@/lib/media-paths';

/**
 * What background rotation has answered for one screen: the photo it is
 * showing, `null` when it has none (the screen's own picture stands), or
 * `undefined` while no answer has come back yet.
 */
export type RotationAnswer = string | null | undefined;

const ROTATION_SOURCE_IDS: ReadonlySet<string> = new Set(['unsplash', 'nasa-apod', 'immich', 'icloud', 'local', 'color', 'pattern']);

/**
 * The sources rotation really uses. A saved entry for a source that no longer
 * exists (the old `theme` source) is ignored: it has no checkbox, so nothing
 * in the editor could switch it off, yet it kept winning refreshes.
 */
export function activeRotationSources(rotation: Screen['backgroundRotation'] | undefined): BackgroundRotationSourceId[] {
  return (rotation?.sources ?? []).filter((source) => ROTATION_SOURCE_IDS.has(source));
}

/** A selected source activates rotation; the legacy `enabled` flag does not. */
export function isRotationActive(rotation: Screen['backgroundRotation'] | undefined): boolean {
  return activeRotationSources(rotation).length > 0;
}

export function stopBackgroundRotation(rotation: Screen['backgroundRotation'] | undefined): Screen['backgroundRotation'] | undefined {
  if (!rotation) return undefined;
  const { enabled: _enabled, ...rest } = rotation;
  return { ...rest, sources: [] };
}

/**
 * The picture a screen paints behind its modules, on the wall and in the
 * editor alike. With rotation on, the screen's own picture is only what the
 * rotation falls back to, so nothing paints until the first answer is in:
 * painting the own picture meant every load showed it and then swapped the
 * photo in over it.
 */
export function resolveScreenBackground(
  screen: Pick<Screen, 'backgroundImage' | 'backgroundRotation'>,
  rotation: RotationAnswer,
): string | undefined {
  if (!isRotationActive(screen.backgroundRotation)) return screen.backgroundImage || undefined;
  if (rotation === undefined) return undefined;
  return rotation || screen.backgroundImage || undefined;
}

/**
 * The URL the wall fetches for a screen's picture: a library picture is asked
 * for at the canvas size rather than as the camera original. The rotator's
 * preload and the renderer must agree on it, or the preload warms a picture
 * the screen never asks for.
 */
export function screenBackgroundSrc(
  screen: Pick<Screen, 'backgroundImage' | 'backgroundRotation'>,
  rotation: RotationAnswer,
  canvas: PictureBox,
): string | undefined {
  return displaySizedUrl(resolveScreenBackground(screen, rotation), canvas);
}

/**
 * What picking a background by hand does to a screen, from any tab of the
 * background picker or an upload: the picture becomes the screen's own, and
 * rotation stops. A rotating screen would paint over the choice within the
 * hour, which reads as "it didn't save".
 */
export function pickedBackground(
  screen: Pick<Screen, 'backgroundRotation'> | undefined,
  backgroundImage: string,
): Pick<Screen, 'backgroundImage' | 'backgroundRotation'> {
  if (!isRotationActive(screen?.backgroundRotation)) return { backgroundImage };
  return { backgroundImage, backgroundRotation: stopBackgroundRotation(screen?.backgroundRotation) };
}
