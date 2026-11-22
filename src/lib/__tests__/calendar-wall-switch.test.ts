import { describe, expect, it } from 'vitest';
import {
  CALENDAR_CARD_VIEW_ORDER, FULLSCREEN_CALENDAR_VIEW_ORDER, canPickAnotherView, livePick, offersPersonPicker, personEventCounts,
  wallPeopleChoices, wallPeopleFilter, wallSwitchedConfig, wallViewChoices,
} from '../calendar-wall-switch';
import { peopleSelection } from '../calendar-people';
import type { CalendarEvent, CalendarPerson, FullscreenCalendarConfig } from '@/types/config';

const person = (id: string, sourceIds: string[]): CalendarPerson => ({ id, name: id[0].toUpperCase() + id.slice(1), color: '#4ade80', sourceIds });
const PEOPLE = [person('dana', ['dana']), person('noah', ['noah']), person('mia', ['mia', 'mia-school'])];
const GROUPS = [
  { id: 'kids', name: 'Kids', memberIds: ['noah', 'mia', 'theo'] },
  { id: 'grown', name: 'Grown-ups', memberIds: ['dana', 'alex'] },
  { id: 'empty', name: 'Pets', memberIds: ['rex'] },
];

describe('wallViewChoices', () => {
  it('keeps the editor order with the own view among the picks', () => {
    expect(wallViewChoices('month-grid', ['day-timeline', 'week-list'], FULLSCREEN_CALENDAR_VIEW_ORDER)).toEqual(['week-list', 'month-grid', 'day-timeline']);
  });

  it('offers only the own view without picks, so a calendar draws no buttons', () => {
    expect(wallViewChoices('schedule', undefined, FULLSCREEN_CALENDAR_VIEW_ORDER)).toEqual(['schedule']);
    expect(wallViewChoices('schedule', [], FULLSCREEN_CALENDAR_VIEW_ORDER)).toEqual(['schedule']);
  });

  it('stops at four, the own view always kept', () => {
    const all = [...FULLSCREEN_CALENDAR_VIEW_ORDER];
    const chosen = wallViewChoices('rolling', all, FULLSCREEN_CALENDAR_VIEW_ORDER);
    expect(chosen).toHaveLength(4);
    expect(chosen).toContain('rolling');
    expect(chosen).toEqual(['schedule', 'week-list', 'month-grid', 'rolling']);
  });

  it('drops junk and repeats from a hand-edited config', () => {
    expect(wallViewChoices('week', ['month', 'month', 'nonsense', 'week'], CALENDAR_CARD_VIEW_ORDER)).toEqual(['week', 'month']);
  });

  it('still offers an own view the order does not know', () => {
    expect(wallViewChoices('odd' as 'week', ['month'], CALENDAR_CARD_VIEW_ORDER)).toEqual(['odd', 'month']);
  });
});

describe('canPickAnotherView', () => {
  it('allows three besides the own view', () => {
    expect(canPickAnotherView('week', ['month', 'daily'], CALENDAR_CARD_VIEW_ORDER)).toBe(true);
    expect(canPickAnotherView('week', ['month', 'daily', 'agenda'], CALENDAR_CARD_VIEW_ORDER)).toBe(false);
  });

  it('does not count the own view or junk as a pick', () => {
    expect(canPickAnotherView('week', ['week', 'month', 'daily', 'nonsense'], CALENDAR_CARD_VIEW_ORDER)).toBe(true);
  });
});

describe('wallPeopleChoices', () => {
  it('lists the calendar owners and the groups with an owner in them', () => {
    const choices = wallPeopleChoices(PEOPLE, GROUPS, null);
    expect(choices.people.map((p) => p.id)).toEqual(['dana', 'noah', 'mia']);
    expect(choices.groups.map((g) => [g.id, g.members.map((m) => m.id)])).toEqual([
      ['kids', ['noah', 'mia']],
      ['grown', ['dana']],
    ]);
  });

  it('stays inside the editor’s own people filter, and leaves out a group reaching past it', () => {
    const editor = peopleSelection({ memberIds: [], groupIds: ['kids'], includeShared: true }, PEOPLE, GROUPS);
    const choices = wallPeopleChoices(PEOPLE, GROUPS, editor);
    expect(choices.people.map((p) => p.id)).toEqual(['noah', 'mia']);
    expect(choices.groups.map((g) => g.id)).toEqual(['kids']);
  });

  it('offers a picker only with two people to choose between', () => {
    expect(offersPersonPicker(wallPeopleChoices(PEOPLE, GROUPS, null))).toBe(true);
    expect(offersPersonPicker(wallPeopleChoices([PEOPLE[0]], GROUPS, null))).toBe(false);
    expect(offersPersonPicker(wallPeopleChoices(undefined, GROUPS, null))).toBe(false);
  });
});

describe('livePick', () => {
  const choices = wallPeopleChoices(PEOPLE, GROUPS, null);

  it('keeps a pick still on offer, as the same object', () => {
    const pick = { kind: 'member' as const, id: 'noah' };
    expect(livePick(pick, choices)).toBe(pick);
    expect(livePick({ kind: 'group', id: 'kids' }, choices)).toEqual({ kind: 'group', id: 'kids' });
  });

  it('drops someone the roster no longer offers', () => {
    expect(livePick({ kind: 'member', id: 'theo' }, choices)).toBeNull();
    expect(livePick({ kind: 'group', id: 'empty' }, choices)).toBeNull();
    expect(livePick(null, choices)).toBeNull();
  });
});

describe('wallPeopleFilter and wallSwitchedConfig', () => {
  const saved = { view: 'week-list', peopleFilter: undefined } as unknown as FullscreenCalendarConfig;

  it('keeps shared calendars unless the editor’s filter leaves them out', () => {
    expect(wallPeopleFilter({ kind: 'member', id: 'noah' }, undefined)).toEqual({ memberIds: ['noah'], groupIds: [], includeShared: true });
    expect(wallPeopleFilter({ kind: 'group', id: 'kids' }, { memberIds: [], groupIds: ['kids'], includeShared: false }))
      .toEqual({ memberIds: [], groupIds: ['kids'], includeShared: false });
  });

  it('answers the saved config itself while nothing is borrowed', () => {
    expect(wallSwitchedConfig(saved, 'view', null, null)).toBe(saved);
  });

  it('swaps in the borrowed view and the pick, and nothing else', () => {
    const drawn = wallSwitchedConfig(saved, 'view', 'month-grid', { kind: 'member', id: 'noah' });
    expect(drawn).not.toBe(saved);
    expect(drawn.view).toBe('month-grid');
    expect(drawn.peopleFilter).toEqual({ memberIds: ['noah'], groupIds: [], includeShared: true });
    expect(wallSwitchedConfig(saved, 'view', null, { kind: 'member', id: 'noah' }).view).toBe('week-list');
  });
});

describe('personEventCounts', () => {
  const ev = (id: string, sourceId: string, day: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id, title: id, start: `${day}T10:00:00`, end: `${day}T11:00:00`, allDay: false, sourceId, ...extra,
  });
  const events = [
    ev('a', 'noah', '2026-11-23'),
    ev('b', 'noah', '2026-11-24'),
    ev('c', 'noah', '2026-12-05'),
    ev('d', 'mia-school', '2026-11-25'),
    ev('e', 'family', '2026-11-25'),
    ev('f', 'mia', '2026-11-26', { kind: 'holiday' }),
  ];
  const week = { start: new Date(2026, 10, 22), end: new Date(2026, 10, 29) };

  it('counts each person’s own calendars inside the window, never shared events or holidays', () => {
    const counts = personEventCounts(events, PEOPLE, week);
    expect(Object.fromEntries(counts)).toEqual({ dana: 0, noah: 2, mia: 1 });
  });

  it('counts everything with no window', () => {
    expect(personEventCounts(events, PEOPLE, null).get('noah')).toBe(3);
  });
});
