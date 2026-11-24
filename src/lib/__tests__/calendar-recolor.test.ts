import { describe, it, expect } from 'vitest';
import { recolorCalendars, recolorRequestProblem, recolorableCalendarIds, RECOLOR_MAX_CALENDARS } from '@/lib/calendar-recolor';
import type { CalendarSettings } from '@/types/config';

const settings = (extra: Partial<CalendarSettings> = {}): CalendarSettings => ({
  googleCalendarIds: ['family@example.com'],
  icalSources: [{ id: 'ical-1', type: 'ical', name: 'School', url: 'https://example.com/a.ics', color: '#3b82f6', enabled: true }],
  icloudSources: [{ id: 'icloud-1', accountId: 'acct', type: 'calendar', name: 'Home', url: 'https://example.com/cal', color: '#ef4444', enabled: true }],
  daysAhead: 7,
  ...extra,
} as CalendarSettings);

describe('recolorRequestProblem', () => {
  it('takes a full hex colour and a list of ids', () => {
    expect(recolorRequestProblem(['a'], '#10B981')).toBeNull();
  });

  it.each(['rebeccapurple', '#abc', 'aabbcc', 'rgb(1,2,3)', 42, undefined])('refuses the colour %s', (color) => {
    expect(recolorRequestProblem(['a'], color)).toBe('badColor');
  });

  it.each([[[]], [undefined], [['']], [[7]], [Array.from({ length: RECOLOR_MAX_CALENDARS + 1 }, (_, i) => `c${i}`)]])('refuses the calendars %j', (ids) => {
    expect(recolorRequestProblem(ids, '#10b981')).toBe('badCalendars');
  });
});

describe('recolorCalendars', () => {
  it('knows every calendar that is set up, whichever kind', () => {
    expect([...recolorableCalendarIds(settings())].sort()).toEqual(['family@example.com', 'ical-1', 'icloud-1']);
  });

  it('keeps a Google or iCloud colour as the same override the pencil in Settings writes', () => {
    const result = recolorCalendars(settings({ calendarOverrides: { 'family@example.com': { name: 'Us' } } }), ['family@example.com', 'icloud-1'], '#10B981');
    if (!('calendar' in result)) throw new Error('refused');
    expect(result.calendar.calendarOverrides).toEqual({
      'family@example.com': { name: 'Us', color: '#10b981' },
      'icloud-1': { color: '#10b981' },
    });
    expect(result.calendar.icalSources![0].color).toBe('#3b82f6');
  });

  it('changes a calendar link on the link itself', () => {
    const result = recolorCalendars(settings(), ['ical-1'], '#10b981');
    if (!('calendar' in result)) throw new Error('refused');
    expect(result.calendar.icalSources![0].color).toBe('#10b981');
    expect(result.calendar.calendarOverrides).toBeUndefined();
  });

  it('refuses the whole request when one calendar is not set up', () => {
    expect(recolorCalendars(settings(), ['ical-1', 'holidays'], '#10b981')).toEqual({ problem: 'unknownCalendar' });
  });
});
