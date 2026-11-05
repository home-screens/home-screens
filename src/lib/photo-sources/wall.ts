import { starterBackgroundsIn } from '@/lib/starter-backgrounds';
import type { PhotoSourceAdapter } from './types';

/**
 * The walls that come with Home Screens (the plain colors and the patterns),
 * for a rotating background only. The picture is a static file the wall
 * already has, so a pick is its path, never a download. A slideshow is never
 * offered this kind (`offeredFor`), so `list` has nothing to say.
 */
export const wallPhotoSource: PhotoSourceAdapter<'wall'> = {
  kind: 'wall',

  async list() {
    return [];
  },

  async pickOne({ source, previous }) {
    const chosen = new Set(source.ids);
    const walls = starterBackgroundsIn(source.group).filter((wall) => chosen.has(wall.id));
    if (walls.length === 0) return null;
    // A rotation that lands on the wall already showing doesn't rotate.
    const others = walls.length > 1 ? walls.filter((wall) => wall.path !== previous) : walls;
    return { kind: 'static', path: others[Math.floor(Math.random() * others.length)].path };
  },
};
