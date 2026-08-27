import type { CalendarEvent, CalendarPerson } from '@/types/config';
import { eventHoursOnDay } from '@/lib/calendar-event-layout';
import { isEventOnDay } from '@/lib/calendar-utils';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';

/** Neutral gray for the shared "Everyone" row and unknown-member avatars;
 *  person rows use their own configured color. */
export const EVERYONE_COLOR = '#6b7280';

/**
 * Per-person plumbing for the family grid and free time views.
 *
 * A "row" is one person: either a configured `CalendarPerson` (Settings >
 * Calendar > People) or, when the household never set people up, one row per
 * calendar source seen in the window. The shared row (`sourceIds: null`)
 * holds every event no person claims — the family Google calendar, the
 * holidays feed, an unassigned iCal URL — so a shared event shows once
 * instead of once per person, and in free time it counts as busy for
 * everyone (dinner is dinner for the whole household).
 */
export interface PersonRow {
  id: string;
  name: string;
  color: string;
  /** One or two characters for the avatar circle. */
  initials: string;
  /** Sources this row owns; null = the shared row (everything unclaimed). */
  sourceIds: string[] | null;
}

export const EVERYONE_ROW_ID = '__everyone__';

/** "Ella" -> "E", "Mary Ann" -> "MA", "ella" -> "E". Empty names get "?". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const picked = words.length === 1 ? [words[0]] : [words[0], words[1]];
  return picked.map((w) => Array.from(w)[0]?.toLocaleUpperCase() ?? '').join('');
}

/** A source id that no configured person owns. Holidays are never a person's. */
function isUnclaimed(ev: Pick<CalendarEvent, 'sourceId' | 'kind'>, claimed: ReadonlySet<string>): boolean {
  if (!ev.sourceId || ev.kind === 'holiday') return true;
  return !claimed.has(ev.sourceId);
}

/**
 * The rows a per-person view draws, in display order: the shared row first
 * (when requested and non-empty), then each person.
 *
 * With people configured the person list is authoritative and stable across
 * weeks, so an empty week still shows every name. Without people, rows come
 * from the sources actually present in `events` (sorted by name) so the
 * fallback never invents a row for a calendar that has nothing this week.
 */
export function buildPersonRows(
  events: readonly CalendarEvent[],
  people: readonly CalendarPerson[] | undefined,
  opts: { everyoneLabel: string; everyoneColor: string; includeEveryone: boolean },
): PersonRow[] {
  const everyone: PersonRow = {
    // Initials derive from the localized label like every other row: a
    // hardcoded English "ALL" would sit next to a translated "Alle"/"Tous".
    id: EVERYONE_ROW_ID, name: opts.everyoneLabel, color: opts.everyoneColor, initials: initialsOf(opts.everyoneLabel), sourceIds: null,
  };
  const rows: PersonRow[] = [];

  if (people && people.length > 0) {
    const claimed = new Set(people.flatMap((p) => p.sourceIds));
    if (opts.includeEveryone && events.some((ev) => isUnclaimed(ev, claimed))) rows.push(everyone);
    for (const p of people) {
      rows.push({ id: p.id, name: p.name, color: p.color, initials: initialsOf(p.name), sourceIds: [...p.sourceIds] });
    }
    return rows;
  }

  // Fallback: one row per source in the window.
  const sources = new Map<string, { name: string; color: string }>();
  let unclaimed = false;
  for (const ev of events) {
    if (!ev.sourceId || ev.kind === 'holiday') { unclaimed = true; continue; }
    if (!sources.has(ev.sourceId)) {
      sources.set(ev.sourceId, { name: ev.sourceName ?? ev.sourceId, color: ev.calendarColor ?? DEFAULT_EVENT_COLOR });
    }
  }
  if (opts.includeEveryone && unclaimed) rows.push(everyone);
  const sorted = [...sources.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  for (const [id, { name, color }] of sorted) {
    rows.push({ id, name, color, initials: initialsOf(name), sourceIds: [id] });
  }
  return rows;
}

/**
 * The events one row draws. Person rows take their sources' events; the
 * shared row takes everything no person row claims, computed against the
 * full row list so the two never overlap or leave an event orphaned.
 */
export function eventsForRow(
  events: readonly CalendarEvent[],
  row: PersonRow,
  rows: readonly PersonRow[],
): CalendarEvent[] {
  if (row.sourceIds) {
    const own = new Set(row.sourceIds);
    return events.filter((ev) => ev.sourceId != null && ev.kind !== 'holiday' && own.has(ev.sourceId));
  }
  const claimed = new Set(rows.flatMap((r) => r.sourceIds ?? []));
  return events.filter((ev) => isUnclaimed(ev, claimed));
}

// ─── Free time ───

/** A busy span on one day, in fractional hours clamped to the view window. */
export interface BusyBlock {
  id: string;
  title: string;
  color: string;
  start: number;
  end: number;
}

export interface FreeGap {
  start: number;
  end: number;
}

/**
 * Timed events on `day` as busy blocks inside [hourStart, hourEnd), sorted by
 * start. All-day rows are skipped: a birthday or "Dad away" does not make
 * anyone busy at 4 PM, and the free time board is about clock time.
 */
export function busyBlocksForDay(
  events: readonly CalendarEvent[],
  day: Date,
  hourStart: number,
  hourEnd: number,
  timezone?: string,
): BusyBlock[] {
  const blocks: BusyBlock[] = [];
  for (const ev of events) {
    if (ev.allDay || !isEventOnDay(ev, day, timezone)) continue;
    const { startHour, endHour } = eventHoursOnDay(ev, day, timezone);
    const start = Math.max(startHour, hourStart);
    const end = Math.min(endHour, hourEnd);
    if (end <= start) continue;
    blocks.push({ id: ev.id, title: ev.title, color: ev.calendarColor ?? DEFAULT_EVENT_COLOR, start, end });
  }
  return blocks.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** A run of busy blocks that touch or overlap, drawn as one labelled span. */
export interface BusyCluster {
  start: number;
  end: number;
  /** Every block in the run, in start order. */
  blocks: BusyBlock[];
  /** The longest block — what the run is named after. */
  primary: BusyBlock;
}

/**
 * Group busy blocks into connected runs. The blocks themselves still draw
 * individually (their colors are the point of the track), but a run gets one
 * label: two concurrent events each printing a title into the same strip
 * superimposed them into unreadable glyph soup, which is the common case as
 * soon as a personal event overlaps a shared household one.
 *
 * The label names the longest block rather than the earliest, so a run reads
 * as the thing that actually occupies it — "Soccer Practice", not the
 * 15-minute reminder that happened to start first.
 */
export function clusterBusyBlocks(blocks: readonly BusyBlock[]): BusyCluster[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const clusters: BusyCluster[] = [];
  for (const b of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && b.start < last.end) {
      last.end = Math.max(last.end, b.end);
      last.blocks.push(b);
    } else {
      clusters.push({ start: b.start, end: b.end, blocks: [b], primary: b });
    }
  }
  for (const c of clusters) {
    c.primary = c.blocks.reduce((best, b) => (b.end - b.start > best.end - best.start ? b : best), c.blocks[0]);
  }
  return clusters;
}

/**
 * The gaps between busy blocks inside the window that are at least
 * `minHours` long. Overlapping blocks are merged first so two parallel
 * events never produce a phantom gap between them.
 */
export function freeGaps(blocks: readonly BusyBlock[], hourStart: number, hourEnd: number, minHours: number): FreeGap[] {
  const merged: FreeGap[] = [];
  for (const b of [...blocks].sort((a, c) => a.start - c.start)) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else merged.push({ start: b.start, end: b.end });
  }
  const gaps: FreeGap[] = [];
  let cursor = hourStart;
  for (const m of merged) {
    if (m.start - cursor >= minHours) gaps.push({ start: cursor, end: m.start });
    cursor = Math.max(cursor, m.end);
  }
  if (hourEnd - cursor >= minHours) gaps.push({ start: cursor, end: hourEnd });
  return gaps;
}

/**
 * Spans where every list has a gap: the intersection of per-person free
 * gaps, filtered to `minHours`. An empty input (nobody on the board) has no
 * common free time rather than "always free".
 */
export function commonFreeGaps(gapLists: readonly (readonly FreeGap[])[], minHours: number): FreeGap[] {
  if (gapLists.length === 0) return [];
  let acc: FreeGap[] = [...gapLists[0]];
  for (const list of gapLists.slice(1)) {
    const next: FreeGap[] = [];
    for (const a of acc) {
      for (const b of list) {
        const start = Math.max(a.start, b.start);
        const end = Math.min(a.end, b.end);
        if (end > start) next.push({ start, end });
      }
    }
    acc = next;
  }
  return acc.filter((g) => g.end - g.start >= minHours).sort((a, b) => a.start - b.start);
}
