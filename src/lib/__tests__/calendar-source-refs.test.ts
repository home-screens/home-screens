import { describe, it, expect } from 'vitest';
import {
  configuredCalendarSourceIds,
  hasCalendarOwners,
  livePersonSources,
  pruneCalendarSourceRefs,
  prunePersonSources,
  removedCalendarSourceIds,
} from '@/lib/calendar-source-refs';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { CalendarSettings, ICalSource, ICloudSource, ModuleInstance, ScreenConfiguration } from '@/types/config';

const feed = (id: string, enabled = true): ICalSource => ({ id, type: 'ical', name: id, url: `https://example.com/${id}.ics`, color: '#000000', enabled });
const icloud = (id: string): ICloudSource => ({ id, accountId: 'acct', kind: 'calendar', url: `https://caldav.example.com/${id}`, name: id, color: '#000000', enabled: true });

function calendar(overrides: Partial<CalendarSettings> = {}): CalendarSettings {
  return { googleCalendarIds: [], icalSources: [], daysAhead: 7, ...overrides };
}

function mod(id: string, type: string, config: Record<string, unknown> = {}): ModuleInstance {
  return { id, type: type as ModuleInstance['type'], position: { x: 0, y: 0 }, size: { w: 200, h: 200 }, zIndex: 1, config, style: { ...DEFAULT_MODULE_STYLE } };
}

describe('configuredCalendarSourceIds', () => {
  it('names every kind of source, switched off or not', () => {
    const ids = configuredCalendarSourceIds(calendar({
      googleCalendarIds: ['family@example.com'],
      icalSources: [feed('school'), feed('paused', false)],
      icloudSources: [icloud('work')],
      holidayCountry: 'US',
    }));
    expect([...ids].sort()).toEqual(['family@example.com', 'holidays', 'paused', 'school', 'work']);
  });
});

describe('removedCalendarSourceIds', () => {
  it('is what the old settings had and the new ones do not', () => {
    const before = calendar({ googleCalendarIds: ['g1', 'g2'], icalSources: [feed('a'), feed('b')] });
    const after = calendar({ googleCalendarIds: ['g2'], icalSources: [feed('b'), feed('c')] });
    expect([...removedCalendarSourceIds(before, after)].sort()).toEqual(['a', 'g1']);
  });
});

describe('prunePersonSources', () => {
  it('drops a person whose only calendar went', () => {
    expect(prunePersonSources({ ann: ['a', 'b'], ben: ['b'] }, (id) => id !== 'b')).toEqual({ ann: ['a'] });
  });

  it('hands back the same object when nothing goes', () => {
    const personSources = { ann: ['a'] };
    expect(prunePersonSources(personSources, () => true)).toBe(personSources);
  });

  it('drops a person left with an empty list', () => {
    expect(prunePersonSources({ ann: ['a'], ben: [] }, () => true)).toEqual({ ann: ['a'] });
  });
});

describe('livePersonSources and hasCalendarOwners', () => {
  it('count only calendars that still exist, so a saved dangling id heals on read', () => {
    const settings = calendar({ icalSources: [feed('a')], personSources: { ann: ['a', 'gone'], ben: ['gone'] } });
    expect(livePersonSources(settings)).toEqual({ ann: ['a'] });
    expect(hasCalendarOwners(settings)).toBe(true);
    expect(hasCalendarOwners(calendar({ personSources: { ben: ['gone'] } }))).toBe(false);
  });
});

describe('pruneCalendarSourceRefs', () => {
  function config(): ScreenConfiguration {
    return {
      version: 1,
      settings: {
        calendar: calendar({ icalSources: [feed('keep')], personSources: { ann: ['keep', 'gone'], ben: ['gone'] } }),
      } as ScreenConfiguration['settings'],
      screens: [{ id: 'legacy', name: 'Legacy', backgroundImage: '', modules: [mod('l', 'calendar', { sourceFilter: ['keep', 'gone'] })] }],
      displays: [{
        id: 'main',
        name: 'Main',
        screens: [{
          id: 'm1',
          name: 'Home',
          backgroundImage: '',
          modules: [
            mod('only-gone', 'fullscreen-calendar', { view: 'agenda', sourceFilter: ['gone'] }),
            mod('rules', 'calendar', { eventRules: [{ id: 'r', match: { sourceIds: ['gone'] }, hide: true }] }),
            mod('plugin', 'plugin:agenda', { sourceFilter: ['gone'] }),
          ],
        }],
      }],
    };
  }

  it('takes a removed calendar out of who owns it', () => {
    const next = pruneCalendarSourceRefs(config(), new Set(['gone']));
    expect(next.settings.calendar.personSources).toEqual({ ann: ['keep'] });
  });

  it('takes it out of calendar module source lists on every display', () => {
    const next = pruneCalendarSourceRefs(config(), new Set(['gone']));
    expect(next.screens[0].modules[0].config.sourceFilter).toEqual(['keep']);
    // A list that named only the removed calendar goes back to every
    // calendar, as unticking its last box in the editor does.
    expect(next.displays![0].screens[0].modules[0].config).toEqual({ view: 'agenda' });
  });

  it('leaves event rules and other modules alone', () => {
    const before = config();
    const next = pruneCalendarSourceRefs(before, new Set(['gone']));
    // An emptied rule would match every event, and this one hides.
    expect(next.displays![0].screens[0].modules[1]).toBe(before.displays![0].screens[0].modules[1]);
    expect(next.displays![0].screens[0].modules[2]).toBe(before.displays![0].screens[0].modules[2]);
  });

  it('hands back the same config when nothing named the removed calendar', () => {
    const before = config();
    expect(pruneCalendarSourceRefs(before, new Set(['never-used']))).toBe(before);
    expect(pruneCalendarSourceRefs(before, new Set())).toBe(before);
  });
});
