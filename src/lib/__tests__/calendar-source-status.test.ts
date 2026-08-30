import { describe, it, expect, beforeEach } from 'vitest';
import {
  budgetEvents, mergeSourceStatus, resetCalendarSourceState, settleSourceFetches, withSavedEvents,
} from '@/lib/calendar-source-status';
import type { CalendarEvent } from '@/types/config';

beforeEach(() => resetCalendarSourceState());

describe('mergeSourceStatus', () => {
  it('stamps now on successes and records them as last-good', () => {
    const out = mergeSourceStatus([{ id: 'a', name: 'A', ok: true }], 1000);
    expect(out).toEqual([{ id: 'a', name: 'A', ok: true, fetchedAt: 1000 }]);
  });

  it('reports a failing source with its last success time, never overwriting the stamp', () => {
    mergeSourceStatus([{ id: 'a', ok: true }], 1000);
    const out = mergeSourceStatus([{ id: 'a', ok: false, error: 'Could not reach the link' }], 2000);
    expect(out).toEqual([{ id: 'a', ok: false, error: 'Could not reach the link', fetchedAt: 1000 }]);
    const again = mergeSourceStatus([{ id: 'a', ok: false }], 3000);
    expect(again[0].fetchedAt).toBe(1000);
  });

  it('reports null fetchedAt for a source that has never succeeded', () => {
    const out = mergeSourceStatus([{ id: 'new', ok: false, error: 'nope' }], 500);
    expect(out[0].fetchedAt).toBeNull();
  });

  it('a later success replaces the stamp and clears the failure state', () => {
    mergeSourceStatus([{ id: 'a', ok: true }], 1000);
    const out = mergeSourceStatus([{ id: 'a', ok: true }], 3000);
    expect(out[0]).toEqual({ id: 'a', ok: true, fetchedAt: 3000 });
  });
});

// Local-naive ISO strings so bucket boundaries (start of today) are
// machine-timezone independent.
const mk = (id: string, end: string, sourceId = 's1'): CalendarEvent =>
  ({ id, title: id, start: end, end, sourceId } as CalendarEvent);

describe('withSavedEvents', () => {
  const winStart = new Date(2026, 6, 1);
  const winEnd = new Date(2026, 7, 1);

  it("substitutes a failing source's last-good events", () => {
    const good = [mk('e1', '2026-07-10T10:00:00')];
    withSavedEvents(good, [{ id: 's1', ok: true }], winStart, winEnd);
    const out = withSavedEvents([], [{ id: 's1', ok: false, error: 'x' }], winStart, winEnd);
    expect(out).toEqual(good);
  });

  it('re-filters saved events to the requested window', () => {
    const good = [mk('e1', '2026-07-10T10:00:00')];
    withSavedEvents(good, [{ id: 's1', ok: true }], winStart, winEnd);
    const out = withSavedEvents([], [{ id: 's1', ok: false }], new Date(2026, 8, 1), new Date(2026, 9, 1));
    expect(out).toEqual([]);
  });

  it('a narrow success keeps saved rows outside its window (a list fetch never shrinks a grid fallback)', () => {
    // Wide month fetch succeeds, then a 7-day list fetch succeeds, then the
    // source fails on the next wide fetch: the substituted set must still
    // cover the whole month, not just the week the last success covered.
    const month = [
      mk('early', '2026-07-03T10:00:00'),
      mk('mid', '2026-07-12T10:00:00'),
      mk('late', '2026-07-25T10:00:00'),
    ];
    withSavedEvents(month, [{ id: 's1', ok: true }], winStart, winEnd);
    const weekStart = new Date(2026, 6, 10);
    const weekEnd = new Date(2026, 6, 17);
    withSavedEvents([mk('mid', '2026-07-12T10:00:00')], [{ id: 's1', ok: true }], weekStart, weekEnd);
    const out = withSavedEvents([], [{ id: 's1', ok: false }], winStart, winEnd);
    expect(out.map((e) => e.id).sort()).toEqual(['early', 'late', 'mid']);
  });

  it('a success replaces the saved rows inside its window, so upstream deletions take effect', () => {
    withSavedEvents([mk('a', '2026-07-12T10:00:00'), mk('b', '2026-07-13T10:00:00')], [{ id: 's1', ok: true }], winStart, winEnd);
    const weekStart = new Date(2026, 6, 10);
    const weekEnd = new Date(2026, 6, 17);
    // Same window, 'b' is gone upstream and 'c' is new.
    withSavedEvents([mk('a', '2026-07-12T10:00:00'), mk('c', '2026-07-14T10:00:00')], [{ id: 's1', ok: true }], weekStart, weekEnd);
    const out = withSavedEvents([], [{ id: 's1', ok: false }], winStart, winEnd);
    expect(out.map((e) => e.id).sort()).toEqual(['a', 'c']);
  });

  it('drops saved rows that ended long before now, measured from now rather than the fetch window', () => {
    const now = new Date(2026, 7, 1).getTime();
    const wide = [mk('old', '2026-04-20T10:00:00'), mk('recent', '2026-06-30T10:00:00')];
    withSavedEvents(wide, [{ id: 's1', ok: true }], new Date(2026, 3, 1), winEnd, now);
    // A later narrow success: 'old' ended > 90 days before now and goes;
    // 'recent' is outside this window but within retention and stays.
    withSavedEvents([], [{ id: 's1', ok: true }], winStart, winEnd, now);
    const out = withSavedEvents([], [{ id: 's1', ok: false }], new Date(2026, 3, 1), winEnd, now);
    expect(out.map((e) => e.id)).toEqual(['recent']);
  });

  it('keeps sources independent when merging', () => {
    withSavedEvents([mk('x', '2026-07-10T10:00:00', 'other')], [{ id: 'other', ok: true }], winStart, winEnd);
    withSavedEvents([mk('y', '2026-07-11T10:00:00')], [{ id: 's1', ok: true }], winStart, winEnd);
    const out = withSavedEvents([], [{ id: 's1', ok: false }, { id: 'other', ok: true }], winStart, winEnd);
    expect(out.map((e) => e.id)).toEqual(['y']);
  });
});

describe('settleSourceFetches', () => {
  it('keeps items and results aligned across mixed outcomes', async () => {
    const { events, results } = await settleSourceFetches(
      ['a', 'b', 'c'],
      async (id) => {
        if (id === 'b') throw new Error('boom');
        return { events: [mk(`${id}-ev`, '2026-07-10T10:00:00', id)], results: [{ id, ok: true }] };
      },
      (id) => [{ id, ok: false, error: 'failed' }],
    );
    expect(results.map((r) => `${r.id}:${r.ok}`)).toEqual(['a:true', 'b:false', 'c:true']);
    expect(events.map((e) => e.id)).toEqual(['a-ev', 'c-ev']);
  });
});

describe('budgetEvents', () => {
  const NOW = '2026-07-15T12:00:00';

  it('returns the list untouched under the cap', () => {
    const list = [mk('a', '2026-07-15T13:00:00')];
    expect(budgetEvents(list, 5, undefined, NOW)).toBe(list);
  });

  it('keeps the nearest upcoming events; ended-today rows ride alongside the budget', () => {
    const earlier1 = mk('earlier1', '2026-07-13T10:00:00');
    const earlier2 = mk('earlier2', '2026-07-14T10:00:00');
    const endedToday = mk('endedToday', '2026-07-15T09:00:00');
    const u1 = mk('u1', '2026-07-15T13:00:00');
    const u2 = mk('u2', '2026-07-15T14:00:00');
    const u3 = mk('u3', '2026-07-15T15:00:00');
    const out = budgetEvents([earlier1, earlier2, endedToday, u1, u2, u3], 2, undefined, NOW);
    expect(out.map((e) => e.id)).toEqual(['endedToday', 'u1', 'u2']);
  });

  it('backfills leftover budget with the most recent earlier events', () => {
    const earlier1 = mk('earlier1', '2026-07-13T10:00:00');
    const earlier2 = mk('earlier2', '2026-07-14T10:00:00');
    const endedToday = mk('endedToday', '2026-07-15T09:00:00');
    const u1 = mk('u1', '2026-07-15T13:00:00');
    const out = budgetEvents([earlier1, earlier2, endedToday, u1], 2, undefined, NOW);
    expect(out.map((e) => e.id)).toEqual(['earlier2', 'endedToday', 'u1']);
  });

  it('keeps past days populated when upcoming events alone would fill the cap', () => {
    // The grid failure this reserve exists for: a dense window where the
    // leftover budget is zero, so earlier rows used to be dropped wholesale
    // and every past cell rendered empty while future weeks looked fine.
    const earlier = [1, 2, 3, 4].map((n) => mk(`earlier${n}`, `2026-07-${10 + n}T10:00:00`));
    const upcoming = Array.from({ length: 200 }, (_, i) =>
      mk(`u${i}`, `2026-07-15T${String(13 + Math.floor(i / 30)).padStart(2, '0')}:00:00`));
    const out = budgetEvents([...earlier, ...upcoming], 100, undefined, NOW);
    // Every earlier row survives (4 is well under the 25-row reserve), and
    // the payload still respects the cap.
    expect(out.filter((e) => e.id.startsWith('earlier')).map((e) => e.id))
      .toEqual(['earlier1', 'earlier2', 'earlier3', 'earlier4']);
    expect(out).toHaveLength(100);
  });

  it('caps the earlier reserve at a quarter of the budget, leaving the rest to upcoming', () => {
    const earlier = Array.from({ length: 60 }, (_, i) => mk(`earlier${i}`, '2026-07-14T10:00:00'));
    const upcoming = Array.from({ length: 200 }, (_, i) => mk(`u${i}`, '2026-07-15T13:00:00'));
    const out = budgetEvents([...earlier, ...upcoming], 100, undefined, NOW);
    expect(out.filter((e) => e.id.startsWith('earlier'))).toHaveLength(25);
    expect(out.filter((e) => e.id.startsWith('u'))).toHaveLength(75);
  });
});
