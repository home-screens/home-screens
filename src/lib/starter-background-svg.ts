/**
 * Turns a starter background's paint description into the SVG file that
 * ships in `public/backgrounds/themes/`.
 *
 * The SVGs carry no width, height or viewBox on purpose. Chromium treats an
 * SVG with no intrinsic size as "as big as the box it is painted into", so
 * one file paints correctly on a portrait wall, a landscape wall and a
 * picker thumbnail alike, with every gradient expressed in fractions of the
 * box (`objectBoundingBox` units). A fixed 1080x1920 file, by contrast, is
 * cropped by `object-fit: cover` on a landscape display and loses its
 * corner glows.
 *
 * Theme walls are converted from the same `bg` + `bgImage` CSS the
 * fullscreen modules paint with, so a regular screen can match a fullscreen
 * screen exactly. Only the subset of CSS the themes use is understood:
 * `radial-gradient(W% H% at X% Y%, ...)` and axis-aligned
 * `linear-gradient(<0|90|180|270>deg, ...)`. Both are exact in fractions of
 * the box on any aspect. A diagonal CSS angle is not: its direction depends
 * on the box's width-to-height ratio, which an aspect-free file cannot
 * know, so it is rejected. Anything else throws too, so a new theme with an
 * unsupported layer fails the build instead of shipping a wrong wall.
 *
 * Diagonal walls are therefore declared as `SlopePaint`: a gradient vector
 * in box fractions, which stretches with the box by definition. The picker
 * thumbnail is the same file, so there is no CSS reference to drift from.
 */

/** A solid colour with optional CSS gradient layers over it, like a theme's tokens. */
export interface GradientPaint {
  bg: string;
  bgImage?: string;
}

/**
 * A linear gradient along a vector given in fractions of the box, from
 * (x1, y1) to (x2, y2). Stops are CSS stop syntax (`#3a1c71`, `#d76d77 60%`).
 */
export interface SlopePaint {
  bg: string;
  vector: [x1: number, y1: number, x2: number, y2: number];
  stops: string[];
}

/** A quiet repeating texture: `ink` marks on `bg`, repeated every `pitch` px. */
export interface PatternPaint {
  pattern: 'dots' | 'grid' | 'diagonal';
  bg: string;
  ink: string;
  pitch: number;
}

export type WallPaint = GradientPaint | SlopePaint | PatternPaint;

export function isPatternPaint(paint: WallPaint): paint is PatternPaint {
  return 'pattern' in paint;
}

export function isSlopePaint(paint: WallPaint): paint is SlopePaint {
  return 'vector' in paint;
}

// ── CSS gradient parsing ───────────────────────────────────────────────────

interface Stop {
  color: string;
  opacity: number;
  /** 0..1 along the gradient line; undefined = spread evenly by the parser. */
  offset?: number;
}

interface LinearLayer {
  kind: 'linear';
  x1: number; y1: number; x2: number; y2: number;
  stops: Stop[];
}

interface RadialLayer {
  kind: 'radial';
  cx: number; cy: number;
  /** Ellipse radii as fractions of the box width and height. */
  rx: number; ry: number;
  stops: Stop[];
}

type Layer = LinearLayer | RadialLayer;

/** Split on commas that are not inside parentheses. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseColor(raw: string, previous: Stop | undefined): { color: string; opacity: number } {
  const value = raw.trim();
  if (value === 'transparent') {
    // CSS interpolates `transparent` in premultiplied space, so the fade never
    // passes through grey. The same colour at opacity 0 gives SVG that result.
    return { color: previous?.color ?? '#000000', opacity: 0 };
  }
  const rgba = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (rgba) {
    const opacity = rgba[4] === undefined ? 1 : Number(rgba[4]);
    return { color: `rgb(${rgba[1]},${rgba[2]},${rgba[3]})`, opacity };
  }
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return { color: value.toLowerCase(), opacity: 1 };
  throw new Error(`Unsupported colour in gradient: "${value}"`);
}

function parseStops(parts: string[]): Stop[] {
  const stops: Stop[] = [];
  for (const part of parts) {
    const m = part.match(/^(.+?)(?:\s+([\d.]+)%)?$/);
    if (!m) throw new Error(`Unsupported gradient stop: "${part}"`);
    const { color, opacity } = parseColor(m[1], stops[stops.length - 1]);
    stops.push({ color, opacity, offset: m[2] === undefined ? undefined : Number(m[2]) / 100 });
  }
  if (stops.length < 2) throw new Error('A gradient needs at least two stops');
  if (stops[0].offset === undefined) stops[0].offset = 0;
  if (stops[stops.length - 1].offset === undefined) stops[stops.length - 1].offset = 1;
  // Spread any unpositioned middle stops evenly between their neighbours,
  // as CSS does.
  for (let i = 1; i < stops.length - 1; i++) {
    if (stops[i].offset !== undefined) continue;
    let next = i + 1;
    while (stops[next].offset === undefined) next++;
    const from = stops[i - 1].offset as number;
    const to = stops[next].offset as number;
    const span = next - (i - 1);
    for (let j = i; j < next; j++) stops[j].offset = from + ((to - from) * (j - (i - 1))) / span;
  }
  return stops;
}

function parseLinear(args: string): LinearLayer {
  const parts = splitTopLevel(args);
  const angle = parts[0].match(/^(-?[\d.]+)deg$/);
  if (!angle) throw new Error(`linear-gradient must start with an angle in degrees: "${parts[0]}"`);
  // CSS: 0deg points up, 90deg right. Only the four axis-aligned angles map
  // exactly onto box fractions; a diagonal's direction depends on the box
  // aspect, which this file cannot know (see the header).
  const degrees = ((Number(angle[1]) % 360) + 360) % 360;
  const AXIS: Record<number, [number, number, number, number]> = {
    0: [0.5, 1, 0.5, 0],
    90: [0, 0.5, 1, 0.5],
    180: [0.5, 0, 0.5, 1],
    270: [1, 0.5, 0, 0.5],
  };
  const vector = AXIS[degrees];
  if (!vector) {
    throw new Error(
      `linear-gradient(${parts[0]}) is not axis-aligned; a diagonal renders at a different angle on each aspect. Use SlopePaint for a diagonal wall.`,
    );
  }
  const [x1, y1, x2, y2] = vector;
  return { kind: 'linear', x1, y1, x2, y2, stops: parseStops(parts.slice(1)) };
}

function parseRadial(args: string): RadialLayer {
  const parts = splitTopLevel(args);
  const shape = parts[0].match(/^([\d.]+)%\s+([\d.]+)%\s+at\s+(-?[\d.]+)%\s+(-?[\d.]+)%$/);
  if (!shape) throw new Error(`radial-gradient must be "W% H% at X% Y%": "${parts[0]}"`);
  return {
    kind: 'radial',
    rx: Number(shape[1]) / 100, ry: Number(shape[2]) / 100,
    cx: Number(shape[3]) / 100, cy: Number(shape[4]) / 100,
    stops: parseStops(parts.slice(1)),
  };
}

/** Parse a CSS `background-image` list into layers, first layer on top. */
export function parseGradientLayers(css: string): Layer[] {
  return splitTopLevel(css).map((layer) => {
    const m = layer.match(/^(linear|radial)-gradient\((.*)\)$/s);
    if (!m) throw new Error(`Unsupported background layer: "${layer}"`);
    return m[1] === 'linear' ? parseLinear(m[2]) : parseRadial(m[2]);
  });
}

// ── SVG output ─────────────────────────────────────────────────────────────

function num(n: number): string {
  return String(Number(n.toFixed(4)));
}

function stopsSvg(stops: Stop[]): string {
  return stops
    .map((s) => {
      const opacity = s.opacity === 1 ? '' : ` stop-opacity="${num(s.opacity)}"`;
      return `      <stop offset="${num(s.offset as number)}" stop-color="${s.color}"${opacity}/>`;
    })
    .join('\n');
}

function layerDef(layer: Layer, id: string): string {
  if (layer.kind === 'linear') {
    return `    <linearGradient id="${id}" x1="${num(layer.x1)}" y1="${num(layer.y1)}" x2="${num(layer.x2)}" y2="${num(layer.y2)}">\n${stopsSvg(layer.stops)}\n    </linearGradient>`;
  }
  // objectBoundingBox units are already per-axis fractions, so the x radius
  // is the circle's radius and the y radius is a scale about the centre.
  const scale = layer.ry / layer.rx;
  const transform = ` gradientTransform="translate(${num(layer.cx)} ${num(layer.cy)}) scale(1 ${num(scale)}) translate(${num(-layer.cx)} ${num(-layer.cy)})"`;
  return `    <radialGradient id="${id}" cx="${num(layer.cx)}" cy="${num(layer.cy)}" r="${num(layer.rx)}"${transform}>\n${stopsSvg(layer.stops)}\n    </radialGradient>`;
}

const FULL = '<rect width="100%" height="100%"';

function gradientSvg(paint: GradientPaint | SlopePaint): string {
  const layers: Layer[] = isSlopePaint(paint)
    ? [{ kind: 'linear', x1: paint.vector[0], y1: paint.vector[1], x2: paint.vector[2], y2: paint.vector[3], stops: parseStops(paint.stops) }]
    : paint.bgImage ? parseGradientLayers(paint.bgImage) : [];
  // CSS lists the top layer first; SVG paints later elements on top.
  const ordered = [...layers].reverse();
  const defs = ordered.map((layer, i) => layerDef(layer, `l${i}`)).join('\n');
  const rects = ordered.map((_, i) => `  ${FULL} fill="url(#l${i})"/>`).join('\n');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg">',
    ...(defs ? ['  <defs>', defs, '  </defs>'] : []),
    `  ${FULL} fill="${paint.bg}"/>`,
    ...(rects ? [rects] : []),
    '</svg>',
    '',
  ].join('\n');
}

function patternSvg(paint: PatternPaint): string {
  const p = paint.pitch;
  const half = num(p / 2);
  let marks: string;
  let transform = '';
  switch (paint.pattern) {
    case 'dots':
      marks = `      <circle cx="${half}" cy="${half}" r="${num(p / 16)}" fill="${paint.ink}"/>`;
      break;
    case 'grid':
      marks = `      <path d="M0 0H${p}M0 0V${p}" stroke="${paint.ink}" stroke-width="1"/>`;
      break;
    case 'diagonal':
      marks = `      <path d="M0 0H${p}" stroke="${paint.ink}" stroke-width="1"/>`;
      transform = ' patternTransform="rotate(45)"';
      break;
  }
  return [
    '<svg xmlns="http://www.w3.org/2000/svg">',
    '  <defs>',
    `    <pattern id="p" width="${p}" height="${p}" patternUnits="userSpaceOnUse"${transform}>`,
    marks,
    '    </pattern>',
    '  </defs>',
    `  ${FULL} fill="${paint.bg}"/>`,
    `  ${FULL} fill="url(#p)"/>`,
    '</svg>',
    '',
  ].join('\n');
}

/** The full SVG document for one starter background. */
export function buildStarterBackgroundSvg(paint: WallPaint): string {
  return isPatternPaint(paint) ? patternSvg(paint) : gradientSvg(paint);
}
