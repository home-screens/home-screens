import type { BackgroundRotation, PhotoSource, Screen } from '@/types/config';
import { displaySizedUrl, type PictureBox } from '@/lib/media-paths';
import { isRotationActive, normalizePhotoSource } from '@/lib/photo-source';

export { isRotationActive };

/**
 * What background rotation has answered for one screen: the photo it is
 * showing, `null` when it has none (the screen's own picture stands), or
 * `undefined` while no answer has come back yet.
 */
export type RotationAnswer = string | null | undefined;

export const DEFAULT_ROTATION_INTERVAL_MINUTES = 60;

/**
 * A screen's rotation after an edit, always a complete `BackgroundRotation`:
 * the one place its shape is built, so no component carries the defaults.
 * `sources` replaces the list when given; `source` adds or replaces the
 * entry of its kind (and, for walls, its group), and `remove` takes that
 * kind's entry out. Entries that are not sources are dropped on the way.
 */
export interface RotationUpdate {
  intervalMinutes?: number;
  /** The whole list, replacing what is there. */
  sources?: PhotoSource[];
  /** One source, added or replacing the entry of its kind (and group, for walls). */
  source?: PhotoSource;
  /** The entry of this kind (and group, for walls) taken out. */
  remove?: { kind: PhotoSource['kind']; group?: 'color' | 'pattern' };
}

export function withRotationUpdate(current: BackgroundRotation | undefined, update: RotationUpdate): BackgroundRotation {
  const same = (a: PhotoSource, b: { kind: PhotoSource['kind']; group?: 'color' | 'pattern' }) =>
    a.kind === b.kind && (a.kind !== 'wall' || b.group === undefined || a.group === b.group);
  let sources = (update.sources ?? current?.sources ?? [])
    .map(normalizePhotoSource)
    .filter((source): source is PhotoSource => source !== null);
  if (update.source) {
    const next = normalizePhotoSource(update.source);
    if (next) {
      const at = sources.findIndex((source) => same(source, next.kind === 'wall' ? { kind: 'wall', group: next.group } : { kind: next.kind }));
      sources = at === -1 ? [...sources, next] : sources.map((source, i) => (i === at ? next : source));
    }
  }
  if (update.remove) sources = sources.filter((source) => !same(source, update.remove!));
  const intervalMinutes = update.intervalMinutes ?? current?.intervalMinutes ?? DEFAULT_ROTATION_INTERVAL_MINUTES;
  return { intervalMinutes, sources };
}

/** The rotation with its sources emptied: the screen keeps its own picture. */
export function stopBackgroundRotation(rotation: BackgroundRotation | undefined): BackgroundRotation | undefined {
  if (!rotation) return undefined;
  return withRotationUpdate(rotation, { sources: [] });
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
 * What picking a background by hand does to a screen, from the Image Library
 * or an upload: the picture becomes the screen's own, and rotation stops. A
 * rotating screen would paint over the choice within the hour, which reads
 * as "it didn't save".
 */
export function pickedBackground(
  screen: Pick<Screen, 'backgroundRotation'> | undefined,
  backgroundImage: string,
): Pick<Screen, 'backgroundImage' | 'backgroundRotation'> {
  if (!isRotationActive(screen?.backgroundRotation)) return { backgroundImage };
  return { backgroundImage, backgroundRotation: stopBackgroundRotation(screen?.backgroundRotation) };
}
