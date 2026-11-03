export type Orientation = 'portrait' | 'landscape';

/**
 * Which way a module's box faces, from its rendered size. The full-screen
 * modules pick a different arrangement for each, not a rescaling of the
 * other. A square box counts as portrait: it reads correctly as a vertical
 * stack, while splitting it into two columns leaves both too narrow.
 */
export function getOrientation(width: number, height: number): Orientation {
  return width > height ? 'landscape' : 'portrait';
}
