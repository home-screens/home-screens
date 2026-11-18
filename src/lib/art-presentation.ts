import type { ArtFit, ArtFrame, ArtLabel, ArtMat, ArtWall } from '@/types/config';

/**
 * How a painting is hung: the colours the editor's swatches show and the hub
 * paints with, and where everything sits on a screen. Pure, so the hub that
 * composes the picture, the wall that draws the label over it and the editor
 * all read the same numbers.
 *
 * Sizes are in "units": one unit is a pixel on a 1080 pixel wide wall, and
 * everything scales with the shorter side of the screen.
 */

export const ART_WALL_COLORS: Readonly<Record<Exclude<ArtWall, 'painting'>, string>> = {
  'charcoal': '#2a2b2e',
  'warm-white': '#d9d3c6',
  'sage': '#3c4a43',
};
export const ART_MAT_COLORS: Readonly<Record<Exclude<ArtMat, 'painting' | 'none'>, string>> = {
  cream: '#ece6d8',
  white: '#f6f4ef',
  charcoal: '#2b2b2e',
};
export const ART_FRAME_COLORS: Readonly<Record<ArtFrame, string>> = {
  black: '#1b1b1d',
  oak: '#6b4a2b',
  gold: '#c9b27a',
  white: '#f2f0ea',
};

/** How long a `brief` museum label stays before it fades. */
export const ART_LABEL_SECONDS = 15;

type Rgb = readonly [number, number, number];
const CREAM: Rgb = [237, 231, 218];

export const hexOf = ([r, g, b]: Rgb) => `#${[r, g, b].map((c) => Math.round(Math.min(Math.max(c, 0), 255)).toString(16).padStart(2, '0')).join('')}`;
export function rgbOf(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** 0 (black) to 1 (white), as the eye weighs the channels. */
export const lightnessOf = (hex: string) => { const [r, g, b] = rgbOf(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

/** "From the painting": the painting's average colour, pulled almost half way to cream so it sits back behind the picture. */
export function mutedTone(average: Rgb): string {
  let tone = [0, 1, 2].map((i) => average[i] * 0.55 + CREAM[i] * 0.45);
  // A dark painting would give a murky mid-grey: lift it until dark lettering reads on it.
  for (let step = 0; step < 6 && lightnessOf(hexOf(tone as unknown as Rgb)) < 0.6; step++) tone = tone.map((c, i) => c * 0.8 + CREAM[i] * 0.2);
  return hexOf(tone as unknown as Rgb);
}

/** Lettering printed on a mat: light on charcoal, dark on everything else (a colour taken from the painting is always a light one). */
export const matLettering = (mat: ArtMat): 'dark' | 'light' => (mat === 'charcoal' ? 'light' : 'dark');

export interface Box { x: number; y: number; w: number; h: number }

export interface ArtLayout {
  /** Pixels per unit on this screen. */
  unit: number;
  /** Where the painting itself shows. */
  opening: Box;
  /** The frame's outer edge (`framed` only). */
  frame?: Box;
  /** Thickness of the frame's moulding, the mat between frame and painting, and the mat's cut edge. */
  moulding: number;
  mat: number;
  bevel: number;
  /** Where the museum label goes, or `null` when the hanging has no place for one (a frame with no mat on a wide screen). */
  label: ArtLabelPlace | null;
}

export interface ArtLabelPlace {
  /** `placard` is a small card on the wall; `printed` is lettering straight on the mat, centred under the painting. */
  style: 'placard' | 'printed';
  x: number;
  y: number;
  w: number;
  /** Lettering colour for `printed`: dark on a light mat, light on a dark one. */
  tone: 'dark' | 'light';
  unit: number;
  /**
   * `printed` inside a frame: the depth of mat under the painting, which the
   * lettering sits in the middle of. It is two short lines, set smaller than
   * on a mat that fills the screen, and `y` is the painting's bottom edge.
   */
  band?: number;
}

const PLACARD_W = 330;

/** The card in the bottom corner, for a painting that fills the screen or sits on a blur. */
export function cornerLabel(canvas: { w: number; h: number }): ArtLabelPlace {
  const unit = Math.min(canvas.w, canvas.h) / 1080;
  return { style: 'placard', x: canvas.w - (PLACARD_W + 64) * unit, y: canvas.h - 250 * unit, w: PLACARD_W * unit, tone: 'dark', unit };
}

/**
 * Bumped whenever a hung painting would be painted differently for the same
 * choices (a new layout, a new shadow). It is part of the saved picture's
 * name, so a wall is never handed a copy painted the old way.
 */
export const ART_HANGING_VERSION = 4;

/** The gap between a frame and the card under it, and the least wall left at the sides of a wide screen. */
const PLACARD_GAP = 70;
const EDGE = 64;
/** A wide screen: the wall left above and below the frame. */
const WALL_ABOVE = 48;
const WALL_BELOW = 68;

/** The largest `aspect` box inside `maxW` by `maxH`. */
function fitted(aspect: number, maxW: number, maxH: number): { w: number; h: number } {
  const w = Math.min(maxW, maxH * aspect);
  return { w, h: w / aspect };
}

/**
 * Where a painting of `aspect` (width over height) hangs on `canvas`.
 *
 * The painting is as large as its margins allow, in the middle of the screen
 * from side to side, and a little above the middle from top to bottom, as
 * pictures hang on a wall. A tall screen has wall to spare under the frame,
 * so the label is a card there. A wide one has none: a card beside the frame
 * would cost the painting half its size, so the frame is sized by the
 * screen's height and the label is two short lines printed on the mat under
 * the painting. The mat stays even all round: a strip cut deeper to hold a
 * bigger label is a blank band whenever the label is not up. With no mat
 * there is nowhere to print, and the layout has no label.
 */
export function artLayout(fit: Extract<ArtFit, 'framed' | 'mat'>, aspect: number, canvas: { w: number; h: number }, mat: ArtMat, matTone: 'dark' | 'light' = 'dark'): ArtLayout {
  const unit = Math.min(canvas.w, canvas.h) / 1080;
  const wide = canvas.w > canvas.h;
  const framed = fit === 'framed';
  const moulding = framed ? Math.round(16 * unit) : 0;
  const matWidth = framed && mat !== 'none' ? Math.round(74 * unit) : 0;
  const edge = moulding + matWidth;
  const bevel = matWidth > 0 ? Math.round(6 * unit) : 0;

  if (framed && wide) {
    const above = WALL_ABOVE * unit;
    const size = fitted(aspect, canvas.w - 2 * (EDGE * unit + edge), canvas.h - above - WALL_BELOW * unit - 2 * edge);
    const [w, h] = [Math.round(size.w), Math.round(size.h)];
    // A frame shorter than the screen allows keeps the same share of the spare wall above it.
    const top = Math.round(Math.max(above, (canvas.h - (h + 2 * edge)) * WALL_ABOVE / (WALL_ABOVE + WALL_BELOW)));
    const opening = { x: Math.round((canvas.w - w) / 2), y: top + edge, w, h };
    const frame = { x: opening.x - edge, y: top, w: w + 2 * edge, h: h + 2 * edge };
    const inset = moulding + Math.round(20 * unit);
    const label: ArtLabelPlace | null = matWidth > 0
      ? { style: 'printed', x: frame.x + inset, y: opening.y + h, w: frame.w - 2 * inset, tone: matTone, unit, band: matWidth }
      : null;
    return { unit, opening, frame, moulding, mat: matWidth, bevel, label };
  }

  const side = (framed ? 190 : 92) * unit;
  const topMin = (framed ? 230 : 150) * unit;
  const centre = framed ? 0.43 : 0.45;
  const reserve = (framed ? 420 : wide ? 250 : 330) * unit;
  const { w, h } = fitted(aspect, canvas.w - 2 * side, canvas.h - topMin - reserve);
  const y = Math.max(topMin, h < canvas.h * 0.6 ? Math.min(centre * canvas.h - h / 2, canvas.h - reserve - h) : (canvas.h - reserve - h) / 2);
  const opening = { x: Math.round((canvas.w - w) / 2), y: Math.round(y), w: Math.round(w), h: Math.round(h) };

  if (!framed) {
    return {
      unit, opening, moulding: 0, mat: 0, bevel: Math.round(7 * unit),
      label: { style: 'printed', x: opening.x, y: opening.y + opening.h + Math.round(54 * unit), w: opening.w, tone: matTone, unit },
    };
  }
  const frame = { x: opening.x - edge, y: opening.y - edge, w: opening.w + 2 * edge, h: opening.h + 2 * edge };
  const placardW = Math.round(PLACARD_W * unit);
  // The card's right edge sits under the frame's.
  const label: ArtLabelPlace = { style: 'placard', x: frame.x + frame.w - placardW, y: frame.y + frame.h + Math.round(PLACARD_GAP * unit), w: placardW, tone: 'dark', unit };
  return { unit, opening, frame, moulding, mat: matWidth, bevel, label };
}

/** What the wall needs to know about the painting behind a screen: who made it, and how to label it. */
export interface ArtCaption {
  /** Wikidata id. */
  id: string;
  /** File name on Wikimedia Commons, for "About this painting". */
  file: string;
  title: string;
  artist?: string;
  year?: number;
  museum?: string;
  label: ArtLabel;
  place: ArtLabelPlace;
  /** Grow and slide slowly (a painting that fills the screen). */
  drift?: boolean;
}

/** A picture's credit as the wall shows it; `art` rides along for a painting. */
export interface PictureCredit { name: string; source: string; art?: ArtCaption }

export function isArtCaption(value: unknown): value is ArtCaption {
  const v = value as ArtCaption | null;
  return !!v && typeof v === 'object' && typeof v.id === 'string' && typeof v.title === 'string' && typeof v.file === 'string'
    && !!v.place && typeof v.place.x === 'number' && typeof v.place.y === 'number' && typeof v.place.w === 'number'
    && (v.label === 'brief' || v.label === 'always' || v.label === 'off');
}
