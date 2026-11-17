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
  /** Where the museum label goes. */
  label: ArtLabelPlace;
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
export const ART_HANGING_VERSION = 2;

/** The room a card needs: its own height with a title that wraps once, and the gap between it and the frame. */
const PLACARD_H = 170;
const PLACARD_GAP = 70;
const EDGE = 64;

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
 * pictures hang on a wall. A tall screen keeps room for the label
 * underneath. A wide one has little height to spare, so the card goes beside
 * the frame or under its right edge, whichever leaves the painting larger;
 * the frame stays in the middle either way.
 */
export function artLayout(fit: Extract<ArtFit, 'framed' | 'mat'>, aspect: number, canvas: { w: number; h: number }, mat: ArtMat, matTone: 'dark' | 'light' = 'dark'): ArtLayout {
  const unit = Math.min(canvas.w, canvas.h) / 1080;
  const wide = canvas.w > canvas.h;
  const framed = fit === 'framed';
  const side = (framed ? 190 : 92) * unit;
  const topMin = (framed ? 230 : 150) * unit;
  const centre = framed ? 0.43 : 0.45;
  const moulding = framed ? Math.round(16 * unit) : 0;
  const matWidth = framed && mat !== 'none' ? Math.round(74 * unit) : 0;
  const edge = moulding + matWidth;
  const placardW = Math.round(PLACARD_W * unit);

  // The two places a card can go on a wide screen, and the painting each leaves room for.
  const beside = fitted(aspect, canvas.w - 2 * ((PLACARD_W + PLACARD_GAP + EDGE) * unit + edge), canvas.h - topMin - 230 * unit);
  const under = fitted(aspect, canvas.w - 2 * side, canvas.h - topMin - edge - (PLACARD_GAP + PLACARD_H + EDGE) * unit);
  const cardUnder = !(framed && wide) || under.w * under.h > beside.w * beside.h;
  const reserve = framed && wide ? canvas.h - topMin - (cardUnder ? under.h : beside.h) : (framed ? 420 : wide ? 250 : 330) * unit;
  const { w, h } = framed && wide ? (cardUnder ? under : beside) : fitted(aspect, canvas.w - 2 * side, canvas.h - topMin - reserve);

  const y = Math.max(topMin, h < canvas.h * 0.6 ? Math.min(centre * canvas.h - h / 2, canvas.h - reserve - h) : (canvas.h - reserve - h) / 2);
  const opening = { x: Math.round((canvas.w - w) / 2), y: Math.round(y), w: Math.round(w), h: Math.round(h) };

  if (!framed) {
    return {
      unit, opening, moulding: 0, mat: 0, bevel: Math.round(7 * unit),
      label: { style: 'printed', x: opening.x, y: opening.y + opening.h + Math.round(54 * unit), w: opening.w, tone: matTone, unit },
    };
  }
  const frame = { x: opening.x - edge, y: opening.y - edge, w: opening.w + 2 * edge, h: opening.h + 2 * edge };
  const label: ArtLabelPlace = cardUnder
    ? { style: 'placard', x: frame.x + frame.w - placardW, y: frame.y + frame.h + Math.round(PLACARD_GAP * unit), w: placardW, tone: 'dark', unit }
    : { style: 'placard', x: frame.x + frame.w + Math.round(PLACARD_GAP * unit), y: frame.y + frame.h - Math.round(150 * unit), w: placardW, tone: 'dark', unit };
  return { unit, opening, frame, moulding, mat: matWidth, bevel: matWidth > 0 ? Math.round(6 * unit) : 0, label };
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
