import type { ArtFit, ArtFrame, ArtMat, ArtWall } from '@/types/config';
import { ART_FRAME_COLORS, ART_MAT_COLORS, ART_WALL_COLORS, artLayout, lightnessOf, matLettering, mutedTone, type ArtLayout, type Box } from '@/lib/art-presentation';

/**
 * Paints a painting hung on a wall: `framed` in a mat and a frame on a
 * coloured wall, `mat` in a mat that fills the screen. The hub does this once
 * per picture and the wall shows the result like any other background, so a
 * Pi's browser never has to lay shadows and textures over each other.
 *
 * The look is the approved mockup's (`.claude/mockups/art-display-effects.html`,
 * and `art-wide-frame-strip.html` for a wide screen): a cut bevel where the
 * mat meets the painting, a soft shadow in the opening, paper grain on the
 * mat, a faint canvas weave over the painting, and the frame's shadow falling
 * down the wall.
 */

export interface ArtHanging {
  fit: Extract<ArtFit, 'framed' | 'mat'>;
  wall: ArtWall;
  mat: ArtMat;
  frame: ArtFrame;
  texture: boolean;
}

export interface ComposedArt {
  data: Buffer;
  contentType: string;
  layout: ArtLayout;
}

type Canvas = { w: number; h: number };

const rect = ({ x, y, w, h }: Box, attrs: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${attrs}/>`;
const grow = ({ x, y, w, h }: Box, by: number): Box => ({ x: x - by, y: y - by, w: w + 2 * by, h: h + 2 * by });

/** A soft dark edge just inside `box`, as a shadow cast into it: `blur` wide, shifted by `dx`, `dy`. */
function insetShadow(id: string, box: Box, blur: number, opacity: number, dx = 0, dy = 0): string {
  const band = blur * 2;
  return `<clipPath id="${id}c">${rect(box, '')}</clipPath><filter id="${id}f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${blur / 2}"/></filter>`
    + `<g clip-path="url(#${id}c)">${rect({ x: box.x - band / 2 + dx, y: box.y - band / 2 + dy, w: box.w + band, h: box.h + band }, `fill="none" stroke="#000" stroke-opacity="${opacity}" stroke-width="${band}" filter="url(#${id}f)"`)}</g>`;
}

/** A shadow thrown by `box` onto what is behind it. */
function dropShadow(id: string, box: Box, blur: number, opacity: number, dy: number): string {
  return `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${blur / 2}"/></filter>${rect({ ...box, y: box.y + dy }, `fill="#000" fill-opacity="${opacity}" filter="url(#${id})"`)}`;
}

/** The mat's cut edge around the opening: the white core catches the light at the bottom and right, and is in shade at the top. */
function bevel(opening: Box, width: number): string {
  if (width <= 0) return '';
  const o = grow(opening, width);
  const [ox, oy, ox2, oy2] = [o.x, o.y, o.x + o.w, o.y + o.h];
  const [ix, iy, ix2, iy2] = [opening.x, opening.y, opening.x + opening.w, opening.y + opening.h];
  const side = (points: number[], fill: string) => `<polygon points="${points.join(' ')}" fill="${fill}"/>`;
  return side([ox, oy, ox2, oy, ix2, iy, ix, iy], '#cfc8b8')
    + side([ox2, oy, ox2, oy2, ix2, iy2, ix2, iy], '#f6f3ec')
    + side([ox, oy2, ox2, oy2, ix2, iy2, ix, iy2], '#fffdf8')
    + side([ox, oy, ix, iy, ix, iy2, ox, oy2], '#e6e0d2')
    + rect(o, 'fill="none" stroke="#000" stroke-opacity="0.07" stroke-width="1"');
}

function wallSvg(canvas: Canvas, layout: ArtLayout, colors: { wall: string; mat: string | null; frame: string }): string {
  const u = layout.unit;
  const all: Box = { x: 0, y: 0, w: canvas.w, h: canvas.h };
  const parts: string[] = [rect(all, `fill="${colors.wall}"`)];
  if (layout.frame) {
    // Light falls from above the picture: the wall is a little brighter there and falls away to the corners.
    const light = lightnessOf(colors.wall) > 0.5;
    // Two washes, one of light and one of shade, so the wall darkens to its corners without greying in between.
    const spot = `gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(${canvas.w / 2} ${canvas.h * 0.36}) scale(${canvas.w * 1.2} ${canvas.h * 0.7})"`;
    const dark = light ? '#3c2d14' : '#000';
    parts.push(`<radialGradient id="lit" ${spot}><stop offset="0" stop-color="#fff" stop-opacity="${light ? 0.22 : 0.07}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
      + `<radialGradient id="shade" ${spot}><stop offset="0" stop-color="${dark}" stop-opacity="0"/><stop offset="1" stop-color="${dark}" stop-opacity="${light ? 0.16 : 0.28}"/></radialGradient>`,
    rect(all, 'fill="url(#lit)"'), rect(all, 'fill="url(#shade)"'));
    parts.push(dropShadow('s1', layout.frame, 90 * u, 0.25, 50 * u), dropShadow('s2', layout.frame, 46 * u, 0.45, 22 * u), dropShadow('s3', layout.frame, 4 * u, 0.5, 2 * u));
    parts.push(rect(layout.frame, `fill="${colors.frame}"`));
    parts.push(rect({ ...layout.frame, h: 1 }, 'fill="#fff" fill-opacity="0.14"'), rect({ ...layout.frame, y: layout.frame.y + layout.frame.h - 1, h: 1 }, 'fill="#000" fill-opacity="0.4"'));
    const inside = grow(layout.frame, -layout.moulding);
    if (colors.mat) parts.push(rect(inside, `fill="${colors.mat}"`));
    // The moulding stands proud of what it holds and shades its top edge.
    parts.push(insetShadow('m', inside, 7 * u, 0.4, 0, 3 * u));
  }
  parts.push(bevel(layout.opening, layout.bevel));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.w}" height="${canvas.h}" viewBox="0 0 ${canvas.w} ${canvas.h}">${parts.join('')}</svg>`;
}

/** The shadow the mat (or the frame) casts into the opening, deepest along the top. */
function recessSvg(w: number, h: number, u: number): string {
  const box: Box = { x: 0, y: 0, w, h };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + insetShadow('a', box, 12 * u, 0.42, 0, 5 * u) + insetShadow('b', box, 3 * u, 0.5) + insetShadow('c', box, 9 * u, 0.14, 4 * u, 0) + insetShadow('d', box, 7 * u, 0.1, -3 * u, 0)
    + '</svg>';
}

/** A 4 pixel weave, light and dark threads over grey, laid over the painting in soft light. */
const WEAVE = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#808080" fill-opacity="0.2"/><path d="M0 0h2v2H0zM2 2h2v2H2z" fill="#a8a8a8" fill-opacity="0.2"/><path d="M2 0h2v2H2zM0 2h2v2H0z" fill="#606060" fill-opacity="0.2"/></svg>');

/** `layout` is the one the caller already told the wall about, so the label lands where the picture expects it. */
export async function composeArtWall(image: Buffer, hanging: ArtHanging, canvas: Canvas, layout?: ArtLayout): Promise<ComposedArt | null> {
  const sharp = (await import('sharp')).default;
  const upright = await sharp(image).rotate().toBuffer({ resolveWithObject: true });
  const { width, height } = upright.info;
  if (!width || !height) return null;

  const fromPainting = async () => {
    const { data } = await sharp(upright.data).resize(8, 8, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 3) { sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; }
    return mutedTone([sum[0] / 64, sum[1] / 64, sum[2] / 64]);
  };
  const framed = hanging.fit === 'framed';
  const matColor = hanging.mat === 'none' ? null : hanging.mat === 'painting' ? await fromPainting() : ART_MAT_COLORS[hanging.mat];
  // A mat that fills the screen is the wall.
  const wall = framed ? (hanging.wall === 'painting' ? await fromPainting() : ART_WALL_COLORS[hanging.wall]) : (matColor ?? ART_MAT_COLORS.cream);
  const paper = framed ? matColor : wall;
  const placed = layout ?? artLayout(hanging.fit, width / height, canvas, hanging.mat, matLettering(hanging.mat));
  const { opening } = placed;

  const layers: Array<{ input: Buffer; left: number; top: number; blend?: 'over' | 'soft-light' }> = [];
  if (paper) {
    // Paper grain on the mat: fine noise in soft light, too faint to see as dots.
    const sheet = placed.frame ? grow(placed.frame, -placed.moulding) : { x: 0, y: 0, w: canvas.w, h: canvas.h };
    const grain = await sharp({ create: { width: Math.round(sheet.w), height: Math.round(sheet.h), channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 22 } } })
      .ensureAlpha(0.16).png().toBuffer();
    layers.push({ input: grain, left: Math.round(sheet.x), top: Math.round(sheet.y), blend: 'soft-light' });
  }
  const overPainting = [
    ...(hanging.texture ? [{ input: WEAVE, tile: true, blend: 'soft-light' as const }] : []),
    { input: Buffer.from(recessSvg(opening.w, opening.h, placed.unit)), left: 0, top: 0 },
  ];
  const painting = await sharp(upright.data).resize(opening.w, opening.h, { fit: 'cover' }).composite(overPainting).png().toBuffer();
  layers.push({ input: painting, left: opening.x, top: opening.y });

  const data = await sharp(Buffer.from(wallSvg(canvas, placed, { wall, mat: matColor, frame: ART_FRAME_COLORS[hanging.frame] })))
    .composite(layers).jpeg({ quality: 88 }).toBuffer();
  return { data, contentType: 'image/jpeg', layout: placed };
}
