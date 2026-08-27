import { describe, it, expect } from 'vitest';
import { computeOverlapLayout } from '@/lib/fullscreen-overlap';

const ev = (id: string, startHour: number, endHour: number) => ({ id, startHour, endHour });

describe('computeOverlapLayout — columns mode (default)', () => {
  it('returns an empty map for no events', () => {
    expect(computeOverlapLayout([]).size).toBe(0);
  });

  it('gives a single event the full width', () => {
    const layout = computeOverlapLayout([ev('a', 9, 10)]);
    expect(layout.get('a')).toEqual({ left: 0, width: 1, zIndex: 2 });
  });

  it('places non-overlapping events in the same full-width column', () => {
    const layout = computeOverlapLayout([ev('a', 9, 10), ev('b', 10, 11)]);
    expect(layout.get('a')).toEqual({ left: 0, width: 1, zIndex: 2 });
    expect(layout.get('b')).toEqual({ left: 0, width: 1, zIndex: 2 });
  });

  it('splits two overlapping events side-by-side at half width', () => {
    const layout = computeOverlapLayout([ev('a', 9, 11), ev('b', 10, 12)]);
    expect(layout.get('a')).toEqual({ left: 0, width: 0.5, zIndex: 2 });
    expect(layout.get('b')).toEqual({ left: 0.5, width: 0.5, zIndex: 2 });
  });

  it('hides events beyond the third concurrent column (width 0)', () => {
    const layout = computeOverlapLayout([ev('a', 9, 12), ev('b', 9, 12), ev('c', 9, 12), ev('d', 9, 12)]);
    const widths = ['a', 'b', 'c', 'd'].map((id) => layout.get(id)!.width);
    expect(widths.filter((w) => w === 0)).toHaveLength(1);
    expect(widths.filter((w) => w > 0)).toHaveLength(3);
  });

  it('reuses a freed column once an earlier event ends (staircase)', () => {
    // A ends at 11, so C (starting 11.5) reuses A's column 0; only B needs a second column.
    const layout = computeOverlapLayout([ev('a', 9, 11), ev('b', 10, 12), ev('c', 11.5, 13)]);
    expect(layout.get('a')).toEqual({ left: 0, width: 0.5, zIndex: 2 });
    expect(layout.get('c')).toEqual({ left: 0, width: 0.5, zIndex: 2 });
    expect(layout.get('b')).toEqual({ left: 0.5, width: 0.5, zIndex: 2 });
  });

  it('treats a zero-duration event touching a predecessor as non-overlapping', () => {
    const layout = computeOverlapLayout([ev('a', 9, 10), ev('b', 10, 10)]);
    expect(layout.get('a')).toEqual({ left: 0, width: 1, zIndex: 2 });
    expect(layout.get('b')).toEqual({ left: 0, width: 1, zIndex: 2 });
  });

  it('splits a zero-duration event that starts inside another event', () => {
    const layout = computeOverlapLayout([ev('a', 9, 11), ev('b', 10, 10)]);
    expect(layout.get('a')).toEqual({ left: 0, width: 0.5, zIndex: 2 });
    expect(layout.get('b')).toEqual({ left: 0.5, width: 0.5, zIndex: 2 });
  });

  it('places the longer event first when two events share a start time', () => {
    // Passed in reverse order [B, A]; the sort tie-break puts the longer A in column 0.
    const layout = computeOverlapLayout([ev('b', 9, 10), ev('a', 9, 12)]);
    expect(layout.get('a')).toEqual({ left: 0, width: 0.5, zIndex: 2 });
    expect(layout.get('b')).toEqual({ left: 0.5, width: 0.5, zIndex: 2 });
  });
});

describe('computeOverlapLayout — stacked mode', () => {
  it('gives a single event the full width', () => {
    const layout = computeOverlapLayout([ev('a', 9, 10)], 'stacked');
    expect(layout.get('a')).toEqual({ left: 0, width: 1, zIndex: 2 });
  });

  it('indents each overlap level and raises z-index', () => {
    const layout = computeOverlapLayout([ev('a', 9, 11), ev('b', 10, 12)], 'stacked');
    expect(layout.get('a')).toEqual({ left: 0, width: 1, zIndex: 2 });
    const b = layout.get('b')!;
    expect(b.left).toBeCloseTo(0.12);
    expect(b.width).toBeCloseTo(0.88);
    expect(b.zIndex).toBe(3);
  });

  it('never hides events, even past three concurrent', () => {
    const events = ['a', 'b', 'c', 'd', 'e'].map((id) => ev(id, 9, 12));
    const layout = computeOverlapLayout(events, 'stacked');
    for (const e of events) expect(layout.get(e.id)!.width).toBeGreaterThan(0);
  });

  it('caps the indent at level 5 and the z-index at level 7', () => {
    const events = Array.from({ length: 10 }, (_, i) => ev(`e${i}`, 9, 12));
    const layout = computeOverlapLayout(events, 'stacked');
    expect(layout.get('e7')!.left).toBeCloseTo(0.6);   // 5 * 0.12
    expect(layout.get('e7')!.width).toBeCloseTo(0.4);
    expect(layout.get('e7')!.zIndex).toBe(9);          // 2 + column 7 (at the cap)
    // Past column 7 the z-index stays clamped so events never paint over the now-line (zIndex 10)
    expect(layout.get('e9')!.left).toBeCloseTo(0.6);
    expect(layout.get('e9')!.width).toBeCloseTo(0.4);
    expect(layout.get('e9')!.zIndex).toBe(9);          // 2 + min(column 9, 7)
  });
});

describe('computeOverlapLayout — per-cluster column sizing', () => {
  it('keeps a standalone event full width when a later pile-up needs three columns', () => {
    // The 8 AM standup shares no moment with the 6 PM pile-up, so it must not
    // inherit its column count — sizing the whole day off its worst moment
    // truncated every title on an otherwise empty day.
    const layout = computeOverlapLayout([
      ev('standup', 8, 8.5),
      ev('soccer', 18, 19.5), ev('dinner', 18, 19), ev('piano', 18.5, 19),
    ]);
    expect(layout.get('standup')).toEqual({ left: 0, width: 1, zIndex: 2 });
    expect(layout.get('soccer')!.width).toBeCloseTo(1 / 3);
    expect(layout.get('dinner')!.width).toBeCloseTo(1 / 3);
    expect(layout.get('piano')!.width).toBeCloseTo(1 / 3);
  });

  it('sizes each cluster independently', () => {
    const layout = computeOverlapLayout([
      ev('a', 9, 10), ev('b', 9, 10),          // pair -> halves
      ev('c', 14, 16), ev('d', 14, 15), ev('e', 14.5, 15), // triple -> thirds
    ]);
    expect(layout.get('a')!.width).toBe(0.5);
    expect(layout.get('b')!.width).toBe(0.5);
    expect(layout.get('c')!.width).toBeCloseTo(1 / 3);
  });

  it('treats back-to-back events as separate clusters', () => {
    const layout = computeOverlapLayout([ev('a', 9, 10), ev('b', 10, 11), ev('c', 10, 11)]);
    expect(layout.get('a')).toEqual({ left: 0, width: 1, zIndex: 2 });
    expect(layout.get('b')!.width).toBe(0.5);
    expect(layout.get('c')!.width).toBe(0.5);
  });

  it('restarts the stacked-mode indent for each cluster', () => {
    const layout = computeOverlapLayout(
      [ev('a', 9, 11), ev('b', 9.5, 10), ev('late', 20, 21)],
      'stacked',
    );
    expect(layout.get('b')!.left).toBeGreaterThan(0);
    expect(layout.get('late')!.left).toBe(0);
  });
});
