import { addDays, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { parseEventWallTime } from '@/lib/calendar-utils';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';
import { EVERYONE_COLOR, type EventOwner } from '@/lib/calendar-people';
import { memberInitials } from '@/lib/family-avatar';
import type { CalendarLegendMode, CalendarPerson } from '@/types/config';
import type { FamilyGroup } from '@/types/family';

/**
 * Legend construction and view-day-window math shared by both calendar
 * modules: which half-open day range a view draws, which events land in it,
 * and the unique source rows the legend renders for them.
 */

/**
 * Half-open [start, end) day range a calendar view draws, for legend
 * scoping and the shared fetch window. One authority for the date math;
 * each module maps its own view union onto a kind (the mapping is
 * inherently per-module, the math is not).
 * - 'days': `count` days starting at `start` (defaults to today)
 * - 'week': the week containing today
 * - 'weeks': `count` weeks starting at today's week
 * - 'month-grid': the padded month grid around today
 */
export function viewDayWindow(opts: {
  kind: 'days' | 'week' | 'weeks' | 'month-grid';
  today: Date;
  weekStartsOn: 0 | 1;
  start?: Date;
  count?: number;
}): { start: Date; end: Date } {
  const { kind, today, weekStartsOn } = opts;
  switch (kind) {
    case 'days': {
      const start = opts.start ?? today;
      return { start, end: addDays(start, Math.max(1, opts.count ?? 1)) };
    }
    case 'week': {
      const start = startOfWeek(today, { weekStartsOn });
      return { start, end: addDays(start, 7) };
    }
    case 'weeks': {
      const start = startOfWeek(today, { weekStartsOn });
      return { start, end: addDays(start, Math.max(1, opts.count ?? 1) * 7) };
    }
    case 'month-grid': {
      const start = startOfWeek(startOfMonth(today), { weekStartsOn });
      // True half-open end: midnight after the last grid cell, matching the
      // other kinds (endOfWeek alone is 23:59:59.999 of the last cell).
      return { start, end: addDays(startOfDay(endOfWeek(endOfMonth(today), { weekStartsOn })), 1) };
    }
  }
}

/**
 * Events overlapping the half-open [start, end) window on the display wall
 * clock. Used to scope the legend to the days a view actually draws, since
 * the shared fetch window is usually wider than any single view.
 */
export function eventsInWindow<T extends { start: string; end: string }>(
  events: T[],
  start: Date,
  end: Date,
  timezone?: string,
): T[] {
  return events.filter(
    (ev) => parseEventWallTime(ev.start, timezone) < end && parseEventWallTime(ev.end, timezone) > start,
  );
}

/** One legend row: a source that has at least one rendered event. */
export interface LegendSource {
  sourceId: string;
  sourceName: string;
  calendarColor: string;
}

/** One avatar in a person or group row. */
export interface LegendAvatar {
  initials: string;
  color: string;
  name: string;
}

/**
 * A color key row in any mode. `kind: 'source'` is the classic dot row;
 * `person` is one avatar; `group` is a stack of avatars; `everyone` is the
 * neutral row for calendars nobody owns. `sourceIds` are the sources behind
 * the row, so the failing-feed ring can find it in every mode.
 */
export type LegendRow =
  | { kind: 'source'; id: string; name: string; color: string; sourceIds: string[] }
  | { kind: 'person' | 'everyone'; id: string; name: string; avatar: LegendAvatar; sourceIds: string[] }
  | { kind: 'group'; id: string; name: string; avatars: LegendAvatar[]; sourceIds: string[] };

/**
 * The sources to show in a calendar legend: unique per sourceId, in
 * first-seen event order. Callers pass the events they actually render (after
 * their own source filtering), so a configured source with nothing in the
 * window never appears. The dot takes each source's most common event color,
 * not the first seen — Google applies per-event colorId overrides, and a lone
 * recolored event must not repaint the whole source's dot.
 */
export function legendSources(
  events: { sourceId?: string; sourceName?: string; calendarColor?: string }[],
): LegendSource[] {
  const seen = new Map<string, { sourceName: string; colorCounts: Map<string, number> }>();
  for (const ev of events) {
    if (!ev.sourceId || !ev.sourceName) continue;
    const entry = seen.get(ev.sourceId) ?? { sourceName: ev.sourceName, colorCounts: new Map<string, number>() };
    const color = ev.calendarColor ?? DEFAULT_EVENT_COLOR;
    entry.colorCounts.set(color, (entry.colorCounts.get(color) ?? 0) + 1);
    seen.set(ev.sourceId, entry);
  }
  return [...seen.entries()].map(([sourceId, { sourceName, colorCounts }]) => {
    let best = DEFAULT_EVENT_COLOR;
    let bestCount = 0;
    for (const [color, count] of colorCounts) {
      // Strict > keeps first-seen order as the tiebreak.
      if (count > bestCount) { best = color; bestCount = count; }
    }
    return { sourceId, sourceName, calendarColor: best };
  });
}

/**
 * Legend rows for a view: scope events to the window it draws (null = the
 * caller's set is already exactly what renders), collect unique sources, and
 * swap the holidays pseudo-source's baked-in English name for the localized
 * label. The one composition both calendar modules share.
 */
export function buildLegend(
  events: { start: string; end: string; sourceId?: string; sourceName?: string; calendarColor?: string }[],
  window: { start: Date; end: Date } | null,
  timezone: string | undefined,
  holidaysLabel: string,
): LegendSource[] {
  const scoped = window ? eventsInWindow(events, window.start, window.end, timezone) : events;
  return legendSources(scoped).map((s) =>
    s.sourceId === 'holidays' ? { ...s, sourceName: holidaysLabel } : s,
  );
}

/** Classic rows as `LegendRow`s, so one component renders every mode. */
export function sourceLegendRows(sources: readonly LegendSource[]): LegendRow[] {
  return sources.map((s) => ({ kind: 'source', id: s.sourceId, name: s.sourceName, color: s.calendarColor, sourceIds: [s.sourceId] }));
}

/**
 * Person or group rows for the events a view draws. Only people with an
 * event in the window appear (like sources), in family order; a group
 * appears when any of its members does, and shows just those members.
 * Members in no group get their own row after the groups. Everyone closes
 * the list when any drawn event belongs to nobody.
 */
export function peopleLegendRows(
  events: readonly { sourceId?: string; kind?: string }[],
  mode: 'people' | 'groups',
  people: readonly CalendarPerson[],
  groups: readonly Pick<FamilyGroup, 'id' | 'name' | 'memberIds'>[],
  everyoneLabel: string,
): LegendRow[] {
  const owners = new Map<string, EventOwner>();
  for (const person of people) {
    const owner: EventOwner = { id: person.id, name: person.name, color: person.color, initials: memberInitials(person.name, { max: 2 }) };
    for (const sourceId of person.sourceIds) if (!owners.has(sourceId)) owners.set(sourceId, owner);
  }
  const present = new Set<string>();
  const sharedSources = new Set<string>();
  let shared = false;
  for (const ev of events) {
    const owner = ev.sourceId && ev.kind !== 'holiday' ? owners.get(ev.sourceId) : undefined;
    if (owner) present.add(owner.id);
    else { shared = true; if (ev.sourceId) sharedSources.add(ev.sourceId); }
  }
  const avatarOf = (p: CalendarPerson): LegendAvatar => ({ initials: memberInitials(p.name, { max: 2 }), color: p.color, name: p.name });
  const rows: LegendRow[] = [];
  const placed = new Set<string>();
  if (mode === 'groups') {
    for (const group of groups) {
      const members = people.filter((p) => group.memberIds.includes(p.id) && present.has(p.id));
      if (members.length === 0) continue;
      for (const m of members) placed.add(m.id);
      rows.push({ kind: 'group', id: group.id, name: group.name, avatars: members.map(avatarOf), sourceIds: members.flatMap((m) => m.sourceIds) });
    }
  }
  for (const person of people) {
    if (!present.has(person.id) || placed.has(person.id)) continue;
    rows.push({ kind: 'person', id: person.id, name: person.name, avatar: avatarOf(person), sourceIds: [...person.sourceIds] });
  }
  if (shared) rows.push({ kind: 'everyone', id: '__everyone__', name: everyoneLabel, avatar: { initials: memberInitials(everyoneLabel, { max: 2 }), color: EVERYONE_COLOR, name: everyoneLabel }, sourceIds: [...sharedSources] });
  return rows;
}

/**
 * The rows a module's color key shows, in the configured mode. `people` and
 * `groups` modes need a roster with calendar owners; without one they fall
 * back to the classic source rows rather than an empty strip.
 */
export function buildLegendRows(
  events: { start: string; end: string; sourceId?: string; sourceName?: string; calendarColor?: string; kind?: string }[],
  window: { start: Date; end: Date } | null,
  timezone: string | undefined,
  labels: { holidays: string; everyone: string },
  mode: CalendarLegendMode | undefined,
  people: readonly CalendarPerson[] | undefined,
  groups: readonly Pick<FamilyGroup, 'id' | 'name' | 'memberIds'>[] | undefined,
): LegendRow[] {
  const scoped = window ? eventsInWindow(events, window.start, window.end, timezone) : events;
  if ((mode === 'people' || mode === 'groups') && people && people.length > 0) {
    return peopleLegendRows(scoped, mode, people, groups ?? [], labels.everyone);
  }
  return sourceLegendRows(legendSources(scoped).map((s) => (s.sourceId === 'holidays' ? { ...s, sourceName: labels.holidays } : s)));
}
