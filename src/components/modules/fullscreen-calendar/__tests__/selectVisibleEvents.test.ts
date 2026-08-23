import { describe, it, expect } from 'vitest';
import { addHours, format } from 'date-fns';
import { selectVisibleEvents } from '../FullscreenCalendarModule';
import type { CalendarEvent, FullscreenCalendarConfig } from '@/types/config';

const LOCAL = "yyyy-MM-dd'T'HH:mm:ss";
const NOW = new Date(2026, 6, 15, 12, 0, 0);

function ev(id: string, startOffsetH: number, endOffsetH: number, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    title: id,
    start: format(addHours(NOW, startOffsetH), LOCAL),
    end: format(addHours(NOW, endOffsetH), LOCAL),
    ...extra,
  } as CalendarEvent;
}

const past = ev('past', -4, -2);
const ongoing = ev('ongoing', -1, 1);
const future = ev('future', 3, 4);
const all = [past, ongoing, future];

const GRID_VIEWS: FullscreenCalendarConfig['view'][] = ['schedule', 'week-list', 'month-grid', 'day-timeline'];

describe('selectVisibleEvents', () => {
  it('agenda view drops events that already ended, keeping ongoing and future', () => {
    const result = selectVisibleEvents(all, 'agenda', undefined, NOW);
    expect(result.map(e => e.id)).toEqual(['ongoing', 'future']);
  });

  it('agenda view keeps events that ended earlier today when showFinishedToday is on', () => {
    // `past` ran 08:00 to 10:00 today; yesterday's event is still dropped.
    const yesterday = ev('yesterday', -30, -28);
    const result = selectVisibleEvents([yesterday, ...all], 'agenda', undefined, NOW, { showFinishedToday: true });
    expect(result.map(e => e.id)).toEqual(['past', 'ongoing', 'future']);
  });

  it('showFinishedToday keeps an overnight event that ended just after midnight', () => {
    // 22:00 yesterday to 00:30 today ended today, so it counts as "finished
    // today" and stays (the agenda renders it as a dimmed "Until 12:30 AM"
    // last-day row). Pinned on purpose: this is what the option means.
    const overnight = ev('overnight', -14, -11.5);
    const result = selectVisibleEvents([overnight, ...all], 'agenda', undefined, NOW, { showFinishedToday: true });
    expect(result.map(e => e.id)).toEqual(['overnight', 'past', 'ongoing', 'future']);
    expect(selectVisibleEvents([overnight, ...all], 'agenda', undefined, NOW).map(e => e.id)).toEqual(['ongoing', 'future']);
  });

  it.each(GRID_VIEWS)('%s view keeps past events (wall-calendar / dimmed-past semantics)', (view) => {
    const result = selectVisibleEvents(all, view, undefined, NOW);
    expect(result.map(e => e.id)).toEqual(['past', 'ongoing', 'future']);
  });

  it('applies the source filter before the agenda upcoming filter', () => {
    const tagged = [
      ev('keep-future', 3, 4, { sourceId: 'a' }),
      ev('drop-future', 3, 4, { sourceId: 'b' }),
      ev('keep-past', -4, -2, { sourceId: 'a' }),
    ];
    // Agenda: source 'a' only, and only upcoming — so keep-past is excluded
    // by the upcoming filter, drop-future by the source filter.
    expect(selectVisibleEvents(tagged, 'agenda', ['a'], NOW).map(e => e.id)).toEqual(['keep-future']);
    // Month grid: source 'a' only, past retained.
    expect(selectVisibleEvents(tagged, 'month-grid', ['a'], NOW).map(e => e.id).sort())
      .toEqual(['keep-future', 'keep-past']);
  });

  it('keeps events with no sourceId regardless of filter', () => {
    const mixed = [ev('unsourced', 3, 4), ev('sourced', 3, 4, { sourceId: 'x' })];
    expect(selectVisibleEvents(mixed, 'month-grid', ['y'], NOW).map(e => e.id)).toEqual(['unsourced']);
  });

  it('applies the title filter alongside the source filter', () => {
    const titled = [
      { ...ev('lunch', -4, -2), title: 'Lunch' },
      { ...ev('soccer', 3, 4), title: 'Soccer practice' },
    ];
    expect(
      selectVisibleEvents(titled, 'month-grid', undefined, NOW, { titleFilter: { mode: 'exclude', terms: ['lunch'] } }).map(e => e.id),
    ).toEqual(['soccer']);
  });
});
