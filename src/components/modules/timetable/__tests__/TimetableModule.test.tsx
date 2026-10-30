// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import type { ReactNode } from 'react';
import { render, cleanup } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE, type ModuleStyle, type TimetableConfig } from '@/types/config';
import { CARD_GAP_PX } from '@/lib/timetable-layout';
import type { FamilyMember } from '@/types/family';
import type { FetchError } from '@/lib/fetch-error';
import type {
  Timetable,
  TimetableCell,
  TimetableSchool,
  TimetableSubject,
} from '@/types/timetables';
import { installResizeObserverStub, I18nWrapper as Wrapper } from '../../__tests__/helpers/harness';
import { I18nProvider } from '@/i18n/provider';
import deDEModules from '@/translations/de-DE/modules.json';
import deDECore from '@/translations/de-DE/core.json';
import nlNLModules from '@/translations/nl-NL/modules.json';
import nlNLCore from '@/translations/nl-NL/core.json';

installResizeObserverStub();

// The module measures its own box and works its cards' boxes out of it, and
// jsdom measures nothing. `box` is the module's box; `moduleFor` turns the card
// box a test cares about into the module box that hands out cards that size,
// so every expectation below is written in card widths.
const INSET = DEFAULT_MODULE_STYLE.padding + DEFAULT_MODULE_STYLE.borderWidth;

/** The module box that gives each of `count` cards side by side a box this size. */
function moduleFor(card: { width: number; height: number }, count = 1) {
  return {
    width: count * (card.width + INSET * 2) + CARD_GAP_PX * (count - 1),
    height: card.height + INSET * 2,
  };
}

let box = moduleFor({ width: 570, height: 880 });
const attach = () => {};
vi.mock('@/hooks/useElementBox', () => ({
  useElementBox: () => [attach, box],
  useElementWidth: () => [attach, box.width],
}));

// Every fetch the module makes, answered from these. `asked` records the URLs
// so a test can prove a request was never made at all.
let timetables: { data: unknown; revision: string } | null = null;
let roster: { members: FamilyMember[]; revision: string } | null = null;
/** One answer per region, the shape the holiday route serves. */
let holidays: Record<string, unknown> = {};
let rosterError: FetchError | null = null;
const asked = new Set<string>();
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: (url: string) => {
    if (url) asked.add(url);
    if (url === '/api/timetables') return [timetables, null, null];
    if (url === '/api/family') return [roster, rosterError, null];
    // Only the regions the wall asked about come back, the way the route
    // answers, so a test cannot pass on a region nobody requested.
    if (url.startsWith('/api/timetables/holidays')) {
      const wanted = new URL(url, 'http://x').searchParams.get('region')?.split(',') ?? [];
      const regions = Object.fromEntries(
        wanted.filter((code) => code in holidays).map((code) => [code, holidays[code]]),
      );
      return [{ regions }, null, null];
    }
    return [null, null, null];
  },
}));

import TimetableModule from '../TimetableModule';

// ---------------------------------------------------------------------------
// The sample household the mockups were drawn from
// ---------------------------------------------------------------------------

const ZONE = 'Europe/Berlin';
/** Thursday 10 September 2026, 07:10 in Berlin: the moment every frame shows. */
const NOW = new Date('2026-09-10T05:10:00Z');

const GAR: TimetableSchool = {
  id: 'gar',
  name: 'Gymnasium am Rhein',
  slots: [
    { kind: 'period', n: 1, start: '07:50', end: '08:35' },
    { kind: 'period', n: 2, start: '08:40', end: '09:25' },
    { kind: 'break', label: 'Pause', start: '09:25', end: '09:45' },
    { kind: 'period', n: 3, start: '09:45', end: '10:30' },
    { kind: 'period', n: 4, start: '10:35', end: '11:20' },
    { kind: 'break', label: 'Pause', start: '11:20', end: '11:40' },
    { kind: 'period', n: 5, start: '11:40', end: '12:25' },
    { kind: 'period', n: 6, start: '12:30', end: '13:15' },
    { kind: 'period', n: 7, start: '13:20', end: '14:05' },
    { kind: 'period', n: 8, start: '14:10', end: '14:55' },
    { kind: 'period', n: 9, start: '15:00', end: '15:45' },
    { kind: 'period', n: 10, start: '15:50', end: '16:35' },
  ],
  weekCycle: { mode: 'parity', oddWeek: 'A' },
  specialDays: [],
};

const GGS: TimetableSchool = {
  id: 'ggs',
  name: 'GGS Lindenweg',
  slots: [
    { kind: 'period', n: 1, start: '08:15', end: '09:00' },
    { kind: 'period', n: 2, start: '09:00', end: '09:40' },
    { kind: 'break', label: 'Hofpause', start: '09:40', end: '10:00' },
    { kind: 'break', label: 'Frühstück', start: '10:00', end: '10:15' },
    { kind: 'period', n: 3, start: '10:15', end: '11:00' },
    { kind: 'period', n: 4, start: '11:00', end: '11:45' },
    { kind: 'break', label: 'Hofpause', start: '11:45', end: '12:00' },
    { kind: 'period', n: 5, start: '12:00', end: '12:45' },
    { kind: 'period', n: 6, start: '12:45', end: '13:30' },
    { kind: 'period', n: 7, start: '13:30', end: '14:15' },
    { kind: 'period', n: 8, start: '14:15', end: '15:00' },
  ],
  weekCycle: { mode: 'off' },
  care: { name: 'OGS', until: { mon: '16:00', tue: '16:00', wed: '16:00', thu: '16:00', fri: '15:00' } },
  specialDays: [],
};

const SUBJECTS: TimetableSubject[] = [
  { id: 'deu', code: 'Deu', name: 'Deutsch', color: '#f26363', icon: 'book' },
  { id: 'ma', code: 'Ma', name: 'Mathe', color: '#4f8ef7', icon: 'triangle' },
  { id: 'eng', code: 'Eng', name: 'Englisch', color: '#f2c94c', icon: 'speech' },
  { id: 'frz', code: 'Frz', name: 'Französisch', color: '#f58b3c', icon: 'speech' },
  { id: 'bio', code: 'Bio', name: 'Biologie', color: '#43c07e', icon: 'leaf' },
  { id: 'ch', code: 'Ch', name: 'Chemie', color: '#26b5a8', icon: 'flask' },
  { id: 'ph', code: 'Ph', name: 'Physik', color: '#3ab7f0', icon: 'atom' },
  { id: 'ek', code: 'Ek', name: 'Erdkunde', color: '#b5c23a', icon: 'globe', bring: 'Atlas' },
  { id: 'ge', code: 'Ge', name: 'Geschichte', color: '#e0a86e', icon: 'castle' },
  { id: 'sowi', code: 'Sowi', name: 'Sozialwissenschaften', color: '#7c8cf8', icon: 'people' },
  { id: 'paed', code: 'Päd', name: 'Pädagogik', color: '#b59cf0', icon: 'people' },
  { id: 'rel', code: 'Rel', name: 'Religion', color: '#c084fc', icon: 'star' },
  { id: 'ku', code: 'Ku', name: 'Kunst', color: '#ee6fd8', icon: 'palette', bring: 'Malsachen' },
  { id: 'mu', code: 'Mu', name: 'Musik', color: '#fb6f92', icon: 'music' },
  { id: 'sp', code: 'Sp', name: 'Sport', color: '#8fdc4e', icon: 'ball', bring: 'Sportzeug' },
  { id: 'su', code: 'SU', name: 'Sachunterricht', color: '#2fc48d', icon: 'magnifier' },
  { id: 'foe', code: 'Fö', name: 'Förderunterricht', color: '#a1a1aa', icon: 'heart' },
  { id: 'kr', code: 'KR', name: 'Klassenrat', color: '#cbd5e1', icon: 'chat' },
  { id: 'geige', code: 'Geige', name: 'Geige (JeKits)', color: '#fb6f92', icon: 'music', bring: 'Geige' },
];

/** One lesson: subject, and the room or course group when it has one. */
const l = (subjectId: string, room?: string, course?: string): TimetableCell => ({
  subjectId,
  ...(room ? { room } : {}),
  ...(course ? { course } : {}),
});
const LUNCH: TimetableCell = { lunch: true };

const LEON: Timetable = {
  memberId: 'leon',
  schoolId: 'gar',
  className: '7c',
  weeks: {
    A: {
      mon: { 1: l('ma', '112'), 2: l('ma', '112'), 3: l('deu', '112'), 4: l('deu', '112'), 5: l('eng', '112'), 6: l('ge', '112') },
      tue: { 1: l('frz', '112'), 2: l('frz', '112'), 3: l('eng', '112'), 4: l('eng', '112'), 5: l('bio', 'Bio 1'), 6: l('bio', 'Bio 1'), 7: LUNCH, 8: l('ku', 'Ku 2'), 9: l('ku', 'Ku 2') },
      wed: { 1: l('deu', '112'), 2: l('ma', '112'), 3: l('ch', 'Ch 1'), 4: l('ch', 'Ch 1'), 5: l('rel', '112'), 6: l('rel', '112') },
      thu: { 2: l('eng', '112'), 3: l('ek', '204'), 4: l('ek', '204'), 5: l('frz', '112'), 6: l('ph', 'Ph 2') },
      fri: { 1: l('deu', '112'), 2: l('ma', '112'), 3: l('frz', '112'), 4: l('ge', '112'), 5: l('sp', 'Halle'), 6: l('sp', 'Halle') },
    },
    B: {
      mon: { 1: l('ma', '112'), 2: l('ma', '112'), 3: l('deu', '112'), 4: l('deu', '112'), 5: l('eng', '112'), 6: l('ge', '112') },
      tue: { 1: l('frz', '112'), 2: l('frz', '112'), 3: l('eng', '112'), 4: l('eng', '112'), 5: l('bio', 'Bio 1'), 6: l('bio', 'Bio 1'), 7: LUNCH, 8: l('ku', 'Ku 2'), 9: l('ku', 'Ku 2') },
      wed: { 1: l('deu', '112'), 2: l('ma', '112'), 3: l('ch', 'Ch 1'), 4: l('ch', 'Ch 1'), 5: l('rel', '112'), 6: l('rel', '112') },
      thu: { 2: l('eng', '112'), 3: l('mu', 'Mu 1'), 4: l('mu', 'Mu 1'), 5: l('frz', '112'), 6: l('ph', 'Ph 2') },
      fri: { 1: l('deu', '112'), 2: l('ma', '112'), 3: l('frz', '112'), 4: l('ge', '112'), 5: l('sp', 'Halle'), 6: l('sp', 'Halle') },
    },
  },
};

const MIA: Timetable = {
  memberId: 'mia',
  schoolId: 'ggs',
  className: '4b',
  icons: true,
  weeks: {
    A: {
      mon: { 1: l('deu'), 2: l('deu'), 3: l('ma'), 4: l('eng'), 5: l('sp', 'Halle'), 6: l('sp', 'Halle') },
      tue: { 1: l('ma'), 2: l('ma'), 3: l('su'), 4: l('deu'), 5: l('ku', 'Ku 2'), 6: l('ku', 'Ku 2') },
      wed: { 1: l('deu'), 2: l('ma'), 3: l('su'), 4: l('rel'), 5: l('eng'), 8: l('geige') },
      thu: { 1: l('deu'), 2: l('ma'), 3: l('mu', 'Mu 1'), 4: l('rel'), 5: l('sp', 'Halle') },
      fri: { 1: l('kr'), 2: l('su'), 3: l('eng'), 4: l('mu', 'Mu 1'), 5: l('foe') },
    },
  },
};

const PAUL: Timetable = {
  memberId: 'paul',
  schoolId: 'gar',
  className: 'Q1',
  weeks: {
    A: {
      mon: { 1: l('deu', undefined, 'LK'), 2: l('deu', undefined, 'LK'), 3: l('ma', undefined, 'GK'), 4: l('ma', undefined, 'GK'), 7: LUNCH, 8: l('sowi', undefined, 'GK'), 9: l('sowi', undefined, 'GK') },
      tue: { 3: l('bio', 'Bio 1', 'LK'), 4: l('bio', 'Bio 1', 'LK'), 5: l('eng', undefined, 'GK'), 6: l('eng', undefined, 'GK'), 7: LUNCH, 8: l('sp', 'Halle', 'GK'), 9: l('sp', 'Halle', 'GK') },
      wed: { 1: l('ge', undefined, 'GK'), 2: l('ge', undefined, 'GK'), 3: l('deu', undefined, 'LK'), 4: l('paed', undefined, 'GK'), 5: l('paed', undefined, 'GK'), 6: l('ku', 'Ku 2', 'GK') },
      thu: { 1: l('bio', 'Bio 1', 'LK'), 2: l('bio', 'Bio 1', 'LK'), 3: l('ku', 'Ku 2', 'GK'), 4: l('ku', 'Ku 2', 'GK'), 6: l('ma', undefined, 'GK'), 8: l('rel', undefined, 'GK'), 9: l('rel', undefined, 'GK'), 10: l('sp', 'Halle', 'GK') },
      fri: { 1: l('deu', undefined, 'LK'), 2: l('deu', undefined, 'LK'), 3: l('eng', undefined, 'GK'), 4: l('bio', 'Bio 1', 'LK'), 6: l('ge', undefined, 'GK'), 7: l('sowi', undefined, 'GK'), 8: l('paed', undefined, 'GK'), 9: l('rel', undefined, 'GK') },
    },
  },
};

const member = (id: string, name: string, color: string): FamilyMember => ({
  id,
  name,
  color,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

/** Lina is in the household and at nursery: she is the person with no timetable. */
const MEMBERS: FamilyMember[] = [
  member('leon', 'Leon', '#60a5fa'),
  member('mia', 'Mia', '#fbbf24'),
  member('lina', 'Lina', '#a78bfa'),
  member('paul', 'Paul', '#4ade80'),
];

const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE };

function makeConfig(over: Partial<TimetableConfig> = {}): TimetableConfig {
  return { memberIds: ['leon'], layout: 'side-by-side', detail: 'less', ...over };
}

/** The same household on a German wall: the language every frame was drawn in. */
function GermanWrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="de-DE" blob={{ modules: deDEModules, core: deDECore }}>
      {children}
    </I18nProvider>
  );
}

/** The same household on a Dutch wall, for the seams the Dutch list carries. */
function DutchWrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="nl-NL" blob={{ modules: nlNLModules, core: nlNLCore }}>
      {children}
    </I18nProvider>
  );
}

function renderModule(
  over: Partial<TimetableConfig> = {},
  cardStyle: Partial<ModuleStyle> = {},
  wrapper: typeof Wrapper = Wrapper,
  timeFormat: '24h' | '12h' = '24h',
) {
  return render(
    <TimetableModule
      config={makeConfig(over)}
      style={{ ...style, ...cardStyle }}
      timezone={ZONE}
      timeFormat={timeFormat}
    />,
    { wrapper },
  );
}

/**
 * The same household, with a holiday region written on the schools named.
 * Which holidays close a school belongs to the school, so this is the only way
 * a card gets any.
 */
function inRegions(regions: { gar?: string; ggs?: string }) {
  timetables = {
    data: {
      schools: [
        { ...GAR, ...(regions.gar ? { holidayRegion: regions.gar } : {}) },
        { ...GGS, ...(regions.ggs ? { holidayRegion: regions.ggs } : {}) },
      ],
      subjects: SUBJECTS,
      timetables: [LEON, MIA, PAUL],
    },
    revision: 'r1',
  };
}

/** Every holiday lookup the wall made, in the order it made them. */
const holidayCalls = () => [...asked].filter((url) => url.startsWith('/api/timetables/holidays'));

const card = (root: HTMLElement, id: string) =>
  root.querySelector<HTMLElement>(`[data-testid="timetable-card"][data-member="${id}"]`);
const cells = (root: HTMLElement, selector: string) =>
  Array.from(root.querySelectorAll<HTMLElement>(selector));
const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? '';

beforeAll(() => {
  // shouldAdvanceTime keeps React's scheduler from stalling under fake timers.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  vi.setSystemTime(NOW);
  box = moduleFor({ width: 570, height: 880 });
  timetables = {
    data: { schools: [GAR, GGS], subjects: SUBJECTS, timetables: [LEON, MIA, PAUL] },
    revision: 'r1',
  };
  roster = { members: MEMBERS, revision: 'f1' };
  rosterError = null;
  holidays = {};
  asked.clear();
});
afterEach(() => cleanup());

describe('TimetableModule', () => {
  it('draws one card per person, each in a card of its own', () => {
    const { container } = renderModule({ memberIds: ['leon', 'mia', 'paul'] });
    const drawn = cells(container, '[data-testid="timetable-card"]');
    expect(drawn.map((el) => el.dataset.member)).toEqual(['leon', 'mia', 'paul']);
    for (const el of drawn) {
      // The card around each week is a real module card: its own padding,
      // corner and glass, from the one Style section.
      expect(el.parentElement?.style.padding).toBe(`${DEFAULT_MODULE_STYLE.padding}px`);
      expect(el.parentElement?.style.borderRadius).toBe(`${DEFAULT_MODULE_STYLE.borderRadius}px`);
    }
  });

  it('follows the order the family list is in, not the order people were picked', () => {
    const { container } = renderModule({ memberIds: ['paul', 'mia'] });
    expect(cells(container, '[data-testid="timetable-card"]').map((el) => el.dataset.member)).toEqual([
      'mia',
      'paul',
    ]);
  });

  it('leaves out people who have no timetable and ids nobody in the family has', () => {
    const { container } = renderModule({ memberIds: ['leon', 'lina', 'gone'] });
    expect(cells(container, '[data-testid="timetable-card"]').map((el) => el.dataset.member)).toEqual([
      'leon',
    ]);
  });

  it('asks who to show when nobody is picked', () => {
    const { container } = renderModule({ memberIds: [] });
    // The empty card names the module above the line, the way it does for
    // every module the palette lists.
    const empty = text(container.querySelector('[data-testid="module-empty-state"]'));
    expect(empty).toContain('School Timetable');
    expect(empty).toContain("Pick whose week to show in this module's settings.");
  });

  it('says where a timetable is entered when nobody picked has one', () => {
    const { container } = renderModule({ memberIds: ['lina'] });
    const empty = text(container.querySelector('[data-testid="module-empty-state"]'));
    expect(empty).toContain('School Timetable');
    expect(empty).toContain('No timetable yet. A grown-up can add one in the editor.');
  });

  it('waits quietly while the first read is out', () => {
    timetables = null;
    const { container } = renderModule();
    expect(container.querySelector('[data-testid="timetable-card"]')).toBeNull();
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('says it is not updating when the family list cannot be read', () => {
    // Otherwise a blip on the roster would read as "nobody has a timetable",
    // which is a different and wrong thing to tell the room.
    roster = null;
    rosterError = { kind: 'transient', message: 'network' };
    const { container } = renderModule();
    expect(container.querySelector('[data-testid="module-not-updating"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="module-empty-state"]')).toBeNull();
  });

  it('asks for holidays only when a school names a region', () => {
    // A display nobody asked to follow a school calendar must not quietly
    // start talking to one.
    renderModule();
    expect(holidayCalls()).toEqual([]);
    cleanup();

    asked.clear();
    inRegions({ gar: 'DE-NW' });
    renderModule();
    expect(holidayCalls()).toEqual(['/api/timetables/holidays?region=DE-NW']);
  });

  it('asks once for a region, however many cards stand in it', () => {
    // Leon and Paul are at the same school, and three brothers and sisters at
    // one school asking three times over is the whole reason the regions are
    // gathered before anything is fetched.
    inRegions({ gar: 'DE-NW', ggs: 'DE-NW' });
    renderModule({ memberIds: ['leon', 'mia', 'paul'] });

    expect(holidayCalls()).toEqual(['/api/timetables/holidays?region=DE-NW']);
  });

  it('asks about both regions in one request, in the same order whoever is on the wall', () => {
    // The URL is what the fetch is cached under, so two walls showing the same
    // two schools in a different card order have to ask the same question.
    inRegions({ gar: 'DE-NW', ggs: 'DE-BY' });
    renderModule({ memberIds: ['leon', 'mia'] });
    expect(holidayCalls()).toEqual(['/api/timetables/holidays?region=DE-BY,DE-NW']);
    cleanup();

    asked.clear();
    renderModule({ memberIds: ['mia', 'leon'] });
    expect(holidayCalls()).toEqual(['/api/timetables/holidays?region=DE-BY,DE-NW']);
  });

  it('stacks the cards in rows when that is the layout', () => {
    const sideBySide = renderModule({ memberIds: ['leon', 'mia'] });
    const across = sideBySide.container.querySelector<HTMLElement>('[data-testid="timetable-card"]')
      ?.parentElement?.parentElement;
    expect(across?.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    cleanup();
    const stacked = renderModule({ memberIds: ['leon', 'mia'], layout: 'stacked' });
    const down = stacked.container.querySelector<HTMLElement>('[data-testid="timetable-card"]')
      ?.parentElement?.parentElement;
    expect(down?.style.gridTemplateRows).toBe('repeat(2, minmax(0, 1fr))');
  });
});

describe('the row of cards reads as a set', () => {
  it('draws every card at one size, the smallest any of them can hold', () => {
    // Three weeks of different lengths in one box. Settled on their own the
    // cards came out at three sizes, so a row of brothers and sisters did not
    // read as a row.
    box = moduleFor({ width: 570, height: 880 }, 3);
    const { container } = renderModule({ memberIds: ['leon', 'mia', 'paul'], detail: 'some' });
    const sizes = cells(container, '[data-testid="timetable-card"]').map((el) => el.style.fontSize);
    expect(sizes).toHaveLength(3);
    expect(new Set(sizes).size).toBe(1);
  });

  it('takes the day line the most pressed card in the row needs', () => {
    // Mia's name is three characters shorter than her brothers', which used to
    // be the whole of the difference between her keeping "Today 08:15 to
    // 12:45" and Leon beside her showing bare times.
    box = moduleFor({ width: 321, height: 980 }, 3);
    const { container } = renderModule({ memberIds: ['leon', 'mia', 'paul'], detail: 'more' });
    const lines = cells(container, '[data-testid="timetable-meta"]').map((el) => text(el));
    expect(lines).toHaveLength(3);
    const withWord = lines.filter((line) => line.includes('Today'));
    expect(withWord.length === 0 || withWord.length === lines.length).toBe(true);
  });
});

describe('a week nobody has filled in yet', () => {
  /** What pressing Add in the editor saves: a school, a class, and no lessons. */
  const BLANK: Timetable = { memberId: 'paul', schoolId: 'gar', className: 'Q1', weeks: { A: {} } };

  beforeEach(() => {
    timetables = { data: { schools: [GAR, GGS], subjects: SUBJECTS, timetables: [LEON, BLANK] }, revision: 'r1' };
  });

  it('says so in words instead of drawing an empty grid', () => {
    const { container } = renderModule({ memberIds: ['paul'] });
    expect(text(container.querySelector('[data-testid="timetable-empty-week"]'))).toBe('No lessons yet');
    expect(container.querySelector('[data-testid="timetable-grid"]')).toBeNull();
    // "No school" is what a closed day says. A week nobody has filled in is
    // not a holiday, and the card must not tell the room that it is.
    expect(container.textContent).not.toContain('No school');
    expect(container.querySelector('[data-testid="timetable-meta"]')).toBeNull();
  });

  it('is sized like the cards beside it rather than dropping to the floor', () => {
    const { container } = renderModule({ memberIds: ['leon', 'paul'] });
    const sizes = cells(container, '[data-testid="timetable-card"]').map((el) => el.style.fontSize);
    expect(new Set(sizes).size).toBe(1);
    // The floor is 16px. An empty week used to derive nothing and land on it
    // while its sibling was drawn half as big again.
    expect(parseFloat(sizes[0])).toBeGreaterThan(16);
  });
});

describe('the header line', () => {
  it('draws the heading the Style panel set, once, above the cards', () => {
    const { container } = renderModule({ memberIds: ['leon', 'mia'] }, { title: 'School week' });
    const titles = cells(container, '[data-module-title]');
    expect(titles).toHaveLength(1);
    expect(text(titles[0])).toBe('School week');
    expect(titles[0].closest('[data-testid="timetable-header"]')).not.toBeNull();
    // The cards themselves must not each grow a strip saying the same thing.
    for (const el of cells(container, '[data-testid="timetable-card"]')) {
      expect(el.parentElement?.querySelector('[data-module-title]')).toBeNull();
    }
  });

  it('scales the heading off the cards below it and holds its band to a share of the box', () => {
    // A fixed 16px on every canvas is what this replaces: at 4K it was 16px
    // over cards drawn at 53px, and on a small box a long heading wrapped to a
    // second line, took a fifth of the module and left the cards 7px.
    const { container } = renderModule({ memberIds: ['leon'] }, { title: 'School week' });
    const band = container.querySelector<HTMLElement>('[data-testid="timetable-header"]');
    const line = container.querySelector<HTMLElement>('[data-module-title]');
    const size = parseFloat(line?.style.fontSize ?? '0');
    const cardSize = parseFloat(
      cells(container, '[data-testid="timetable-card"]')[0].style.fontSize,
    );
    expect(size).toBeGreaterThan(16);
    expect(size).toBeGreaterThan(cardSize);
    expect(parseFloat(String(band?.style.height))).toBeLessThanOrEqual(box.height * 0.12);
    // One line that gives up its end, never a paragraph above the cards.
    expect(line?.style.whiteSpace).toBe('nowrap');
  });

  it('names the week on the card, not in a band above it', () => {
    // The letter is a badge beside the class. A shared line above the cards
    // cost the module a band of its own height that no other module takes.
    const { container } = renderModule({ memberIds: ['leon'] });
    expect(text(container.querySelector('[data-testid="timetable-week-label"]'))).toBe('A');
    expect(container.querySelector('[data-testid="timetable-header"]')).toBeNull();
  });

  it('leaves the badge off a school that runs the same week every week', () => {
    const { container } = renderModule({ memberIds: ['mia'] });
    expect(container.querySelector('[data-testid="timetable-week-label"]')).toBeNull();
  });

  it('gives the cards the whole box when no heading is set', () => {
    const { container } = renderModule({ memberIds: ['mia'] });
    expect(container.querySelector('[data-testid="timetable-header"]')).toBeNull();
  });
});

describe('the week card', () => {
  it('lights the day the layout resolved', () => {
    const { container } = renderModule();
    const days = cells(container, '[data-testid="timetable-day"]');
    expect(days.filter((el) => el.dataset.focus === 'true').map((el) => el.dataset.day)).toEqual([
      'thu',
    ]);
    expect(text(container.querySelector('[data-day="thu"][data-testid="timetable-day"]'))).toContain(
      'Today',
    );
  });

  it('draws a double lesson as one block over both its periods', () => {
    const { container } = renderModule();
    const thursday = cells(container, '[data-day="thu"] [data-kind="lesson"]');
    const doubles = thursday.filter((el) => el.dataset.periods === '3,4');
    expect(doubles).toHaveLength(1);
    // Nothing else claims either of those two periods.
    expect(thursday.filter((el) => el.dataset.periods === '3' || el.dataset.periods === '4')).toHaveLength(0);
    const placed = doubles[0].parentElement as HTMLElement;
    expect(placed.style.gridRow).toBe('5 / 7');
  });

  it('names the folded afternoon and when it starts', () => {
    const { container } = renderModule();
    const fold = container.querySelector('[data-testid="timetable-gutter"][data-row-kind="fold"]');
    expect(text(fold)).toBe('7–913:20');
    // Tuesday's art runs 14:10 to 15:45 inside that one row.
    const tuesday = container.querySelector('[data-day="tue"] [data-kind="folded"]');
    expect(text(tuesday)).toContain('14:10');
  });

  it('says "free" for a real gap, and nothing for one the fold made', () => {
    const { container } = renderModule({ memberIds: ['leon', 'mia'] });
    const leon = card(container, 'leon') as HTMLElement;
    const gap = cells(leon, '[data-day="thu"] [data-kind="free"]');
    expect(gap.map((el) => el.dataset.periods)).toEqual(['1']);
    // Mia's Wednesday is free from midday until violin, which is folded away:
    // naming a gap nobody has would be worse than leaving it out.
    const mia = card(container, 'mia') as HTMLElement;
    expect(cells(mia, '[data-day="wed"] [data-kind="free"]')).toHaveLength(0);
    expect(cells(mia, '[data-day="wed"] [data-kind="folded"]')).toHaveLength(1);
  });

  it('keeps the lunch tray between the morning and the afternoon', () => {
    // Paul's week runs on four afternoons, so nothing is folded and the tray
    // between his morning and his afternoon keeps its row.
    const { container } = renderModule({ memberIds: ['paul'] });
    const lunch = cells(container, '[data-day="mon"] [data-kind="lunch"]');
    expect(lunch).toHaveLength(1);
    expect(lunch[0].dataset.periods).toBe('7');
  });
});

describe('how much each Detail setting shows', () => {
  /** Monday's first lesson, which is a quiet day on every card here. */
  const mondayFirst = (container: HTMLElement) =>
    text(cells(container, '[data-day="mon"] [data-kind="lesson"]')[0]);

  it('Less keeps short codes and no going-home line', () => {
    const { container } = renderModule({ detail: 'less' });
    expect(mondayFirst(container)).toBe('Ma');
    expect(container.querySelector('[data-testid="timetable-tail"]')).toBeNull();
    expect(container.querySelector('[data-testid="timetable-footer"]')).toBeNull();
  });

  it('Some spells the subjects out and says when the day ends', () => {
    const { container } = renderModule({ detail: 'some' });
    expect(mondayFirst(container)).toBe('Mathe');
    // Five columns in 570px leave the lit one too narrow for the sentence, so
    // the going-home line keeps the time and lets the house icon say the rest.
    // The line is clipped to its column, so a sentence that did not fit would
    // lose the time rather than the words.
    expect(text(container.querySelector('[data-testid="timetable-tail"]'))).toBe('13:15');
    expect(container.querySelector('[data-testid="timetable-footer"]')).toBeNull();
  });

  it('spells the going-home line out in full once the card is wide enough for it', () => {
    box = moduleFor({ width: 1100, height: 880 });
    const { container } = renderModule({ detail: 'some' });
    expect(text(container.querySelector('[data-testid="timetable-tail"]'))).toBe('Ends at 13:15');
    box = moduleFor({ width: 570, height: 880 });
  });

  it('More adds rooms, end times, the week letter and a packing line', () => {
    const { container } = renderModule({ detail: 'more' });
    // "112" on its own is a number with no noun; the column here has the width
    // for the word, so the room is named.
    expect(mondayFirst(container)).toBe('MatheRoom 112');
    // The gutter carries both ends of the period, not just its start.
    const first = container.querySelector('[data-testid="timetable-gutter"][data-row-kind="period"]');
    expect(text(first)).toBe('107:5008:35');
    // Thursday's geography is music in the other week, so it carries the letter.
    const changed = cells(container, '[data-day="thu"] [data-kind="lesson"]').find(
      (el) => el.dataset.periods === '3,4',
    );
    expect(text(changed?.querySelector('[data-testid="timetable-week-badge"]'))).toBe('A');
    const footer = container.querySelector('[data-testid="timetable-footer"]');
    expect(text(footer)).toContain('Bring:');
    expect(text(footer)).toContain('Atlas');
    expect(text(container.querySelector('[data-testid="timetable-legend"]'))).toBe(
      'Th periods 3 to 4: week A Erdkunde, week B Musik',
    );
  });

  it('gives after-school care its own row at More, and a header clause below it', () => {
    const some = renderModule({ memberIds: ['mia'], detail: 'some' });
    expect(text(some.container.querySelector('[data-testid="timetable-meta"]'))).toBe(
      'Today 08:15 to 12:45 · OGS until 16:00',
    );
    expect(some.container.querySelector('[data-kind="care"]')).toBeNull();
    cleanup();
    const more = renderModule({ memberIds: ['mia'], detail: 'more' });
    expect(text(more.container.querySelector('[data-testid="timetable-meta"]'))).toBe(
      'Today 08:15 to 12:45',
    );
    // The band's own label in the gutter names the care, so the cell beside
    // it only has to say until when: the name is the first thing the clause
    // gives up, and on three cards across it does not fit beside the time.
    expect(text(more.container.querySelector('[data-day="thu"] [data-kind="care"]'))).toBe(
      'until 16:00',
    );
  });

  it('marks the course only where it differs from the one somebody is mostly in', () => {
    const { container } = renderModule({ memberIds: ['paul'], detail: 'less' });
    const monday = cells(container, '[data-day="mon"] [data-kind="lesson"]');
    expect(text(monday[0])).toBe('DeuLK');
    expect(text(monday[1])).toBe('Ma');
  });
});

describe('a card with no room to spare', () => {
  beforeEach(() => {
    // Five cards across a television: a 358px card inside its padding.
    box = moduleFor({ width: 326, height: 880 });
  });

  it('drops the wide day and shows codes like every other column', () => {
    const { container } = renderModule();
    const today = cells(container, '[data-day="thu"] [data-kind="lesson"]').find(
      (el) => el.dataset.periods === '3,4',
    );
    expect(text(today)).toBe('Ek');
    expect(text(container.querySelector('[data-day="thu"][data-testid="timetable-day"]'))).not.toContain(
      'Today',
    );
  });

  it('shortens the header to the times, and steps long codes down', () => {
    const { container } = renderModule({ memberIds: ['paul'] });
    expect(text(container.querySelector('[data-testid="timetable-meta"]'))).toBe('07:50–16:35');
    const monday = cells(container, '[data-day="mon"] [data-kind="lesson"]');
    // No room for the course badge, and a four-letter code comes down as many
    // of its sizes as it takes to keep every letter.
    expect(text(monday[0])).toBe('Deu');
    const long = monday.find((el) => text(el) === 'Sowi');
    const size = (long?.firstElementChild as HTMLElement).style.fontSize;
    expect(parseFloat(size)).toBeLessThan(1);
    expect(parseFloat(size)).toBeGreaterThanOrEqual(0.62);
  });
});

describe('the clock the cards read', () => {
  it('turns the page once the last lesson of the week is over', () => {
    // Friday afternoon, an hour after the last bell.
    vi.setSystemTime(new Date('2026-09-11T12:30:00Z'));
    const { container } = renderModule();
    const leon = card(container, 'leon');
    expect(leon?.dataset.focusDay).toBe('mon');
    expect(leon?.dataset.week).toBe('B');
    // The card says which week it is on its own badge, and its day line names
    // the weekday rather than saying "Today", which is how it reads as a page
    // that has already turned.
    expect(text(leon?.querySelector('[data-testid="timetable-week-label"]'))).toBe('B');
    expect(text(leon?.querySelector('[data-testid="timetable-meta"]'))).toContain('Monday');
  });

  it('stays on Friday while the household still has lessons that day', () => {
    vi.setSystemTime(new Date('2026-09-11T05:00:00Z'));
    expect(card(renderModule().container, 'leon')?.dataset.focusDay).toBe('fri');
  });

  it('reads the display clock, not the one the machine happens to be on', () => {
    // Half past midnight on Friday in Berlin; still Thursday evening where the
    // tests run, which is the difference a Pi kept on UTC lives with.
    vi.setSystemTime(new Date('2026-09-10T23:30:00Z'));
    expect(card(renderModule().container, 'leon')?.dataset.focusDay).toBe('fri');
  });
});

/** One region's answer, as the route serves it. */
function answer(region: string, over: { schoolHolidays?: unknown[]; publicHolidays?: unknown[] } = {}) {
  return {
    region,
    year: 2026,
    ok: true,
    fetchedAt: '2026-09-01T00:00:00.000Z',
    schoolHolidays: [],
    publicHolidays: [],
    ...over,
  };
}

const AUTUMN_BREAK = {
  id: 'h1',
  startDate: '2026-10-17',
  endDate: '2026-10-31',
  halfDay: false,
  names: [
    { language: 'DE', text: 'Herbstferien' },
    { language: 'EN', text: 'Autumn break' },
  ],
};

describe('school holidays', () => {
  it('says what is on and when everybody is back', () => {
    // Monday 26 October 2026, in the middle of the autumn break.
    vi.setSystemTime(new Date('2026-10-26T08:00:00Z'));
    holidays = {
      'DE-NW': answer('DE-NW', {
        schoolHolidays: [AUTUMN_BREAK],
        publicHolidays: [{ id: 'p1', date: '2026-11-01', names: [{ language: 'EN', text: 'All Saints' }] }],
      }),
    };
    inRegions({ gar: 'DE-NW' });
    const { container } = renderModule();
    // On a line of its own on each card, under the name. It used to be one
    // shared band above the cards, which cost the module height that no other
    // module on the wall takes. The days-left count that sat beside it went
    // with the band; it was a flourish from the top strip this module
    // deliberately does not draw.
    const line = container.querySelector('[data-testid="timetable-holiday"]');
    // en-US puts the month first. The pattern is read off the locale rather than
    // composed day-first for every language, which is what used to render
    // "Monday, 2 November" on an English wall.
    expect(text(line)).toBe('Autumn break, back to school on Monday, November 2');
    expect(card(container, 'leon')?.contains(line)).toBe(true);
    // The card has already moved on to the week school starts again.
    expect(card(container, 'leon')?.dataset.focusDay).toBe('mon');
  });

  it('closes each card on its own school\'s holidays, not on one region for the wall', () => {
    // Two children at schools in two states, which is the case a single
    // region on the module could never get right for both of them. North
    // Rhine-Westphalia is on holiday this week and Bavaria is not.
    vi.setSystemTime(new Date('2026-10-26T08:00:00Z'));
    // Two cards each as wide as the single card above, so the holiday line has
    // the room to say the whole sentence rather than shedding words down to
    // "back Nov 2".
    box = moduleFor({ width: 570, height: 880 }, 2);
    holidays = {
      'DE-NW': answer('DE-NW', { schoolHolidays: [AUTUMN_BREAK] }),
      'DE-BY': answer('DE-BY'),
    };
    inRegions({ gar: 'DE-NW', ggs: 'DE-BY' });
    const { container } = renderModule({ memberIds: ['leon', 'mia'] });

    const leon = card(container, 'leon');
    const mia = card(container, 'mia');
    expect(text(leon?.querySelector('[data-testid="timetable-holiday"]')))
      .toBe('Autumn break, back to school on Monday, November 2');
    expect(mia?.querySelector('[data-testid="timetable-holiday"]')).toBeNull();
    // Leon's card has turned the page to the week school starts again, so the
    // two cards are not even on the same week: his days are 2 to 6 November
    // and hers are the 26th to the 30th of October she is actually having.
    const firstDay = (el: HTMLElement | null) =>
      text(el?.querySelector('[data-testid="timetable-day"]'));
    expect(firstDay(leon)).toBe('MoNov 2');
    expect(firstDay(mia)).toBe('TodayMo26');
  });

  it('leaves a school with no region of its own out of the holidays entirely', () => {
    vi.setSystemTime(new Date('2026-10-26T08:00:00Z'));
    holidays = { 'DE-NW': answer('DE-NW', { schoolHolidays: [AUTUMN_BREAK] }) };
    inRegions({ gar: 'DE-NW' });
    const { container } = renderModule({ memberIds: ['leon', 'mia'] });

    expect(card(container, 'leon')?.querySelector('[data-testid="timetable-holiday"]')).not.toBeNull();
    expect(card(container, 'mia')?.querySelector('[data-testid="timetable-holiday"]')).toBeNull();
  });
});

describe('the language the wall is in', () => {
  // formatDateSync draws on whatever date-fns locale is already in hand, so
  // the wall is only German once the German one has been loaded, the same way
  // the provider warms it at startup.
  beforeAll(async () => {
  });

  const inGerman = (over: Partial<TimetableConfig> = {}) => renderModule(over, {}, GermanWrapper);

  /**
   * The day headers, as textContent reads them. The weekday and the date are
   * separate spans with a gap drawn between them, so nothing here separates
   * "Mo" from "7.".
   */
  const heads = (root: HTMLElement) =>
    cells(root, '[data-testid="timetable-day"]').map((el) => text(el));

  it('writes the day of the month with the point German puts after it', () => {
    // Three cards at Some: the lit column has the width for the date and not
    // for the word beside it, which is the first thing the header sheds. The
    // day line at the top of the card still says "Heute".
    const { container } = inGerman({ detail: 'some' });
    expect(heads(container)).toEqual(['Mo7.', 'Di8.', 'Mi9.', 'Do10.', 'Fr11.']);
    expect(text(container.querySelector('[data-testid="timetable-meta"]'))).toContain('Heute');
  });

  it('leaves the day a bare number in English', () => {
    // Like the German wall above, the lit column at Some holds the date and
    // not the word beside it: the header is budgeted for the widest face the
    // Font control offers, which charges "Today Th 10" 141px of a 135px column.
    const { container } = renderModule({ detail: 'some' });
    expect(heads(container)).toEqual(['Mo7', 'Tu8', 'We9', 'Th10', 'Fr11']);
  });

  it('keeps the word beside the date where the lit column is wide enough', () => {
    box = moduleFor({ width: 1822, height: 848 });
    const { container } = inGerman({ detail: 'some' });
    expect(heads(container)[3]).toBe('HeuteDo10.');
  });

  it('carries the point into the holiday line too', () => {
    // Monday 26 October 2026, in the middle of the autumn break.
    vi.setSystemTime(new Date('2026-10-26T08:00:00Z'));
    holidays = {
      'DE-NW': answer('DE-NW', {
        schoolHolidays: [{ ...AUTUMN_BREAK, names: [{ language: 'DE', text: 'Herbstferien' }] }],
      }),
    };
    inRegions({ gar: 'DE-NW' });
    const { container } = inGerman();
    expect(text(container.querySelector('[data-testid="timetable-holiday"]'))).toContain(
      'Herbstferien, wieder Schule am Montag, 2. November',
    );
  });

  it('breaks a long compound at its seam rather than wherever the line fills', () => {
    // A card wide enough for the longer half of the compound. Below that the
    // seam is the wrong answer: `hyphens: manual` forbids every dictionary
    // break, so a half that does not fit is re-broken anywhere at all and
    // with no hyphen, which reads worse than what the browser would have done
    // on its own.
    box = moduleFor({ width: 1822, height: 848 });
    const { container } = inGerman({ memberIds: ['mia'], detail: 'some' });
    const cell = cells(container, '[data-kind="lesson"]').find((el) =>
      text(el).startsWith('Sach'),
    );
    const label = cell?.querySelector<HTMLElement>('div[style*="hyphens"]');
    // The mark is invisible and prints a hyphen only at the break the browser
    // takes, so the name still reads as it was typed. "unterricht" carries a
    // seam of its own, being wider than a single period on the Day view.
    expect(text(label)).toBe('Sach\u00ADunter\u00ADricht');
    expect(label?.style.hyphens).toBe('manual');
  });

  it('leaves a compound to the browser once its own halves stop fitting', () => {
    // A Dutch household, because the Dutch list has a compound whose first
    // half is twelve letters: "Maatschappij" is wider than a quiet column on
    // its own, so the seam would cost the name a hyphen rather than buy it
    // one, and the browser keeps its dictionary.
    timetables = {
      data: {
        schools: [GAR, GGS],
        subjects: SUBJECTS.map((subject) => (subject.id === 'su' ? { ...subject, name: 'Maatschappijleer' } : subject)),
        timetables: [LEON, MIA, PAUL],
      },
      revision: 'r-nl',
    };
    const { container } = renderModule({ memberIds: ['mia'], detail: 'some' }, {}, DutchWrapper);
    const cell = cells(container, '[data-kind="lesson"]').find((el) =>
      text(el).startsWith('Maat'),
    );
    const label = cell?.querySelector<HTMLElement>('div[style*="hyphens"]');
    expect(text(label)).toBe('Maatschappijleer');
    expect(label?.style.hyphens).toBe('auto');
  });

  it('leaves a name it has no seams for to the browser', () => {
    // What a household types for itself, and every name in a language with no
    // list of its own.
    const { container } = renderModule({ memberIds: ['mia'], detail: 'some' });
    const cell = cells(container, '[data-kind="lesson"]').find((el) =>
      text(el).startsWith('Sach'),
    );
    const label = cell?.querySelector<HTMLElement>('div[style*="hyphens"]');
    expect(text(label)).toBe('Sachunterricht');
    expect(label?.style.hyphens).toBe('auto');
  });
});

// ---------------------------------------------------------------------------
// The Day view: everyone's next school day on one clock
// ---------------------------------------------------------------------------

describe('TimetableModule day view', () => {
  const rowsOf = (root: HTMLElement) =>
    cells(root, '[data-testid="timetable-day-row"]').map((el) => el.dataset.member);

  beforeEach(() => {
    // The television every H frame was drawn on.
    box = { width: 1856, height: 912 };
  });

  it('draws one row per person in roster order, on one clock, with the packing card under them', () => {
    const { container } = renderModule({ memberIds: ['paul', 'leon', 'mia'], view: 'day', layout: 'stacked', detail: 'some' });
    const day = container.querySelector<HTMLElement>('[data-testid="timetable-day-view"]');
    expect(day?.dataset.orientation).toBe('rows');
    // Thursday at 07:10 is before the switch time, so the card shows today.
    expect(day?.dataset.date).toBe('2026-09-10');
    expect(day?.dataset.labelKind).toBe('today');
    expect(rowsOf(container)).toEqual(['leon', 'mia', 'paul']);
    expect(cells(container, '[data-testid="timetable-card"]')).toHaveLength(0);
    // Every card is a real module card with the one Style section's glass.
    for (const el of cells(container, '[data-testid="timetable-day-row"]')) {
      expect(el.parentElement?.style.padding).toBe(`${DEFAULT_MODULE_STYLE.padding}px`);
    }
    expect(text(container.querySelector('[data-testid="timetable-day-pill"]'))).toBe('Today');
    expect(container.querySelector('[data-testid="timetable-pack-strip"]')).not.toBeNull();
  });

  it('says when each person starts and is done, and what goes in the bag', () => {
    const { container } = renderModule({ memberIds: ['leon', 'mia'], view: 'day', layout: 'stacked', detail: 'some' });
    const leon = container.querySelector<HTMLElement>('[data-testid="timetable-day-row"][data-member="leon"]')!;
    // Leon's first period is free: a free block on the clock, and the day starts at 08:40.
    expect(text(leon.querySelector('[data-testid="timetable-day-start"]'))).toContain('08:40');
    expect(leon.querySelector('[data-testid="timetable-day-block"][data-kind="free"]')).not.toBeNull();
    expect(text(leon.querySelector('[data-testid="timetable-day-end"]'))).toContain('13:15');
    const mia = container.querySelector<HTMLElement>('[data-testid="timetable-day-row"][data-member="mia"]')!;
    expect(text(mia.querySelector('[data-testid="timetable-day-end"]'))).toContain('OGS until 16:00');
    expect(mia.querySelector('[data-testid="timetable-day-block"][data-kind="care"]')).not.toBeNull();
    // Erdkunde brings the atlas, Sport the kit; nothing is listed twice.
    const packs = cells(container, '[data-testid="timetable-pack"]');
    expect(packs.map((el) => el.dataset.member)).toEqual(['leon', 'mia']);
    expect(cells(packs[0], '[data-testid="timetable-bring"]').map(text)).toEqual(['Atlas']);
    expect(cells(packs[1], '[data-testid="timetable-bring"]').map(text)).toEqual(['Sportzeug']);
  });

  it('gives a row whose school is shut its reason, and no bag', () => {
    timetables = {
      data: {
        schools: [{ ...GAR, specialDays: [{ date: '2026-09-10', label: 'Pädagogischer Tag', kind: 'off' }] }, GGS],
        subjects: SUBJECTS,
        timetables: [LEON, MIA, PAUL],
      },
      revision: 'r2',
    };
    const { container } = renderModule({ memberIds: ['leon', 'mia'], view: 'day', layout: 'stacked' });
    // Mia has school, so the card stays on Thursday and Leon's row says why it is empty.
    expect(container.querySelector<HTMLElement>('[data-testid="timetable-day-view"]')?.dataset.date).toBe('2026-09-10');
    const leon = container.querySelector<HTMLElement>('[data-testid="timetable-day-row"][data-member="leon"]')!;
    expect(leon.dataset.closed).toBe('true');
    expect(text(leon.querySelector('[data-testid="timetable-day-closed"]'))).toContain('Pädagogischer Tag');
    expect(leon.querySelectorAll('[data-testid="timetable-day-block"]')).toHaveLength(0);
    const pack = container.querySelector<HTMLElement>('[data-testid="timetable-pack"][data-member="leon"]')!;
    expect(pack.querySelectorAll('[data-testid="timetable-bring"]')).toHaveLength(0);
    expect(text(pack.querySelector('[data-testid="timetable-pack-none"]'))).toBe('No school');
  });

  it('shows tomorrow from the switch time, and names the day at the weekend', () => {
    vi.setSystemTime(new Date('2026-09-10T14:10:00Z')); // 16:10 in Berlin
    const { container, unmount } = renderModule({ memberIds: ['leon'], view: 'day', layout: 'stacked' });
    const day = container.querySelector<HTMLElement>('[data-testid="timetable-day-view"]');
    expect(day?.dataset.date).toBe('2026-09-11');
    expect(text(container.querySelector('[data-testid="timetable-day-pill"]'))).toBe('Tomorrow');
    unmount();

    vi.setSystemTime(new Date('2026-09-12T08:00:00Z')); // Saturday
    const weekend = renderModule({ memberIds: ['leon'], view: 'day', layout: 'stacked' });
    expect(weekend.container.querySelector<HTMLElement>('[data-testid="timetable-day-view"]')?.dataset.date).toBe('2026-09-14');
    expect(text(weekend.container.querySelector('[data-testid="timetable-day-pill"]'))).toBe('Monday');
  });

  it('draws columns with the bag in each head when the layout is side by side', () => {
    box = { width: 1016, height: 1752 };
    const { container } = renderModule({ memberIds: ['leon', 'mia'], view: 'day', layout: 'side-by-side' });
    const day = container.querySelector<HTMLElement>('[data-testid="timetable-day-view"]');
    expect(day?.dataset.orientation).toBe('columns');
    expect(container.querySelector('[data-testid="timetable-pack-strip"]')).toBeNull();
    expect(container.querySelector('[data-testid="timetable-day-ruler"]')).not.toBeNull();
    const mia = container.querySelector<HTMLElement>('[data-testid="timetable-day-row"][data-member="mia"]')!;
    expect(cells(mia, '[data-testid="timetable-bring"]').map(text)).toEqual(['Sportzeug']);
  });

  it('reads as German on a German wall', () => {
    const { container } = renderModule({ memberIds: ['leon', 'mia'], view: 'day', layout: 'stacked' }, {}, GermanWrapper);
    expect(text(container.querySelector('[data-testid="timetable-day-pill"]'))).toBe('Heute');
    expect(text(container.querySelector('[data-testid="timetable-day-start"]'))).toContain('los um');
    expect(text(container.querySelector('[data-testid="timetable-day-end"]'))).toContain('Schluss');
    expect(text(container.querySelector('[data-testid="timetable-pack-strip"]'))).toContain('Heute mitnehmen');
  });

  it('draws a line at the current time across every row while the card shows today', () => {
    vi.setSystemTime(new Date('2026-09-10T07:52:00Z')); // Thursday 09:52 in Berlin
    const { container } = renderModule({ memberIds: ['leon', 'mia'], view: 'day', layout: 'stacked' });
    const lines = cells(container, '[data-testid="timetable-now-line"]');
    expect(lines.map((el) => el.closest<HTMLElement>('[data-member]')?.dataset.member)).toEqual(['leon', 'mia']);
    expect(lines[0].getAttribute('aria-label')).toBe('Current time: 09:52');
    // 09:52 on a clock from 07:30 to 16:30 sits at 26.3% of the lane, on every lane alike.
    expect(lines.map((el) => el.style.left)).toEqual(['26.296%', '26.296%']);
    // The time on the ruler, at the same spot.
    const pill = container.querySelector<HTMLElement>('[data-testid="timetable-day-ruler"] [data-testid="timetable-now-pill"]')!;
    expect(text(pill)).toBe('09:52');
    expect(pill.style.left).toBe('26.296%');
    // The 10:00 label would sit under the pill, so it steps aside; 09:00 and 11:00 stay.
    const ruler = text(container.querySelector('[data-testid="timetable-day-ruler"]'));
    expect(ruler).toContain('09:00');
    expect(ruler).not.toContain('10:00');
    expect(ruler).toContain('11:00');
  });

  it('runs the line across the columns, and reads the display clock', () => {
    vi.setSystemTime(new Date('2026-09-10T07:52:00Z'));
    box = { width: 1016, height: 1752 };
    const { container } = renderModule({ memberIds: ['leon', 'mia'], view: 'day', layout: 'side-by-side' }, {}, Wrapper, '12h');
    const lines = cells(container, '[data-testid="timetable-now-line"]');
    expect(lines).toHaveLength(2);
    expect(lines[0].style.top).toBe('26.296%');
    expect(lines[0].style.borderTop).toContain('2px solid');
    expect(lines[0].getAttribute('aria-label')).toBe('Current time: 9:52 AM');
    expect(text(container.querySelector('[data-testid="timetable-now-pill"]'))).toBe('9:52 AM');
  });

  it('leaves the line off before school, on tomorrow, and when the setting is off', () => {
    // 07:10 in Berlin: the card shows today, but the clock has not reached the axis.
    const early = renderModule({ memberIds: ['leon'], view: 'day', layout: 'stacked' });
    expect(early.container.querySelector('[data-testid="timetable-now-line"]')).toBeNull();
    expect(early.container.querySelector('[data-testid="timetable-now-pill"]')).toBeNull();
    early.unmount();

    // 16:10: the card has moved on to Friday, where there is no now to point at.
    vi.setSystemTime(new Date('2026-09-10T14:10:00Z'));
    const tomorrow = renderModule({ memberIds: ['leon'], view: 'day', layout: 'stacked' });
    expect(text(tomorrow.container.querySelector('[data-testid="timetable-day-pill"]'))).toBe('Tomorrow');
    expect(tomorrow.container.querySelector('[data-testid="timetable-now-line"]')).toBeNull();
    tomorrow.unmount();

    vi.setSystemTime(new Date('2026-09-10T07:52:00Z'));
    const off = renderModule({ memberIds: ['leon'], view: 'day', layout: 'stacked', showNowLine: false });
    expect(off.container.querySelector('[data-testid="timetable-now-line"]')).toBeNull();
    expect(off.container.querySelector('[data-testid="timetable-now-pill"]')).toBeNull();
  });

  it('goes back to week cards when the view is week', () => {
    const { container } = renderModule({ memberIds: ['leon'], view: 'week' });
    expect(container.querySelector('[data-testid="timetable-day-view"]')).toBeNull();
    expect(cells(container, '[data-testid="timetable-card"]').map((el) => el.dataset.member)).toEqual(['leon']);
  });

  it('keeps the empty states: nobody picked, and weeks with nothing in them', () => {
    timetables = {
      data: { schools: [GAR], subjects: SUBJECTS, timetables: [{ ...LEON, weeks: { A: {} } }] },
      revision: 'r3',
    };
    const { container } = renderModule({ memberIds: ['leon'], view: 'day', layout: 'stacked' });
    expect(container.querySelector('[data-testid="timetable-day-view"]')).toBeNull();
    expect(container.textContent).toContain('No lessons yet');
  });
});

// ---------------------------------------------------------------------------
// Dates to remember, on both views
// ---------------------------------------------------------------------------

describe('TimetableModule dates to remember', () => {
  const NOTED_LEON: Timetable = {
    ...LEON,
    notes: [
      { id: 'n1', date: '2026-09-11', kind: 'test', subjectId: 'ma', text: 'Mathe-Arbeit' },
      { id: 'n2', date: '2026-09-11', kind: 'cancelled', periods: [6] },
      { id: 'n3', date: '2026-09-11', kind: 'bring', text: 'Wanderschuhe' },
    ],
  };

  beforeEach(() => {
    timetables = { data: { schools: [GAR, GGS], subjects: SUBJECTS, timetables: [NOTED_LEON, MIA, PAUL] }, revision: 'r-notes' };
  });

  it('marks the day view: a pencil on the test, the lesson off faded, the pills on the packing card', () => {
    vi.setSystemTime(new Date('2026-09-10T17:10:00Z')); // Thursday 19:10 in Berlin: tomorrow is Friday
    box = { width: 1856, height: 912 };
    const { container } = renderModule({ memberIds: ['leon'], view: 'day', layout: 'stacked' });
    expect(container.querySelector<HTMLElement>('[data-testid="timetable-day-view"]')?.dataset.date).toBe('2026-09-11');
    const maths = container.querySelector<HTMLElement>('[data-testid="timetable-day-block"][data-test="true"]')!;
    expect(text(maths)).toContain('Mathe-Arbeit');
    expect(maths.querySelector('[data-testid="timetable-test-flag"]')).not.toBeNull();
    const off = container.querySelector<HTMLElement>('[data-testid="timetable-day-block"][data-off="cancelled"]')!;
    expect(text(off)).toContain('cancelled');
    expect(text(container.querySelector('[data-testid="timetable-day-end"]'))).toContain('12:25');
    expect(text(container.querySelector('[data-testid="timetable-day-end"]'))).toContain('usually 13:15');
    const pack = container.querySelector<HTMLElement>('[data-testid="timetable-pack"][data-member="leon"]')!;
    expect(cells(pack, '[data-testid="timetable-bring"]').map(text)).toEqual(['Sportzeug', 'Wanderschuhe']);
    expect(cells(pack, '[data-testid="timetable-pack-test"]').map(text)).toEqual(['Mathe-Arbeit']);
  });

  it('marks the week view on the day, and says what tomorrow brings the evening before', () => {
    vi.setSystemTime(new Date('2026-09-11T05:10:00Z')); // Friday morning
    const { container, unmount } = renderModule({ memberIds: ['leon'], detail: 'some' });
    expect(container.querySelector('[data-testid="timetable-cell"][data-test="true"]')).not.toBeNull();
    expect(text(container.querySelector('[data-testid="timetable-cell"][data-cancelled="true"]'))).toContain('cancelled');
    expect(cells(container, '[data-testid="timetable-note-bring"]').map(text)).toEqual(['Wanderschuhe']);
    expect(text(container.querySelector('[data-testid="timetable-meta"]'))).toContain('12:25');
    unmount();

    vi.setSystemTime(new Date('2026-09-10T17:10:00Z')); // Thursday evening, at More
    const more = renderModule({ memberIds: ['leon'], detail: 'more' });
    expect(cells(more.container, '[data-testid="timetable-note-test"]').map(text)).toEqual(['Tomorrow: Mathe-Arbeit']);
    expect(cells(more.container, '[data-testid="timetable-note-off"]').map(text)).toEqual(['Tomorrow: period 6 off']);
  });
});
