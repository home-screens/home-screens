import { NotesError } from './notes-errors';
import { NOTE_DRAWING_LIMITS, NOTE_INKS, NOTE_PAGE, type Note, type NoteDrawing, type NoteDrawingLine, type NoteInk, type NoteLife } from '@/types/notes';

/**
 * What a drawn note is, as pure functions: what a valid drawing holds, how a
 * finger's trail becomes a line worth keeping, how a line is drawn, and
 * which ink each surface gives it. The wall's drawing sheet, every Notes
 * view, the phone and the hub all read these, so a drawing is the same
 * thing wherever it goes.
 */

/** Stroke widths of the thin and the thick pen, in page units. */
export const NOTE_PEN_WIDTHS: readonly [number, number] = [12, 30];

/** A finger must move this far (page units) before the trail takes another point. */
export const NOTE_POINT_STEP = 4;

/** How far a kept point may sit from the trail it stands for (page units). */
const SIMPLIFY_TOLERANCE = 1;

/** How long a drawing posted from the wall may stay: every preset but `keep`, which is a phone choice. */
export const WALL_DRAWING_LIVES: readonly NoteLife[] = ['12h', '1d', '3d', '7d'];

/** The most drawings on the wall at once; one more takes down the oldest that is not pinned. */
export const WALL_DRAWING_CAP = 12;

const INKS: ReadonlySet<string> = new Set(NOTE_INKS);

export function isDrawingNote(note: Pick<Note, 'drawing'>): note is Pick<Note, 'drawing'> & { drawing: NoteDrawing } {
  return !!note.drawing;
}

/** Every point a drawing holds. */
export function drawingPointCount(lines: readonly Pick<NoteDrawingLine, 'p'>[]): number {
  let n = 0;
  for (const line of lines) n += line.p.length / 2;
  return n;
}

/** Whether the page has room for another line. */
export function drawingHasRoom(lines: readonly Pick<NoteDrawingLine, 'p'>[]): boolean {
  return lines.length < NOTE_DRAWING_LIMITS.maxLines && drawingPointCount(lines) < NOTE_DRAWING_LIMITS.maxPoints;
}

/**
 * Why a drawing cannot be kept, as a plain sentence, or null when it is
 * sound. One check for the hub's write and for a backup being restored.
 */
export function drawingProblem(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'A drawing must be an object with lines';
  const lines = (raw as { lines?: unknown }).lines;
  if (!Array.isArray(lines) || lines.length === 0) return 'A drawing needs at least one line';
  if (lines.length > NOTE_DRAWING_LIMITS.maxLines) return `A drawing can have ${NOTE_DRAWING_LIMITS.maxLines} lines at most`;
  let points = 0;
  for (const entry of lines as unknown[]) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 'Each line must be an object';
    const line = entry as Record<string, unknown>;
    if (typeof line.c !== 'string' || !INKS.has(line.c)) return 'Each line needs one of the pen colours';
    if (line.w !== 0 && line.w !== 1) return 'Each line needs the thin or the thick pen';
    if (!Array.isArray(line.p) || line.p.length < 2 || line.p.length % 2 !== 0) return 'Each line needs its points';
    for (let i = 0; i < line.p.length; i++) {
      const v = line.p[i];
      const max = i % 2 === 0 ? NOTE_PAGE.width : NOTE_PAGE.height;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > max) return 'A point is off the page';
    }
    points += line.p.length / 2;
    if (points > NOTE_DRAWING_LIMITS.maxPoints) return 'That drawing has too many lines';
  }
  return null;
}

/** A drawing as the store keeps it: only the fields it knows, or a refusal. */
export function cleanDrawing(raw: unknown): NoteDrawing {
  if (drawingProblem(raw)) throw new NotesError(400, 'notes.badDrawing', 'That drawing could not be saved.');
  const lines = (raw as NoteDrawing).lines;
  return { lines: lines.map((line) => ({ c: line.c, w: line.w, p: [...line.p] })) };
}

function clampToPage(x: number, y: number): [number, number] {
  return [
    Math.min(NOTE_PAGE.width, Math.max(0, Math.round(x))),
    Math.min(NOTE_PAGE.height, Math.max(0, Math.round(y))),
  ];
}

/** Distance from point `i` to the segment `a`-`b` of a flat point list, squared. */
function segmentDistanceSq(p: readonly number[], i: number, a: number, b: number): number {
  const px = p[i * 2], py = p[i * 2 + 1];
  const ax = p[a * 2], ay = p[a * 2 + 1];
  const dx = p[b * 2] - ax, dy = p[b * 2 + 1] - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len));
  const cx = ax + dx * t - px, cy = ay + dy * t - py;
  return cx * cx + cy * cy;
}

/**
 * A finger's trail as the line worth keeping: on the page, in whole
 * numbers, without the points a straight run does not need (Ramer, Douglas
 * and Peucker's cut). A slow straight stroke of two hundred points keeps a
 * handful; a curl keeps what its shape needs.
 */
export function tidyLinePoints(trail: readonly number[]): number[] {
  const p: number[] = [];
  for (let i = 0; i + 1 < trail.length; i += 2) {
    const [x, y] = clampToPage(trail[i], trail[i + 1]);
    const n = p.length;
    if (n >= 2 && p[n - 2] === x && p[n - 1] === y) continue;
    p.push(x, y);
  }
  const count = p.length / 2;
  if (count <= 2) return p;
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const limit = SIMPLIFY_TOLERANCE * SIMPLIFY_TOLERANCE;
  const stack: Array<[number, number]> = [[0, count - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    let worst = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistanceSq(p, i, a, b);
      if (d > worst) { worst = d; at = i; }
    }
    if (at !== -1 && worst > limit) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}

/**
 * The SVG path of one line: its points joined by straight pieces with round
 * joins. `tidyLinePoints` keeps a point wherever the finger's trail bent by
 * more than a hair, so a curve stays a curve and a corner stays a corner;
 * smoothing through the kept points would round the corners off a square.
 * The live page draws the same pieces, so what is posted looks like what was
 * drawn. One point is a dot.
 */
export function drawingLinePath(p: readonly number[]): string {
  const n = p.length / 2;
  if (n < 1) return '';
  if (n === 1) return `M${p[0]} ${p[1]}h0.01`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 1; i < n; i++) d += `L${p[i * 2]} ${p[i * 2 + 1]}`;
  return d;
}

/** The colour each pen draws in on one kind of surface. `ink` may be `currentColor`. */
export type NoteInkPalette = Readonly<Record<NoteInk, string>>;

const FIXED = { red: '#ef4444', orange: '#f59e0b', green: '#22c55e', blue: '#3b82f6', purple: '#a855f7' } as const;

/**
 * The inks by surface. `card` is any plain card or the phone: ink is the
 * text colour around the drawing. `paper` is light paper with dark ink (a
 * sticky note, the notebook, the fridge). `marker` and `chalk` are the
 * whiteboard's and the chalkboard's own.
 */
export const NOTE_INK_PALETTES = {
  card: { ink: 'currentColor', ...FIXED },
  // Deeper than the card's: a thin orange or green line has to read on a pastel sticky paper.
  paper: { ink: 'currentColor', red: '#dc2626', orange: '#c2500a', green: '#15803d', blue: '#2563eb', purple: '#9333ea' },
  marker: { ink: '#111827', red: '#dc2626', orange: '#ea8a0c', green: '#15803d', blue: '#1d4ed8', purple: '#9333ea' },
  chalk: { ink: '#f1ede2', red: '#f7a8a8', orange: '#ffe27a', green: '#a9e2b4', blue: '#b8d6fd', purple: '#e6b6ea' },
} as const satisfies Record<string, NoteInkPalette>;

export type NoteSurface = keyof typeof NOTE_INK_PALETTES;

/**
 * The page a drawing is made on and looked at large, by surface: its ground
 * and the colour the first pen writes in there. A plain card's page is dark
 * with white ink, the way the wall's cards are.
 */
export const NOTE_PAGE_LOOKS: Readonly<Record<NoteSurface, { background: string; ink: string }>> = {
  card: { background: '#0b0a0a', ink: '#ffffff' },
  paper: { background: '#f6f1e7', ink: '#1c1917' },
  marker: { background: '#f8f9fb', ink: NOTE_INK_PALETTES.marker.ink },
  chalk: { background: '#24382f', ink: NOTE_INK_PALETTES.chalk.ink },
};

/** The colour a pen draws in on a surface's page, with the first pen resolved to that page's ink. */
export function pageInkColor(surface: NoteSurface, ink: NoteInk): string {
  const color = NOTE_INK_PALETTES[surface][ink];
  return color === 'currentColor' ? NOTE_PAGE_LOOKS[surface].ink : color;
}

/** Take down the oldest live drawings that are not pinned until there is room for one more under the cap. */
export function drawingsToTakeDown<T extends Pick<Note, 'id' | 'drawing' | 'pinned' | 'createdAt'>>(live: readonly T[], cap = WALL_DRAWING_CAP): string[] {
  const drawings = live.filter((n) => n.drawing);
  const over = drawings.length - (cap - 1);
  if (over <= 0) return [];
  return drawings
    .filter((n) => !n.pinned)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(0, over)
    .map((n) => n.id);
}
