import { describe, expect, it } from 'vitest';
import {
  NOTE_INK_PALETTES, NOTE_PAGE_LOOKS, WALL_DRAWING_CAP, cleanDrawing, drawingHasRoom, drawingLinePath, drawingPointCount, drawingProblem,
  drawingsToTakeDown, pageInkColor, tidyLinePoints,
} from '../note-drawing';
import { NotesError } from '../notes-errors';
import { NOTE_DRAWING_LIMITS, NOTE_INKS, NOTE_PAGE, type NoteDrawingLine } from '@/types/notes';

const line = (p: number[], over: Partial<NoteDrawingLine> = {}): NoteDrawingLine => ({ c: 'ink', w: 0, p, ...over });

describe('drawingProblem', () => {
  it('passes a drawing with lines on the page', () => {
    expect(drawingProblem({ lines: [line([0, 0, NOTE_PAGE.width, NOTE_PAGE.height]), line([5, 5], { c: 'purple', w: 1 })] })).toBeNull();
  });

  it('names what is wrong with anything else', () => {
    const bad: unknown[] = [
      null, 'house', [], {}, { lines: [] }, { lines: 'x' },
      { lines: [null] },
      { lines: [line([1, 1], { c: 'gold' as never })] },
      { lines: [line([1, 1], { w: 2 as never })] },
      { lines: [line([])] },
      { lines: [line([1, 2, 3])] },
      { lines: [line([1.5, 2])] },
      { lines: [line([-1, 2])] },
      { lines: [line([NOTE_PAGE.width + 1, 2])] },
      { lines: [line([2, NOTE_PAGE.height + 1])] },
      { lines: [line(['1', 2] as never)] },
    ];
    for (const raw of bad) expect(drawingProblem(raw), JSON.stringify(raw)).toEqual(expect.any(String));
  });

  it('holds a drawing to its limits', () => {
    expect(drawingProblem({ lines: Array.from({ length: NOTE_DRAWING_LIMITS.maxLines + 1 }, () => line([1, 1])) })).toMatch(/lines at most/);
    const long = line(Array.from({ length: (NOTE_DRAWING_LIMITS.maxPoints + 1) * 2 }, (_, i) => i % 500));
    expect(drawingProblem({ lines: [long] })).toMatch(/too many/);
  });
});

describe('cleanDrawing', () => {
  it('keeps only what a drawing holds', () => {
    const raw = { lines: [{ c: 'red', w: 1, p: [1, 2, 3, 4], extra: true }], script: 'x' };
    expect(cleanDrawing(raw)).toEqual({ lines: [{ c: 'red', w: 1, p: [1, 2, 3, 4] }] });
  });

  it('refuses a bad one with the notes refusal', () => {
    expect(() => cleanDrawing({ lines: [] })).toThrow(NotesError);
  });
});

describe('tidyLinePoints', () => {
  it('rounds onto the page and drops repeats', () => {
    expect(tidyLinePoints([10.4, 20.6, 10.4, 20.6, -5, 9999])).toEqual([10, 21, 0, NOTE_PAGE.height]);
  });

  it('keeps a dot as one point', () => {
    expect(tidyLinePoints([300.2, 300.4])).toEqual([300, 300]);
  });

  it('keeps only the ends of a straight stroke', () => {
    const trail: number[] = [];
    for (let x = 100; x <= 900; x += 4) trail.push(x, 200);
    expect(tidyLinePoints(trail)).toEqual([100, 200, 900, 200]);
  });

  it('keeps the corner of an L and the shape of a curve', () => {
    const corner: number[] = [];
    for (let x = 100; x <= 500; x += 4) corner.push(x, 100);
    for (let y = 104; y <= 500; y += 4) corner.push(500, y);
    expect(tidyLinePoints(corner)).toEqual([100, 100, 500, 100, 500, 500]);

    const circle: number[] = [];
    for (let a = 0; a <= 360; a += 2) circle.push(500 + 200 * Math.cos((a * Math.PI) / 180), 375 + 200 * Math.sin((a * Math.PI) / 180));
    const kept = tidyLinePoints(circle);
    // Far fewer points than the finger made, and every one of them still on the circle.
    expect(kept.length / 2).toBeLessThan(circle.length / 4);
    expect(kept.length / 2).toBeGreaterThan(12);
    for (let i = 0; i < kept.length; i += 2) expect(Math.abs(Math.hypot(kept[i] - 500, kept[i + 1] - 375) - 200)).toBeLessThan(2);
  });
});

describe('drawingLinePath', () => {
  it('draws a dot, and straight pieces through every kept point so a corner stays a corner', () => {
    expect(drawingLinePath([])).toBe('');
    expect(drawingLinePath([5, 6])).toBe('M5 6h0.01');
    expect(drawingLinePath([0, 0, 10, 0])).toBe('M0 0L10 0');
    expect(drawingLinePath([0, 0, 10, 0, 10, 10])).toBe('M0 0L10 0L10 10');
  });
});

describe('room on the page', () => {
  it('counts points and stops at either limit', () => {
    expect(drawingPointCount([line([1, 1, 2, 2]), line([3, 3])])).toBe(3);
    expect(drawingHasRoom([])).toBe(true);
    expect(drawingHasRoom(Array.from({ length: NOTE_DRAWING_LIMITS.maxLines }, () => line([1, 1])))).toBe(false);
    expect(drawingHasRoom([line(Array.from({ length: NOTE_DRAWING_LIMITS.maxPoints * 2 }, () => 1))])).toBe(false);
  });
});

describe('inks', () => {
  it('gives every pen a colour on every surface, and a real colour on every page', () => {
    for (const surface of Object.keys(NOTE_INK_PALETTES) as Array<keyof typeof NOTE_INK_PALETTES>) {
      for (const ink of NOTE_INKS) {
        expect(NOTE_INK_PALETTES[surface][ink]).toBeTruthy();
        expect(pageInkColor(surface, ink)).toMatch(/^#/);
      }
      expect(pageInkColor(surface, 'ink')).toBe(NOTE_PAGE_LOOKS[surface].ink);
    }
  });
});

describe('drawingsToTakeDown', () => {
  const note = (id: string, hour: number, over: { drawing?: boolean; pinned?: boolean } = {}) => ({
    id, pinned: over.pinned ?? false, createdAt: `2026-11-20T${String(hour).padStart(2, '0')}:00:00.000Z`,
    drawing: over.drawing === false ? undefined : { lines: [line([1, 1])] },
  });

  it('leaves the board alone under the cap', () => {
    expect(drawingsToTakeDown(Array.from({ length: WALL_DRAWING_CAP - 1 }, (_, i) => note(`d${i}`, i)))).toEqual([]);
  });

  it('names the oldest drawing that is not pinned, never words', () => {
    const live = [
      note('words', 0, { drawing: false }),
      note('pinned', 1, { pinned: true }),
      note('second', 3),
      note('first', 2),
      ...Array.from({ length: WALL_DRAWING_CAP - 3 }, (_, i) => note(`d${i}`, 5 + i)),
    ];
    expect(drawingsToTakeDown(live)).toEqual(['first']);
  });

  it('takes down as many as it needs, and none when all are pinned', () => {
    const many = Array.from({ length: WALL_DRAWING_CAP + 2 }, (_, i) => note(`d${i}`, i));
    expect(drawingsToTakeDown(many)).toEqual(['d0', 'd1', 'd2']);
    expect(drawingsToTakeDown(many.map((n) => ({ ...n, pinned: true })))).toEqual([]);
  });
});
