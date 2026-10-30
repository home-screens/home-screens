/**
 * The starter chore list: every locale names every starter, every icon is one
 * the chore icon set can draw, and a selection becomes chores the server
 * accepts, going to the people the parent picked.
 */

import { describe, it, expect } from 'vitest';
import { LOCALES } from '@/i18n/manifest';
import { getIconDef, CHORE_ICONS } from '@/components/modules/chore-chart/ChoreIcon';
import { STARTER_CHORE_CATALOG, STARTER_CHORE_IDS } from '../starter-chores-catalog';
import {
  DEFAULT_STARTER_WEEKLY_DAY,
  STARTER_CHORE_COUNT,
  STARTER_CHORE_NAMES_BY_LOCALE,
  STARTER_CHORE_SECTIONS,
  buildStarterChores,
  defaultStarterAssignment,
  getStarterChoresForLocale,
  reconcileStarterAssignment,
  starterChoresInSection,
  starterIdsAlreadyAdded,
  starterSectionTiming,
} from '../starter-chores';

const now = '2026-01-01T00:00:00.000Z';
const member = (id: string, name: string) => ({ id, name, emoji: '', color: '#fff', createdAt: now, updatedAt: now });
const group = (id: string, name: string, memberIds: string[]) => ({ id, name, memberIds, createdAt: now, updatedAt: now });

describe('starter chore catalog', () => {
  it('lists every id exactly once, in the section order the picker shows', () => {
    expect(STARTER_CHORE_CATALOG.map((s) => s.id)).toEqual([...STARTER_CHORE_IDS]);
    expect(new Set(STARTER_CHORE_IDS).size).toBe(STARTER_CHORE_IDS.length);
    expect(STARTER_CHORE_COUNT).toBe(STARTER_CHORE_CATALOG.length);
    for (const section of STARTER_CHORE_SECTIONS) {
      expect(starterChoresInSection(getStarterChoresForLocale('en-US'), section).length).toBeGreaterThan(0);
    }
  });

  it('uses only icons the chore icon set draws and offers in its picker', () => {
    for (const spec of STARTER_CHORE_CATALOG) {
      expect(getIconDef(spec.icon), `${spec.id}: ${spec.icon}`).toBeDefined();
      // The curated picker set, so a starter edited later shows its icon as picked.
      expect(CHORE_ICONS, `${spec.id}: ${spec.icon} is not in CHORE_ICONS`).toContain(spec.icon);
    }
  });

  it('pays between 1 and 3 tickets', () => {
    for (const spec of STARTER_CHORE_CATALOG) {
      expect(spec.points, spec.id).toBeGreaterThanOrEqual(1);
      expect(spec.points, spec.id).toBeLessThanOrEqual(3);
    }
  });
});

describe('starter chore names', () => {
  const locales = Object.keys(LOCALES);

  it('ships a name table for every registered locale', () => {
    for (const tag of locales) {
      expect(STARTER_CHORE_NAMES_BY_LOCALE[tag], tag).toBeDefined();
    }
  });

  for (const tag of locales) {
    describe(tag, () => {
      const names = STARTER_CHORE_NAMES_BY_LOCALE[tag];

      it('names every starter, each once, without a trailing period or an em-dash', () => {
        const seen = new Set<string>();
        for (const id of STARTER_CHORE_IDS) {
          const name = names[id];
          expect(name?.trim().length, `${tag}: ${id}`).toBeGreaterThan(0);
          expect(name, `${tag}: ${id}`).not.toMatch(/[.—]$/);
          expect(name, `${tag}: ${id}`).not.toContain('—');
          const key = name.trim().toLocaleLowerCase();
          expect(seen.has(key), `${tag}: duplicate name "${name}"`).toBe(false);
          seen.add(key);
        }
      });

      if (tag !== 'en-US') {
        it('is not the English list copied over', () => {
          const english = STARTER_CHORE_NAMES_BY_LOCALE['en-US'];
          const identical = STARTER_CHORE_IDS.filter((id) => names[id] === english[id]);
          expect(identical, `${tag}: untranslated ${identical.join(', ')}`).toEqual([]);
        });
      }
    });
  }

  it('walks the locale fallback chain and ends at English', () => {
    expect(getStarterChoresForLocale('de-AT')[0].name).toBe(STARTER_CHORE_NAMES_BY_LOCALE['de-DE']['make-bed']);
    expect(getStarterChoresForLocale('ja-JP')[0].name).toBe('Make your bed');
  });
});

describe('already added', () => {
  it('matches on the name, ignoring case and spaces, and nothing else', () => {
    const starters = getStarterChoresForLocale('en-US');
    const added = starterIdsAlreadyAdded(starters, [
      { name: '  make YOUR bed ' },
      { name: 'Feed the dog' },
    ]);
    expect([...added]).toEqual(['make-bed']);
  });

  it('matches a chore picked from the list by its starter id whatever language the picker is in', () => {
    const english = getStarterChoresForLocale('en-US');
    const [picked] = buildStarterChores(english, new Set(['make-bed']), { assigneeIds: ['a'], assigneeGroupIds: [] });
    expect(picked.starterId).toBe('make-bed');
    const german = getStarterChoresForLocale('de-DE');
    expect([...starterIdsAlreadyAdded(german, [picked])]).toEqual(['make-bed']);
  });

  it('matches a chore saved before starter ids by its name in any shipped language', () => {
    const german = getStarterChoresForLocale('de-DE');
    const englishName = getStarterChoresForLocale('en-US').find((s) => s.id === 'make-bed')!.name;
    expect([...starterIdsAlreadyAdded(german, [{ name: englishName.toUpperCase() }])]).toEqual(['make-bed']);
    expect([...starterIdsAlreadyAdded(german, [{ name: 'Something else', starterId: undefined }])]).toEqual([]);
  });
});

describe('who the batch goes to by default', () => {
  const members = [member('a', 'Ada'), member('b', 'Bram'), member('c', 'Cleo'), member('m', 'Mom')];

  it('is the biggest group when the family has one', () => {
    const groups = [group('g-adults', 'Grown-ups', ['m']), group('g-kids', 'Kids', ['a', 'b', 'c'])];
    expect(defaultStarterAssignment(members, groups)).toEqual({ assigneeIds: [], assigneeGroupIds: ['g-kids'] });
  });

  it('is everyone when there is no group, and skips a group with nobody in it', () => {
    expect(defaultStarterAssignment(members, [])).toEqual({ assigneeIds: ['a', 'b', 'c', 'm'], assigneeGroupIds: [] });
    expect(defaultStarterAssignment(members, [group('g-empty', 'Nobody', [])])).toEqual({ assigneeIds: ['a', 'b', 'c', 'm'], assigneeGroupIds: [] });
  });
});

describe('building chores from a selection', () => {
  it('turns picked starters into ordinary daily or weekly chores for the chosen people', () => {
    const starters = getStarterChoresForLocale('en-US');
    const built = buildStarterChores(starters, new Set(['make-bed', 'take-out-trash']), { assigneeIds: ['a'], assigneeGroupIds: ['g-kids'] });
    expect(built).toEqual([
      {
        name: 'Make your bed',
        starterId: 'make-bed',
        emoji: 'lucide:bed',
        points: 1,
        frequency: 'daily',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        timeOfDay: 'morning',
        assigneeIds: ['a'],
        assigneeGroupIds: ['g-kids'],
        rotation: 'fixed',
      },
      {
        name: 'Take out the trash',
        starterId: 'take-out-trash',
        emoji: 'lucide:trash',
        points: 3,
        frequency: 'weekly',
        daysOfWeek: [6],
        timeOfDay: 'anytime',
        assigneeIds: ['a'],
        assigneeGroupIds: ['g-kids'],
        rotation: 'fixed',
      },
    ]);
  });

  it('puts every weekly starter on the one day the parent picked', () => {
    const starters = getStarterChoresForLocale('en-US');
    const built = buildStarterChores(starters, new Set(['take-out-trash', 'water-plants']), { assigneeIds: ['a'], assigneeGroupIds: [] }, 2);
    expect(built.map((c) => c.daysOfWeek)).toEqual([[2], [2]]);
    expect(built.every((c) => c.frequency === 'weekly')).toBe(true);
  });

  it('drops people and groups that no longer exist from an assignment', () => {
    const members = [member('a', 'Ada')];
    const groups = [group('g-kids', 'Kids', ['a'])];
    expect(reconcileStarterAssignment({ assigneeIds: ['a', 'gone'], assigneeGroupIds: ['g-kids', 'g-gone'] }, members, groups))
      .toEqual({ assigneeIds: ['a'], assigneeGroupIds: ['g-kids'] });
  });

  it('leaves the group field out when no group is picked, and keeps catalog order', () => {
    const starters = getStarterChoresForLocale('en-US');
    const built = buildStarterChores(starters, new Set(['walk-dog', 'homework']), { assigneeIds: ['a', 'b'], assigneeGroupIds: [] });
    expect(built.map((c) => c.name)).toEqual(['Do your homework', 'Walk the dog']);
    expect(built[0]).not.toHaveProperty('assigneeGroupIds');
    expect(built[0]).not.toHaveProperty('bonus');
  });

  it('maps every section to a time of day the chore form knows, weekly ones to a single day', () => {
    expect(starterSectionTiming('morning')).toEqual({ frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'morning' });
    expect(starterSectionTiming('afternoon').timeOfDay).toBe('afternoon');
    expect(starterSectionTiming('evening').timeOfDay).toBe('evening');
    // A weekly chore applies on every day it lists (choreAppliesToday), so the week is one day.
    expect(starterSectionTiming('weekly')).toEqual({ frequency: 'weekly', daysOfWeek: [DEFAULT_STARTER_WEEKLY_DAY], timeOfDay: 'anytime' });
    expect(starterSectionTiming('weekly', 0).daysOfWeek).toEqual([0]);
  });
});
