import type { CalendarEvent, CalendarPeopleFilter, CalendarPerson, CalendarViewMode, FullscreenCalendarView } from '@/types/config';
import type { FamilyGroup } from '@/types/family';
import type { PeopleSelection } from '@/lib/calendar-people';
import { eventsInWindow } from '@/lib/calendar-legend';

/**
 * Switching a calendar's view and showing one person from the wall: the rules
 * both calendar modules share. The wall only ever borrows a view or a person
 * for a minute; the editor's settings stay what the calendar normally shows.
 */

/** The full-screen calendar's views in the editor's order, which the wall's buttons keep. */
export const FULLSCREEN_CALENDAR_VIEW_ORDER: readonly FullscreenCalendarView[] = [
  'schedule', 'week-list', 'month-grid', 'day-timeline', 'agenda', 'family-grid', 'up-next', 'free-time', 'rolling',
];

/** The Calendar card's views in the editor's order. */
export const CALENDAR_CARD_VIEW_ORDER: readonly CalendarViewMode[] = ['daily', 'agenda', 'week', 'multi-week', 'rolling', 'month'];

/** The most view buttons a wall offers, the calendar's own view among them. */
export const WALL_VIEW_LIMIT = 4;

/**
 * The views a wall offers, in the editor's order: the calendar's own view
 * always, then the picked ones while there is room. Unknown or repeated
 * values from a hand-edited config are dropped. One view means no buttons.
 */
export function wallViewChoices<V extends string>(home: V, picked: readonly string[] | undefined, order: readonly V[]): V[] {
  const wanted = new Set<string>(picked ?? []);
  const chosen: V[] = [];
  let room = WALL_VIEW_LIMIT - 1;
  for (const view of order) {
    if (view === home) chosen.push(view);
    else if (room > 0 && wanted.has(view)) {
      chosen.push(view);
      room -= 1;
    }
  }
  if (!chosen.includes(home)) chosen.unshift(home);
  return chosen;
}

/** Whether the editor may tick one more view: the own view plus three others at most. */
export function canPickAnotherView(home: string, picked: readonly string[] | undefined, order: readonly string[]): boolean {
  const others = new Set((picked ?? []).filter((view) => view !== home && order.includes(view)));
  return others.size < WALL_VIEW_LIMIT - 1;
}

/** A family member, or a family group, picked on the wall. */
export interface WallPersonPick {
  kind: 'member' | 'group';
  id: string;
}

/** A group the picker offers, with the members in it who own a calendar. */
export interface WallGroupChoice {
  id: string;
  name: string;
  members: CalendarPerson[];
}

export interface WallPeopleChoices {
  people: CalendarPerson[];
  groups: WallGroupChoice[];
}

/**
 * Who the wall's picker lists: the people who own a calendar (in family
 * order), limited to the editor's own "Show only these people" when it has
 * one, and the family groups with at least one of them in. A group that also
 * holds someone the editor left out is not offered, since picking it would
 * show more than the calendar is set to.
 */
export function wallPeopleChoices(
  people: readonly CalendarPerson[] | undefined,
  groups: readonly Pick<FamilyGroup, 'id' | 'name' | 'memberIds'>[] | undefined,
  editorSelection: PeopleSelection | null,
): WallPeopleChoices {
  const allowed = (people ?? []).filter((person) => !editorSelection || editorSelection.memberIds.has(person.id));
  const byId = new Map(allowed.map((person) => [person.id, person]));
  const owners = new Set((people ?? []).map((person) => person.id));
  const groupChoices: WallGroupChoice[] = [];
  for (const group of groups ?? []) {
    const ownersIn = group.memberIds.filter((id) => owners.has(id));
    if (ownersIn.length === 0 || ownersIn.some((id) => !byId.has(id))) continue;
    groupChoices.push({ id: group.id, name: group.name, members: ownersIn.map((id) => byId.get(id)!) });
  }
  return { people: allowed, groups: groupChoices };
}

/** A picker is worth offering with two people to choose between. */
export function offersPersonPicker(choices: WallPeopleChoices): boolean {
  return choices.people.length >= 2;
}

/** A pick that is still on offer, or null once the roster no longer has it. */
export function livePick(pick: WallPersonPick | null, choices: WallPeopleChoices): WallPersonPick | null {
  if (!pick) return null;
  const list = pick.kind === 'member' ? choices.people : choices.groups;
  return list.some((choice) => choice.id === pick.id) ? pick : null;
}

/**
 * The people filter a pick stands for. Shared calendars (the family's,
 * holidays) stay unless the editor's own filter already leaves them out.
 */
export function wallPeopleFilter(pick: WallPersonPick, editorFilter: CalendarPeopleFilter | undefined): CalendarPeopleFilter {
  return {
    memberIds: pick.kind === 'member' ? [pick.id] : [],
    groupIds: pick.kind === 'group' ? [pick.id] : [],
    includeShared: editorFilter?.includeShared !== false,
  };
}

/**
 * The saved config with what the wall borrowed swapped in: another view under
 * `viewKey` (`borrowed`, null for the calendar's own), and a pick's people
 * filter. The same object when nothing is borrowed, so a calendar at rest
 * renders exactly as before.
 */
export function wallSwitchedConfig<C extends { peopleFilter?: CalendarPeopleFilter }, K extends keyof C>(
  config: C,
  viewKey: K,
  borrowed: C[K] | null,
  pick: WallPersonPick | null,
): C {
  if (borrowed === null && !pick) return config;
  return {
    ...config,
    ...(borrowed !== null ? { [viewKey]: borrowed } : {}),
    ...(pick ? { peopleFilter: wallPeopleFilter(pick, config.peopleFilter) } : {}),
  };
}

/** The shortest Calendar card that gets the wall's buttons: below it they would leave too little calendar. */
export const CARD_SWITCH_MIN_HEIGHT = 400;

/**
 * Each person's events in what the view shows, for the picker's tiles. Only
 * their own calendars count: a shared calendar is everybody's, and counting
 * it on every tile would make them all look busy.
 */
export function personEventCounts(
  events: readonly CalendarEvent[],
  people: readonly CalendarPerson[],
  window: { start: Date; end: Date } | null,
  timezone?: string,
): Map<string, number> {
  const scoped = window ? eventsInWindow(events, window.start, window.end, timezone) : events;
  const counts = new Map<string, number>();
  for (const person of people) {
    const own = new Set(person.sourceIds);
    counts.set(person.id, scoped.filter((ev) => ev.kind !== 'holiday' && !!ev.sourceId && own.has(ev.sourceId)).length);
  }
  return counts;
}
