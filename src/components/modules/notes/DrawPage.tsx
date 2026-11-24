'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  NOTE_PEN_WIDTHS, NOTE_POINT_STEP, drawingHasRoom, drawingPointCount, pageInkColor, tidyLinePoints, type NoteSurface,
} from '@/lib/note-drawing';
import { NOTE_DRAWING_LIMITS, NOTE_PAGE, type NoteDrawingLine, type NoteInk } from '@/types/notes';
import { wallTakesTouch } from '@/lib/wall-touch-gate';

/**
 * A dot made this soon after the page opens is the second tap of a double
 * tap on the button that opened it, not a drawing. A finger that goes on to
 * move is a line and is kept: children start drawing the instant the page
 * appears.
 */
const OPENING_TAP_MS = 350;

/** The sharpest the page is drawn: more than this costs a Pi fill rate and shows nothing a finger can make. */
const MAX_PIXEL_RATIO = 2;

/** One finger's line while it is still down. */
interface Trail {
  ink: NoteInk;
  pen: 0 | 1;
  /** Page units, `x0, y0, x1, y1, ...`, before tidying. */
  p: number[];
  /** It began in the moment after the page opened (see `OPENING_TAP_MS`). */
  opening: boolean;
}

type Ctx = CanvasRenderingContext2D;

function dot(ctx: Ctx, x: number, y: number, width: number): void {
  ctx.beginPath();
  ctx.arc(x, y, width / 2, 0, Math.PI * 2);
  ctx.fill();
}

/** One whole line, the way `drawingLinePath` draws it: straight pieces with round joins, so the page and the board agree. */
function strokeLine(ctx: Ctx, p: readonly number[], color: string, width: number): void {
  const n = p.length / 2;
  if (n < 1) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  if (n === 1) {
    dot(ctx, p[0], p[1], width);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(p[i * 2], p[i * 2 + 1]);
  ctx.stroke();
}

/**
 * The newest piece of a line still being drawn: from the point before the
 * last to the last. Only this piece is painted per move, so a long line
 * costs no more per frame than a short one; the round caps of neighbouring
 * pieces overlap into a round join.
 */
function strokeNewest(ctx: Ctx, p: readonly number[], color: string, width: number): void {
  const n = p.length / 2;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  if (n === 1) {
    dot(ctx, p[0], p[1], width);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[n * 2 - 4], p[n * 2 - 3]);
  ctx.lineTo(p[n * 2 - 2], p[n * 2 - 1]);
  ctx.stroke();
}

/**
 * The page a note is drawn on: a canvas that follows fingers. Every finger
 * draws its own line, so two children can share it. A line is painted piece
 * by piece as the finger moves and handed up, tidied, when the finger lifts
 * or slides off the page. The page repaints from `lines` only when they
 * change some other way (Undo, Start over), never for its own lines.
 */
export function DrawPage({ lines, ink, pen, surface, width, height, radius, onLine, onFull, label }: {
  /** Every finished line, oldest first. */
  lines: readonly NoteDrawingLine[];
  ink: NoteInk;
  pen: 0 | 1;
  /** Whose page this is: its ground and what the first pen writes in. */
  surface: NoteSurface;
  /** The page's size on screen, in CSS pixels (4 wide by 3 tall). */
  width: number;
  height: number;
  radius: number;
  onLine: (line: NoteDrawingLine) => void;
  /** A finger came down on a page with no room left. */
  onFull: () => void;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trails = useRef(new Map<number, Trail>());
  /** How many of `lines` are already on the canvas: its own lines are painted before they are handed up. */
  const painted = useRef(0);
  const openedAt = useRef(0);
  const live = useRef({ ink, pen, lines, onLine, onFull });
  useEffect(() => { live.current = { ink, pen, lines, onLine, onFull }; });
  useEffect(() => { openedAt.current = performance.now(); }, []);

  const ratio = typeof window === 'undefined' ? 1 : Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
  const pixelWidth = Math.max(1, Math.round(width * ratio));
  const pixelHeight = Math.max(1, Math.round(height * ratio));

  const context = useCallback((): Ctx | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // A plain context, on purpose. `desynchronized: true` (the low-latency
    // hint) has no fast path under the Pi's Wayland kiosk and costs more than
    // half the frames there: 23 a second against 59 for this, measured on a
    // Pi 4 at 1000 x 750.
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(canvas.width / NOTE_PAGE.width, 0, 0, canvas.height / NOTE_PAGE.height, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  }, []);

  const repaint = useCallback(() => {
    const ctx = context();
    if (!ctx) return;
    ctx.clearRect(0, 0, NOTE_PAGE.width, NOTE_PAGE.height);
    for (const line of live.current.lines) strokeLine(ctx, line.p, pageInkColor(surface, line.c), NOTE_PEN_WIDTHS[line.w]);
    // Lines still under a finger survive an Undo of an older one.
    for (const trail of trails.current.values()) strokeLine(ctx, trail.p, pageInkColor(surface, trail.ink), NOTE_PEN_WIDTHS[trail.pen]);
    painted.current = live.current.lines.length;
  }, [context, surface]);

  // The page's own line arrives as one more entry than it has painted: it is
  // already on the canvas. Anything else (Undo, Start over, a kept page
  // coming back, a new size) repaints the lot.
  const sized = useRef('');
  useLayoutEffect(() => {
    const size = `${pixelWidth}x${pixelHeight}`;
    if (sized.current === size && lines.length === painted.current) return;
    sized.current = size;
    live.current.lines = lines;
    repaint();
  }, [lines, pixelWidth, pixelHeight, repaint]);

  const pagePoint = (e: PointerEvent | ReactPointerEvent): { x: number; y: number; on: boolean } => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * NOTE_PAGE.width;
    const y = ((e.clientY - rect.top) / rect.height) * NOTE_PAGE.height;
    return { x, y, on: x >= 0 && x <= NOTE_PAGE.width && y >= 0 && y <= NOTE_PAGE.height };
  };

  const finish = (id: number) => {
    const trail = trails.current.get(id);
    if (!trail) return;
    trails.current.delete(id);
    const p = tidyLinePoints(trail.p);
    if (p.length < 2) return;
    if (trail.opening && p.length === 2) {
      // The stray second tap: take its dot off the page again.
      repaint();
      return;
    }
    painted.current += 1;
    live.current.onLine({ c: trail.ink, w: trail.pen, p });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // A touch that only wakes the wall draws nothing.
    if (!wallTakesTouch()) return;
    const state = live.current;
    const inFlight = [...trails.current.values()];
    if (!drawingHasRoom([...state.lines, ...inFlight])) {
      state.onFull();
      return;
    }
    const at = pagePoint(e);
    if (!at.on) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const trail: Trail = { ink: state.ink, pen: state.pen, p: [at.x, at.y], opening: performance.now() - openedAt.current < OPENING_TAP_MS };
    trails.current.set(e.pointerId, trail);
    const ctx = context();
    if (ctx) strokeNewest(ctx, trail.p, pageInkColor(surface, trail.ink), NOTE_PEN_WIDTHS[trail.pen]);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const trail = trails.current.get(e.pointerId);
    if (!trail) return;
    const ctx = context();
    // Every sample the screen took since the last frame, not just the last
    // one: a fast finger otherwise draws corners where it drew a curve.
    const samples = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const events: Array<PointerEvent | ReactPointerEvent> = samples.length > 0 ? samples : [e];
    const color = pageInkColor(surface, trail.ink);
    const penWidth = NOTE_PEN_WIDTHS[trail.pen];
    for (const sample of events) {
      const at = pagePoint(sample);
      if (!at.on) {
        // Off the edge: the line ends where it left the page.
        finish(e.pointerId);
        return;
      }
      const n = trail.p.length;
      if (Math.hypot(at.x - trail.p[n - 2], at.y - trail.p[n - 1]) < NOTE_POINT_STEP) continue;
      trail.p.push(at.x, at.y);
      if (ctx) strokeNewest(ctx, trail.p, color, penWidth);
      const used = drawingPointCount(live.current.lines) + drawingPointCount([...trails.current.values()]);
      if (used >= NOTE_DRAWING_LIMITS.maxPoints) {
        finish(e.pointerId);
        live.current.onFull();
        return;
      }
    }
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLCanvasElement>) => finish(e.pointerId);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      data-testid="note-draw-page"
      width={pixelWidth}
      height={pixelHeight}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        display: 'block', width, height, borderRadius: radius,
        // The page takes every touch itself: no scroll, no pinch, no long-press menu.
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', cursor: 'crosshair',
      }}
    />
  );
}
