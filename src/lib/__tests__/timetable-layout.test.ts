import { describe, it, expect } from 'vitest';
import { DEFAULT_MODULE_STYLE, type TimetableDetail } from '@/types/config';
import type {
  DayKey,
  Timetable,
  TimetableCell,
  TimetableSchool,
  TimetableSubject,
} from '@/types/timetables';
import {
  bringFor,
  buildRows,
  cardBaseFontSize,
  cardMetrics,
  cardModel,
  dayBlocks,
  daySpan,
  hasNotes,
  isoWeekNumber,
  notesOn,
  resolveFocus,
  resolveCardFontSize,
  resolveHeading,
  rowFacts,
  cardBoxIn,
  shedFor,
  shedPreset,
  TIMETABLE_PRESETS,
  weekDifferences,
  weekLetter,
  longestSubjectLabel,
  type CardMetricsInput,
  type FocusContext,
  type CareCardCell,
  type FocusResolution,
  type FoldedCardCell,
  type FreeCardCell,
  type LessonCardCell,
  type LunchCardCell,
  type TimetableCardModel,
  type TimetableHoliday,
  type TimetableWords,
} from '../timetable-layout';

// ---------------------------------------------------------------------------
// The sample household: two schools, six people, the week the mockups drew.
// ---------------------------------------------------------------------------

const ZONE = 'Europe/Berlin';

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
  { id: 'lat', code: 'Lat', name: 'Latein', color: '#b08968', icon: 'scroll' },
  { id: 'bio', code: 'Bio', name: 'Biologie', color: '#43c07e', icon: 'leaf' },
  { id: 'ch', code: 'Ch', name: 'Chemie', color: '#26b5a8', icon: 'flask' },
  { id: 'ph', code: 'Ph', name: 'Physik', color: '#3ab7f0', icon: 'atom' },
  { id: 'ek', code: 'Ek', name: 'Erdkunde', color: '#b5c23a', icon: 'globe', bring: 'Atlas' },
  { id: 'ge', code: 'Ge', name: 'Geschichte', color: '#e0a86e', icon: 'castle' },
  { id: 'wipo', code: 'WiPo', name: 'Wirtschaft-Politik', color: '#7c8cf8', icon: 'people' },
  { id: 'sowi', code: 'Sowi', name: 'Sozialwissenschaften', color: '#7c8cf8', icon: 'people' },
  { id: 'paed', code: 'Päd', name: 'Pädagogik', color: '#b59cf0', icon: 'people' },
  { id: 'rel', code: 'Rel', name: 'Religion', color: '#c084fc', icon: 'star' },
  { id: 'ku', code: 'Ku', name: 'Kunst', color: '#ee6fd8', icon: 'palette', bring: 'Malsachen' },
  { id: 'mu', code: 'Mu', name: 'Musik', color: '#fb6f92', icon: 'music' },
  { id: 'sp', code: 'Sp', name: 'Sport', color: '#8fdc4e', icon: 'ball', bring: 'Sportzeug' },
  { id: 'if', code: 'If', name: 'Informatik', color: '#8ea3c0', icon: 'chip' },
  { id: 'su', code: 'SU', name: 'Sachunterricht', color: '#2fc48d', icon: 'magnifier' },
  { id: 'foe', code: 'Fö', name: 'Förderunterricht', color: '#a1a1aa', icon: 'heart' },
  { id: 'kr', code: 'KR', name: 'Klassenrat', color: '#cbd5e1', icon: 'chat' },
  { id: 'geige', code: 'Geige', name: 'Geige (JeKits)', color: '#fb6f92', icon: 'music', bring: 'Geige' },
];

/** One lesson cell: subject, and the room or course group when it has one. */
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

const EMMA: Timetable = {
  memberId: 'emma',
  schoolId: 'gar',
  className: '10a',
  weeks: {
    A: {
      mon: { 1: l('deu', '208'), 2: l('deu', '208'), 3: l('ma', '208'), 4: l('ma', '208'), 5: l('lat', '208'), 6: l('ph', 'Ph 2'), 7: LUNCH, 8: l('sp', 'Halle'), 9: l('sp', 'Halle') },
      tue: { 1: l('eng', '208'), 2: l('eng', '208'), 3: l('bio', 'Bio 1'), 4: l('ge', '208'), 5: l('wipo', '208') },
      wed: { 1: l('if', 'IT 1'), 2: l('if', 'IT 1'), 3: l('deu', '208'), 4: l('lat', '208'), 5: l('ek', '204'), 6: l('wipo', '208'), 7: LUNCH, 8: l('ku', 'Ku 2'), 9: l('ku', 'Ku 2') },
      thu: { 1: l('ma', '208'), 2: l('eng', '208'), 3: l('lat', '208'), 4: l('if', 'IT 1'), 5: l('rel', '208'), 6: l('rel', '208') },
      fri: { 1: l('ph', 'Ph 2'), 2: l('bio', 'Bio 1'), 3: l('ch', 'Ch 1'), 4: l('ch', 'Ch 1'), 5: l('deu', '208'), 6: l('ge', '208') },
    },
    B: {
      mon: { 1: l('deu', '208'), 2: l('deu', '208'), 3: l('ma', '208'), 4: l('ma', '208'), 5: l('lat', '208'), 6: l('ph', 'Ph 2'), 7: LUNCH, 8: l('sp', 'Halle'), 9: l('sp', 'Halle') },
      tue: { 1: l('eng', '208'), 2: l('eng', '208'), 3: l('bio', 'Bio 1'), 4: l('ge', '208'), 5: l('wipo', '208') },
      wed: { 1: l('if', 'IT 1'), 2: l('if', 'IT 1'), 3: l('deu', '208'), 4: l('lat', '208'), 5: l('ek', '204'), 6: l('wipo', '208'), 7: LUNCH, 8: l('ku', 'Ku 2'), 9: l('ku', 'Ku 2') },
      thu: { 1: l('ma', '208'), 2: l('eng', '208'), 3: l('lat', '208'), 4: l('if', 'IT 1'), 5: l('rel', '208'), 6: l('rel', '208') },
      fri: { 1: l('ph', 'Ph 2'), 2: l('bio', 'Bio 1'), 3: l('mu', 'Mu 1'), 4: l('mu', 'Mu 1'), 5: l('deu', '208'), 6: l('ge', '208') },
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

const JONAS: Timetable = {
  memberId: 'jonas',
  schoolId: 'ggs',
  className: '2a',
  icons: true,
  weeks: {
    A: {
      mon: { 1: l('deu'), 2: l('deu'), 3: l('ma'), 4: l('su'), 5: l('sp', 'Halle') },
      tue: { 1: l('ma'), 2: l('deu'), 3: l('ku', 'Ku 2'), 4: l('ku', 'Ku 2'), 5: l('rel') },
      wed: { 1: l('deu'), 2: l('ma'), 3: l('mu', 'Mu 1'), 4: l('sp', 'Halle') },
      thu: { 1: l('ma'), 2: l('deu'), 3: l('su'), 4: l('rel'), 5: l('foe') },
      fri: { 1: l('deu'), 2: l('ma'), 3: l('sp', 'Halle'), 4: l('mu', 'Mu 1') },
    },
  },
};

const MEMBERS = {
  leon: { id: 'leon', name: 'Leon', color: '#60a5fa' },
  emma: { id: 'emma', name: 'Emma', color: '#f472b6' },
  mia: { id: 'mia', name: 'Mia', color: '#fbbf24' },
  paul: { id: 'paul', name: 'Paul', color: '#4ade80' },
  jonas: { id: 'jonas', name: 'Jonas', color: '#fb923c' },
};

/** NRW autumn break 2026, the stretch behind the holiday frame. */
const HERBSTFERIEN: TimetableHoliday = { name: 'Herbstferien', start: '2026-10-17', end: '2026-10-31' };

/**
 * Card geometries, named for how many fit across the screen they were drawn on.
 *
 * They carry the frames' own clock, which is the German household's 24-hour
 * one. The gutter is built to the clock.
 */
const CLOCK = { timeFormat: '24h' } as const;
const THREE_UP = { cardWidth: 602, baseFontSize: 27, ...CLOCK };
const ONE_UP = { cardWidth: 1856, baseFontSize: 29, ...CLOCK };
const TWO_UP = { cardWidth: 916, baseFontSize: 27, ...CLOCK };
const FIVE_UP = { cardWidth: 358, baseFontSize: 22, padding: 14, ...CLOCK };
const PORTRAIT = { cardWidth: 1016, baseFontSize: 27, ...CLOCK };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const utc = (iso: string) => new Date(iso);

function context(timetable: Timetable, school: TimetableSchool, extra: Partial<FocusContext> = {}): FocusContext {
  return { school, timetable, subjects: SUBJECTS, ...extra };
}

function withSpecialDays(school: TimetableSchool, specialDays: TimetableSchool['specialDays']): TimetableSchool {
  return { ...school, specialDays };
}

/** The audit moment every A frame but the last two was drawn at. */
function thursdayFocus(timetable: Timetable, school: TimetableSchool): FocusResolution {
  return resolveFocus(utc('2026-09-10T05:10:00Z'), ZONE, context(timetable, school));
}

function model(
  member: { id: string; name: string; color: string },
  timetable: Timetable,
  school: TimetableSchool,
  detail: TimetableDetail,
  geometry: Omit<CardMetricsInput, 'detail'> & { baseFontSize: number },
  focus = thursdayFocus(timetable, school),
  over: Partial<Parameters<typeof cardModel>[0]> = {},
): TimetableCardModel {
  return cardModel({
    member,
    timetable,
    school,
    subjects: SUBJECTS,
    detail,
    focus,
    // The card's own clock, the same on both sides: every one of these
    // geometries is the German household's 24-hour one.
    timeFormat: geometry.timeFormat,
    metrics: cardMetrics({ ...geometry, detail }),
    ...over,
  });
}

const column = (card: TimetableCardModel, day: DayKey) => card.days.find((d) => d.day === day)!;

function lessonAt(card: TimetableCardModel, day: DayKey, period: number): LessonCardCell | undefined {
  for (const placed of column(card, day).cells) {
    if (placed.cell.kind === 'lesson' && placed.cell.periods.includes(period)) return placed.cell;
  }
  return undefined;
}

/** The after-school care band's cell in one column, when the row has one. */
function careCell(card: TimetableCardModel, day: DayKey): CareCardCell | undefined {
  return column(card, day)
    .cells.map((p) => p.cell)
    .find((c): c is CareCardCell => c.kind === 'care');
}

function cellsOfKind<K extends 'free' | 'lunch' | 'folded'>(card: TimetableCardModel, day: DayKey, kind: K) {
  return column(card, day)
    .cells.map((p) => p.cell)
    .filter((c): c is Extract<FreeCardCell | LunchCardCell | FoldedCardCell, { kind: K }> => c.kind === kind);
}

/** A compact shape for row assertions: periods as numbers, bands as their label. */
const rowShape = (timetable: Timetable, school: TimetableSchool, detail: TimetableDetail = 'less') =>
  buildRows(timetable, school, detail).rows.map((r) => {
    if (r.kind === 'period') return r.n;
    if (r.kind === 'break') return `[${r.label}]`;
    if (r.kind === 'care') return `care:${r.label}`;
    return `fold:${r.periods.join(',')}@${r.start}`;
  });

/** Blocks as `kind:periods` so a whole day fits on one assertion line. */
const blockShape = (timetable: Timetable, school: TimetableSchool, day: DayKey, week: 'A' | 'B' = 'A') =>
  dayBlocks(timetable, school, SUBJECTS, day, week).map((b) =>
    b.kind === 'care' ? `care:${b.start}-${b.end}` : `${b.kind === 'lesson' ? b.subject.code : b.kind}:${b.periods.join(',')}`,
  );

// ---------------------------------------------------------------------------

describe('isoWeekNumber', () => {
  it('numbers the mockup weeks the way a German school does', () => {
    expect(isoWeekNumber('2026-09-10')).toBe(37);
    expect(isoWeekNumber('2026-09-14')).toBe(38);
    expect(isoWeekNumber('2026-11-02')).toBe(45);
  });

  it('gives 2026 a week 53 and starts 2027 over at 1', () => {
    expect(isoWeekNumber('2026-12-28')).toBe(53);
    expect(isoWeekNumber('2027-01-03')).toBe(53);
    expect(isoWeekNumber('2027-01-04')).toBe(1);
  });
});

describe('weekLetter', () => {
  it('reads the letter off the week number, odd weeks first', () => {
    expect(weekLetter(GAR, utc('2026-09-10T05:10:00Z'), ZONE)).toBe('A');
    expect(weekLetter(GAR, utc('2026-09-14T08:00:00Z'), ZONE)).toBe('B');
  });

  it('flips with the school that calls odd weeks B', () => {
    const flipped: TimetableSchool = { ...GAR, weekCycle: { mode: 'parity', oddWeek: 'B' } };
    expect(weekLetter(flipped, utc('2026-09-10T05:10:00Z'), ZONE)).toBe('B');
    expect(weekLetter(flipped, utc('2026-09-14T08:00:00Z'), ZONE)).toBe('A');
  });

  it('repeats the letter across a 53 week year, because parity is the whole rule', () => {
    // Week 53 of 2026 and week 1 of 2027 are both odd, so two A weeks run back
    // to back. A school that really alternates has to publish its own list.
    expect(weekLetter(GAR, utc('2026-12-28T08:00:00Z'), ZONE)).toBe('A');
    expect(weekLetter(GAR, utc('2027-01-04T08:00:00Z'), ZONE)).toBe('A');
    expect(weekLetter(GAR, utc('2026-12-21T08:00:00Z'), ZONE)).toBe('B');
  });

  it('always says A at a school with one week plan', () => {
    expect(weekLetter(GGS, utc('2026-09-10T05:10:00Z'), ZONE)).toBe('A');
    expect(weekLetter(GGS, utc('2026-09-14T08:00:00Z'), ZONE)).toBe('A');
  });

  it('reads the date on the display clock, not the host clock', () => {
    // 22:30 UTC on Sunday is already Monday in Berlin, and Monday is a new week.
    expect(weekLetter(GAR, utc('2026-09-13T22:30:00Z'), ZONE)).toBe('B');
    expect(weekLetter(GAR, utc('2026-09-13T22:30:00Z'), 'UTC')).toBe('A');
  });
});

describe('buildRows', () => {
  it('runs to the last period of either week and folds the quiet afternoon away', () => {
    expect(rowShape(LEON, GAR)).toEqual([1, 2, '[Pause]', 3, 4, '[Pause]', 5, 6, 'fold:7,8,9@13:20']);
    expect(buildRows(LEON, GAR, 'less').foldAfter).toBe(6);
  });

  it('folds the same way for two busy afternoons', () => {
    expect(rowShape(EMMA, GAR)).toEqual([1, 2, '[Pause]', 3, 4, '[Pause]', 5, 6, 'fold:7,8,9@13:20']);
    expect(buildRows(EMMA, GAR, 'less').foldAfter).toBe(6);
  });

  it('leaves a week with four busy afternoons unfolded, right down to period 10', () => {
    expect(buildRows(PAUL, GAR, 'less').foldAfter).toBeNull();
    expect(rowShape(PAUL, GAR)).toEqual([1, 2, '[Pause]', 3, 4, '[Pause]', 5, 6, 7, 8, 9, 10]);
  });

  it('does not fold a week that finishes before the afternoon starts', () => {
    expect(buildRows(JONAS, GGS, 'less').foldAfter).toBeNull();
    expect(rowShape(JONAS, GGS)).toEqual([1, 2, '[Hofpause]', 3, 4, '[Hofpause]', 5]);
  });

  it('merges two breaks in a row into one band, and only More names both', () => {
    expect(rowShape(MIA, GGS, 'less')).toEqual([1, 2, '[Hofpause]', 3, 4, '[Hofpause]', 5, 6, 'fold:7,8@13:30']);
    expect(rowShape(MIA, GGS, 'some')).toEqual([1, 2, '[Hofpause]', 3, 4, '[Hofpause]', 5, 6, 'fold:7,8@13:30']);
    expect(rowShape(MIA, GGS, 'more')).toEqual([
      1, 2, '[Hofpause · Frühstück]', 3, 4, '[Hofpause]', 5, 6, 'fold:7,8@13:30', 'care:OGS',
    ]);
  });

  it('gives care its own row only at More, and only where there is care', () => {
    expect(rowShape(LEON, GAR, 'more')).not.toContain('care:OGS');
    expect(rowShape(JONAS, GGS, 'more').at(-1)).toBe('care:OGS');
  });

  it('keeps the same rows in an A week and a B week so the card never reshapes', () => {
    // The lessons change on Thursday, the geometry must not.
    expect(rowShape(LEON, GAR, 'some')).toEqual(rowShape({ ...LEON, weeks: { A: LEON.weeks.B! } }, GAR, 'some'));
  });
});

describe('dayBlocks', () => {
  it('keeps the late start, merges the double, and drops nothing else', () => {
    expect(blockShape(LEON, GAR, 'thu')).toEqual(['free:1', 'Eng:2', 'Ek:3,4', 'Frz:5', 'Ph:6']);
    const ek = dayBlocks(LEON, GAR, SUBJECTS, 'thu', 'A')[2];
    expect(ek).toMatchObject({ kind: 'lesson', double: true, room: '204', start: '09:45', end: '11:20' });
  });

  it('swaps the double for the other week without touching the rest of the day', () => {
    expect(blockShape(LEON, GAR, 'thu', 'B')).toEqual(['free:1', 'Eng:2', 'Mu:3,4', 'Frz:5', 'Ph:6']);
    expect(dayBlocks(LEON, GAR, SUBJECTS, 'thu', 'B')[2]).toMatchObject({ room: 'Mu 1' });
  });

  it('never merges across a break', () => {
    // Englisch runs 3 and 4, Biologie 5 and 6, and the long break sits between.
    expect(blockShape(LEON, GAR, 'tue')).toEqual(['Frz:1,2', 'Eng:3,4', 'Bio:5,6', 'lunch:7', 'Ku:8,9']);
  });

  it('merges free periods with each other but never merges lunch', () => {
    expect(blockShape(PAUL, GAR, 'mon')).toEqual(['Deu:1,2', 'Ma:3,4', 'free:5,6', 'lunch:7', 'Sowi:8,9']);
    expect(blockShape(PAUL, GAR, 'tue')).toEqual(['free:1,2', 'Bio:3,4', 'Eng:5,6', 'lunch:7', 'Sp:8,9']);
  });

  it('keeps the gaps inside a day and drops everything after the last lesson', () => {
    expect(blockShape(PAUL, GAR, 'thu')).toEqual([
      'Bio:1,2', 'Ku:3,4', 'free:5', 'Ma:6', 'free:7', 'Rel:8,9', 'Sp:10',
    ]);
    // Friday's last lesson is period 9, so period 10 is not a block at all.
    expect(blockShape(PAUL, GAR, 'fri')).toEqual(['Deu:1,2', 'Eng:3', 'Bio:4', 'free:5', 'Ge:6', 'Sowi:7', 'Päd:8', 'Rel:9']);
  });

  it('adds the after-school care band from the end of the lessons', () => {
    expect(blockShape(MIA, GGS, 'thu')).toEqual(['Deu:1', 'Ma:2', 'Mu:3', 'Rel:4', 'Sp:5', 'care:12:45-16:00']);
    expect(blockShape(MIA, GGS, 'wed')).toEqual(['Deu:1', 'Ma:2', 'SU:3', 'Rel:4', 'Eng:5', 'free:6,7', 'Geige:8', 'care:15:00-16:00']);
    // Friday care stops earlier, and a school without care never gets a band.
    expect(blockShape(MIA, GGS, 'fri').at(-1)).toBe('care:12:45-15:00');
    expect(blockShape(LEON, GAR, 'mon').some((b) => b.startsWith('care'))).toBe(false);
  });

  it('carries the class room onto lessons that do not name one', () => {
    const housed: Timetable = { ...MIA, usualRoom: '12b' };
    const [deutsch, , musik] = dayBlocks(housed, GGS, SUBJECTS, 'thu', 'A');
    expect(deutsch).toMatchObject({ room: '12b' });
    expect(musik).toMatchObject({ room: 'Mu 1' });
  });
});

describe('daySpan', () => {
  it('reports the lessons only, ignoring care', () => {
    expect(daySpan(dayBlocks(LEON, GAR, SUBJECTS, 'thu', 'A'))).toEqual({ start: '08:40', end: '13:15', firstPeriod: 2 });
    expect(daySpan(dayBlocks(EMMA, GAR, SUBJECTS, 'thu', 'A'))).toEqual({ start: '07:50', end: '13:15', firstPeriod: 1 });
    expect(daySpan(dayBlocks(MIA, GGS, SUBJECTS, 'thu', 'A'))).toEqual({ start: '08:15', end: '12:45', firstPeriod: 1 });
  });

  it('is null on a day with no lessons', () => {
    const quiet: Timetable = { ...LEON, weeks: { A: { ...LEON.weeks.A, thu: {} } } };
    expect(daySpan(dayBlocks(quiet, GAR, SUBJECTS, 'thu', 'A'))).toBeNull();
  });
});

describe('resolveFocus', () => {
  it('lights today on a school morning', () => {
    const focus = thursdayFocus(LEON, GAR);
    expect(focus).toMatchObject({
      weekStart: '2026-09-07',
      weekNumber: 37,
      weekLetter: 'A',
      focusDay: 'thu',
      focusDate: '2026-09-10',
      focusLabelKind: 'today',
      currentWeek: true,
    });
    expect(focus.dayDates).toEqual({
      mon: '2026-09-07', tue: '2026-09-08', wed: '2026-09-09', thu: '2026-09-10', fri: '2026-09-11',
    });
    expect(focus.holiday).toBeUndefined();
  });

  it('uses the display clock, so late Wednesday in London is Thursday in Berlin', () => {
    const instant = utc('2026-09-09T22:30:00Z');
    expect(resolveFocus(instant, ZONE, context(LEON, GAR)).focusDay).toBe('thu');
    expect(resolveFocus(instant, 'UTC', context(LEON, GAR)).focusDay).toBe('wed');
  });

  it('stays on Friday until the last lesson of the week is over', () => {
    // Leon finishes at 13:15 on Friday.
    const before = resolveFocus(utc('2026-09-11T11:00:00Z'), ZONE, context(LEON, GAR));
    expect(before).toMatchObject({ focusDay: 'fri', focusDate: '2026-09-11', focusLabelKind: 'today' });
  });

  it('turns the page to Monday once the school week is over', () => {
    const after = resolveFocus(utc('2026-09-11T12:00:00Z'), ZONE, context(LEON, GAR));
    expect(after).toMatchObject({
      weekStart: '2026-09-14',
      weekNumber: 38,
      weekLetter: 'B',
      focusDay: 'mon',
      focusDate: '2026-09-14',
      focusLabelKind: 'weekday',
      currentWeek: false,
    });
  });

  it('keeps Friday on screen when the household turned that off', () => {
    const held = resolveFocus(utc('2026-09-11T12:00:00Z'), ZONE, context(LEON, GAR, { nextWeekFromFriday: false }));
    expect(held).toMatchObject({ focusDay: 'fri', focusLabelKind: 'today' });
  });

  it('shows next Monday all weekend, whatever the toggle says', () => {
    for (const instant of ['2026-09-12T08:00:00Z', '2026-09-13T20:00:00Z']) {
      expect(resolveFocus(utc(instant), ZONE, context(LEON, GAR, { nextWeekFromFriday: false }))).toMatchObject({
        weekStart: '2026-09-14',
        focusDay: 'mon',
        focusLabelKind: 'weekday',
        weekLetter: 'B',
      });
    }
  });

  it('turns the page early when the last school day of the week is a holiday', () => {
    // Friday off, so Thursday afternoon is already the end of the school week.
    const ctx = context(LEON, GAR, { publicHolidays: [{ date: '2026-09-11', name: 'Brückentag' }] });
    const after = resolveFocus(utc('2026-09-10T12:00:00Z'), ZONE, ctx);
    expect(after).toMatchObject({ weekStart: '2026-09-14', focusDay: 'mon', focusLabelKind: 'weekday' });
  });

  it('jumps the whole holiday and names the day school starts again', () => {
    const ctx = context(LEON, GAR, { schoolHolidays: [HERBSTFERIEN] });
    const focus = resolveFocus(utc('2026-10-26T08:00:00Z'), ZONE, ctx);
    expect(focus).toMatchObject({
      weekStart: '2026-11-02',
      weekNumber: 45,
      weekLetter: 'A',
      focusDay: 'mon',
      focusDate: '2026-11-02',
      focusLabelKind: 'date',
      currentWeek: false,
    });
    expect(focus.holiday).toEqual({ name: 'Herbstferien', backOn: '2026-11-02' });
  });

  it('jumps a holiday it only lands in after turning the page', () => {
    // The Saturday before the break: next week is holiday from end to end.
    const ctx = context(LEON, GAR, { schoolHolidays: [{ name: 'Herbstferien', start: '2026-09-14', end: '2026-09-20' }] });
    const focus = resolveFocus(utc('2026-09-12T08:00:00Z'), ZONE, ctx);
    expect(focus).toMatchObject({ focusDate: '2026-09-21', focusLabelKind: 'date' });
    expect(focus.holiday?.backOn).toBe('2026-09-21');
  });

  it('stays on a public holiday and marks the column shut', () => {
    // Ascension Day. Walking past, the useful answer is "no school today".
    const ctx = context(LEON, GAR, { publicHolidays: [{ date: '2027-05-06', name: 'Christi Himmelfahrt' }] });
    const focus = resolveFocus(utc('2027-05-06T07:00:00Z'), ZONE, ctx);
    expect(focus).toMatchObject({ focusDay: 'thu', focusDate: '2027-05-06', focusLabelKind: 'today' });
    expect(focus.closedDays).toEqual({ thu: 'Christi Himmelfahrt' });
  });

  it('marks a day the school closes for itself', () => {
    const school = withSpecialDays(GAR, [{ date: '2027-02-08', label: 'Rosenmontag', kind: 'off' }]);
    const focus = resolveFocus(utc('2027-02-08T08:00:00Z'), ZONE, context(LEON, school));
    expect(focus.closedDays).toEqual({ mon: 'Rosenmontag' });
  });

  it('marks a day that ends after a given period', () => {
    const school = withSpecialDays(GAR, [
      { date: '2027-02-04', label: 'Zeugnistag', kind: 'ends-after', period: 4 },
    ]);
    const focus = resolveFocus(utc('2027-02-04T08:00:00Z'), ZONE, context(LEON, school));
    expect(focus).toMatchObject({ focusDay: 'thu', weekStart: '2027-02-01' });
    expect(focus.shortDays).toEqual({ thu: { label: 'Zeugnistag', endsAfterPeriod: 4 } });
    expect(focus.closedDays).toEqual({});
  });
});

describe('cardMetrics', () => {
  it('gives the focus column its full share on a roomy card', () => {
    const m = cardMetrics({ ...THREE_UP, detail: 'less' });
    expect(m.focusRatio).toBeCloseTo(2.25, 2);
    expect(m.wideFocus).toBe(true);
    expect(m.narrow).toBe(false);
  });

  it('narrows the gap once the quiet columns carry names themselves', () => {
    expect(cardMetrics({ ...TWO_UP, detail: 'some' }).focusRatio).toBeCloseTo(1.55, 2);
    expect(cardMetrics({ ...PORTRAIT, detail: 'more' }).focusRatio).toBeCloseTo(1.45, 2);
    expect(cardMetrics({ ...ONE_UP, detail: 'more' }).wideFocus).toBe(true);
  });

  it('gives up the rich focus column on a five-across wall card', () => {
    const m = cardMetrics({ ...FIVE_UP, detail: 'less' });
    expect(m.wideFocus).toBe(false);
    expect(m.narrow).toBe(true);
    expect(m.focusRatio).toBeLessThan(1.4);
    expect(m.focusRatio).toBeGreaterThan(1);
    // Four legible quiet columns matter more than one handsome one.
    expect(m.quietColumnEm).toBeGreaterThanOrEqual(2.19);
  });

  it('hands the lit column back entirely on a five-across card with a 12-hour clock', () => {
    // "12:45 PM" takes half as much width again as "12:45", and five cards on
    // one television do not have it to give. The lit day keeps its wash and its
    // pill and gives up the extra width; the quiet columns come out under the
    // 2.2em the design says a code needs, which is the trade `GUTTER_MAX_SHARE`
    // states: the times keep their legibility floor until the gutter would take
    // more than a quarter of the card, and here it takes under a quarter.
    const twentyfour = cardMetrics({ ...FIVE_UP, detail: 'less' });
    const twelve = cardMetrics({ ...FIVE_UP, detail: 'less', timeFormat: '12h' });
    expect(twelve.focusRatio).toBe(1);
    expect(twelve.focusRatio).toBeLessThan(twentyfour.focusRatio);
    expect(twelve.quietColumnEm).toBeLessThan(twentyfour.quietColumnEm);
    // Under a quarter of the card, so the times are not the thing that gives.
    expect(twelve.gutterPx).toBeLessThan(FIVE_UP.cardWidth * 0.28);
    expect(twelve.gutterTimePx).toBe(16);
    expect(twelve.narrow).toBe(true);
  });

  it('never starves the quiet columns to feed the focus column', () => {
    const wide = cardMetrics({ ...THREE_UP, detail: 'less' });
    const tight = cardMetrics({ timeFormat: '12h', cardWidth: 420, baseFontSize: 22, detail: 'less' });
    expect(tight.focusRatio).toBeLessThan(wide.focusRatio);
    expect(tight.quietColumnEm).toBeGreaterThanOrEqual(2.19);
  });

  it('falls back to one even share when nothing else fits', () => {
    const m = cardMetrics({ timeFormat: '12h', cardWidth: 240, baseFontSize: 22, detail: 'more' });
    expect(m.focusRatio).toBe(1);
    expect(m.wideFocus).toBe(false);
    expect(m.narrow).toBe(true);
  });
});

/**
 * The nine signed-off frames, as the boxes a card is actually handed.
 *
 * Each row is one card of one frame: the box left after the wall's rectangle
 * has given up the module's header line, the gap between cards and the card
 * padding, measured off the rendered wall, and the size that frame was drawn
 * at. A card derives its own size from that box and from what the week puts in
 * it, so these are the nine geometries the derivation has to get right.
 */
interface FrameCard {
  label: string;
  timetable: Timetable;
  school: TimetableSchool;
  detail: TimetableDetail;
  box: { width: number; height: number };
  /** The size the signed-off frame drew this card at. */
  frame: number;
}

const FRAME_CARDS: Record<string, FrameCard> = {
  A1: { label: 'A1, three kids across a television', timetable: LEON, school: GAR, detail: 'less', box: { width: 571, height: 848 }, frame: 27 },
  A2: { label: 'A2, the same three stacked on a portrait wall', timetable: LEON, school: GAR, detail: 'less', box: { width: 982, height: 528 }, frame: 25 },
  A3left: { label: 'A3 left, one week at Less', timetable: LEON, school: GAR, detail: 'less', box: { width: 718, height: 828 }, frame: 25 },
  A3right: { label: 'A3 right, the same week at More', timetable: LEON, school: GAR, detail: 'more', box: { width: 718, height: 828 }, frame: 22 },
  A4: { label: 'A4, one week at More filling a television', timetable: LEON, school: GAR, detail: 'more', box: { width: 1822, height: 848 }, frame: 29 },
  A5: { label: 'A5, two kids at Some', timetable: LEON, school: GAR, detail: 'some', box: { width: 884, height: 848 }, frame: 27 },
  A6: { label: 'A6, five kids on one television', timetable: PAUL, school: GAR, detail: 'less', box: { width: 321, height: 848 }, frame: 22 },
  A7: { label: 'A7, one week at More on a tall wall', timetable: EMMA, school: GAR, detail: 'more', box: { width: 982, height: 1692 }, frame: 27 },
  A8: { label: 'A8, Saturday: the cards have turned the page', timetable: LEON, school: GAR, detail: 'less', box: { width: 571, height: 848 }, frame: 27 },
  A9: { label: 'A9, the middle of the autumn break', timetable: LEON, school: GAR, detail: 'less', box: { width: 571, height: 846 }, frame: 27 },
};

/** What one of those cards hands the geometry, exactly as `WeekCard` does. */
function frameInput(card: FrameCard, over: Partial<CardMetricsInput> = {}): CardMetricsInput {
  return {
    cardWidth: card.box.width,
    cardHeight: card.box.height,
    detail: card.detail,
    padding: 0,
    rows: buildRows(card.timetable, card.school, card.detail).rows,
    longestLabelChars: longestSubjectLabel(card.timetable, SUBJECTS),
    focusIcon: card.timetable.icons === true || card.detail !== 'less',
    hasLegend: card.detail === 'more' && card.timetable.weeks.B !== undefined,
    // The frames are a German household on a 24-hour clock.
    timeFormat: '24h',
    ...over,
  };
}

describe('cardBaseFontSize', () => {
  /**
   * How wide a clock time and a subject name really are, in em of the size
   * they are drawn at, measured in the browser in the card's own face. The
   * assertions below use these rather than the library's own estimates, so a
   * change to those has to answer to the measurement.
   */
  const TIME_EM = { '24h': 2.86, '12h': 4.72 };
  const NAME_EM = { 'Französisch': 5.82, 'Wirtschaft-Politik': 8.45 };

  for (const card of Object.values(FRAME_CARDS)) {
    it(`sizes ${card.label} for the box it is given`, () => {
      const input = frameInput(card);
      const base = cardBaseFontSize(input);

      // A band around the frame, not the frame's own number: the card derives
      // its size and the frames were drawn by hand. Outside this it is no
      // longer the same design. The rule this replaced drew A4 a third bigger
      // than its cells could hold and A7 half as big again.
      expect(base).toBeGreaterThan(card.frame * 0.75);
      expect(base).toBeLessThan(card.frame * 1.25);

      // The gutter holds its times at the size they are drawn at.
      const metrics = cardMetrics(input);
      expect(metrics.gutterPx).toBeGreaterThanOrEqual(metrics.gutterTimePx * TIME_EM['24h']);
    });
  }

  it('comes down from what the card shape alone asked for when the cells cannot hold it', () => {
    // A4 is the worst of them: its shape asks for type a third bigger than its
    // rows have room for, which painted rooms and start-end lines below the
    // bottom of their own cells.
    const input = frameInput(FRAME_CARDS.A4);
    expect(cardBaseFontSize({ ...input, rows: undefined })).toBeGreaterThan(37);
    expect(cardBaseFontSize(input)).toBeLessThan(32);
  });

  it('gives a long name a second line rather than shrinking the whole card', () => {
    // Emma's longest subject is "Wirtschaft-Politik", which no size worth
    // reading would fit across a lit column on one line.
    const input = frameInput(FRAME_CARDS.A7);
    const metrics = cardMetrics(input);
    expect(metrics.focusLabelLines).toBe(2);
    const inner = metrics.focusColumnEm - 0.9 - 1.14;
    expect(NAME_EM['Wirtschaft-Politik'] / 2).toBeLessThanOrEqual(inner);
  });

  it('keeps a name on one line when the lit column is wide enough for it', () => {
    const metrics = cardMetrics(frameInput(FRAME_CARDS.A4));
    expect(metrics.focusLabelLines).toBe(1);
    expect(NAME_EM['Französisch']).toBeLessThanOrEqual(metrics.focusColumnEm - 0.9 - 1.14);
  });

  it('widens the gutter when the times in it reach their floor', () => {
    // Five cards across a television: 0.6em is under the 16px small print is
    // held to, so the times stop shrinking with the card and the gutter has to
    // go on without them.
    const metrics = cardMetrics(frameInput(FRAME_CARDS.A6));
    expect(metrics.gutterTimePx).toBe(16);
    // Wider than the 2.3em a gutter takes when its times still scale.
    expect(metrics.gutterPx).toBeGreaterThan(2.3 * metrics.baseFontSize);
    expect(metrics.gutterPx).toBeGreaterThanOrEqual(16 * TIME_EM['24h']);
  });

  it('makes room for a 12-hour clock, which is half as wide again', () => {
    const input = frameInput(FRAME_CARDS.A6);
    const day = cardMetrics({ ...input, timeFormat: '24h' });
    const half = cardMetrics({ ...input, timeFormat: '12h' });
    expect(half.gutterPx).toBeGreaterThan(day.gutterPx);
    expect(half.gutterPx).toBeGreaterThanOrEqual(half.gutterTimePx * TIME_EM['12h']);
  });

  it('lets the times give way once the gutter would take a quarter of the card', () => {
    // A phone-narrow card on a 12-hour clock: the gutter stops growing and the
    // times step down inside it rather than losing their last digits.
    const metrics = cardMetrics(frameInput(FRAME_CARDS.A6, { cardWidth: 180, timeFormat: '12h' }));
    expect(metrics.gutterPx).toBeLessThanOrEqual(180 * 0.28);
    expect(metrics.gutterPx).toBeGreaterThanOrEqual(metrics.gutterTimePx * TIME_EM['12h']);
    expect(metrics.gutterTimePx).toBeLessThan(16);
  });

  it('drops the packing chip when the lit row has no height for it', () => {
    // The same week on a tall card and on a short one: the chip is the first
    // thing to go rather than the first thing painted over the row below.
    expect(cardMetrics(frameInput(FRAME_CARDS.A1)).packChip).toBe(true);
    expect(cardMetrics(frameInput(FRAME_CARDS.A2)).packChip).toBe(false);
  });

  it('keeps a size for the folded row\'s time when the start times are off', () => {
    // The gutter loses the times on every period row, but a row standing for
    // periods 7 to 10 still says when the afternoon starts.
    const off = cardMetrics(frameInput(FRAME_CARDS.A1, { showStartTimes: false }));
    expect(off.gutterTimePx).toBeGreaterThan(0);
    expect(off.gutterPx).toBeGreaterThanOrEqual(off.gutterTimePx * TIME_EM['24h']);
  });

  it('sizes on width alone when nobody says what the card is holding', () => {
    const input = frameInput(FRAME_CARDS.A4);
    expect(cardBaseFontSize({ ...input, cardHeight: undefined })).toBeCloseTo(1822 / 29, 5);
  });
});

describe('cardModel', () => {
  it('draws Leon Thursday the way the wall card does', () => {
    const card = model(MEMBERS.leon, LEON, GAR, 'less', THREE_UP);
    expect(card.rows.map((r) => r.kind)).toEqual([
      'period', 'period', 'break', 'period', 'period', 'break', 'period', 'period', 'fold',
    ]);
    expect(card.focusIndex).toBe(3);
    expect(card.member).toEqual({ id: 'leon', name: 'Leon', color: '#60a5fa', initials: 'L' });
    expect(card.className).toBe('7c');
    expect(card.header).toMatchObject({ focusDay: 'thu', labelKind: 'today', span: { start: '08:40', end: '13:15' } });

    const free = cellsOfKind(card, 'thu', 'free');
    expect(free).toHaveLength(1);
    expect(free[0]).toMatchObject({ periods: [1], rich: true, lateStart: undefined });
    expect(lessonAt(card, 'thu', 2)?.label).toBe('Englisch');
    const ek = lessonAt(card, 'thu', 3)!;
    expect(ek).toMatchObject({ periods: [3, 4], label: 'Erdkunde', labelStyle: 'name', double: true, bring: 'Atlas' });
    // The Doppelstunde covers two rows of the grid and nothing works that out later.
    const placed = column(card, 'thu').cells.find((c) => c.cell === ek)!;
    expect([placed.rowStart, placed.rowEnd]).toEqual([3, 5]);
  });

  it('swaps the Thursday double for Musik in a B week', () => {
    const focus = resolveFocus(utc('2026-09-17T05:10:00Z'), ZONE, context(LEON, GAR));
    expect(focus.weekLetter).toBe('B');
    const card = model(MEMBERS.leon, LEON, GAR, 'less', THREE_UP, focus);
    expect(lessonAt(card, 'thu', 3)).toMatchObject({ label: 'Musik', periods: [3, 4] });
  });

  it('folds the quiet afternoon into one row and keeps its start time', () => {
    const card = model(MEMBERS.leon, LEON, GAR, 'less', THREE_UP);
    expect(card.gutter.at(-1)).toEqual({ kind: 'fold', periods: [7, 8, 9], start: '13:20' });
    const folded = cellsOfKind(card, 'tue', 'folded');
    expect(folded).toHaveLength(1);
    expect(folded[0].entries).toEqual([
      expect.objectContaining({ periods: [8, 9], start: '14:10', label: 'Ku', labelStyle: 'code' }),
    ]);
    // Nothing but lessons survives the fold, so Tuesday's lunch is gone with it.
    expect(cellsOfKind(card, 'tue', 'lunch')).toHaveLength(0);
  });

  it('does not print "free" for a gap that only exists because of the fold', () => {
    const card = model(MEMBERS.mia, MIA, GGS, 'less', THREE_UP);
    // Mia's Wednesday runs English, then nothing, then violin in the folded row.
    expect(cellsOfKind(card, 'wed', 'free')).toHaveLength(0);
    expect(cellsOfKind(card, 'wed', 'folded')[0].entries[0]).toMatchObject({ label: 'Geige', periods: [8] });
  });

  it('keeps the gaps a day really has', () => {
    const card = model(MEMBERS.paul, PAUL, GAR, 'less', THREE_UP);
    expect(cellsOfKind(card, 'thu', 'free').map((c) => c.periods)).toEqual([[5], [7]]);
    expect(cellsOfKind(card, 'mon', 'free').map((c) => c.periods)).toEqual([[5, 6]]);
    expect(card.rows.filter((r) => r.kind === 'fold')).toHaveLength(0);
  });

  it('flags only the course that stands out from the rest of the week', () => {
    // One card filling a wall: the badge is suppressed wherever the column
    // cannot hold it beside the label, so a card with room for it is what
    // this asks which course gets one.
    const card = model(MEMBERS.paul, PAUL, GAR, 'less', ONE_UP);
    expect(lessonAt(card, 'mon', 1)?.course).toBe('LK');
    expect(lessonAt(card, 'mon', 3)?.course).toBeUndefined();
  });

  it('drops the chips, the badges and the long codes on a five-across card', () => {
    const card = model(MEMBERS.paul, PAUL, GAR, 'less', FIVE_UP);
    expect(card.metrics.narrow).toBe(true);
    expect(lessonAt(card, 'mon', 1)?.course).toBeUndefined();
    // A non-wide focus column reads as codes like every other column.
    expect(lessonAt(card, 'thu', 1)).toMatchObject({ label: 'Bio', labelStyle: 'code', rich: false, bring: undefined });
    expect(card.header.compact).toBe(true);

    const mia = model(MEMBERS.mia, MIA, GGS, 'less', FIVE_UP);
    expect(mia.header.care).toBeUndefined();
    // "Geige" is too wide for half a folded row at this size and steps down;
    // "Deu" fits its column at the card's own size, so it does not.
    const geige = cellsOfKind(mia, 'wed', 'folded')[0].entries[0];
    expect(geige.label).toBe('Geige');
    expect(geige.labelScale).toBeLessThan(1);
    expect(lessonAt(mia, 'thu', 1)?.labelScale).toBe(1);
  });

  it('carries the care band in the header until More gives it a row', () => {
    expect(model(MEMBERS.mia, MIA, GGS, 'less', THREE_UP).header.care).toEqual({ name: 'OGS', until: '16:00' });
    expect(model(MEMBERS.mia, MIA, GGS, 'some', TWO_UP).header.care).toEqual({ name: 'OGS', until: '16:00' });

    const more = model(MEMBERS.mia, MIA, GGS, 'more', ONE_UP);
    expect(more.header.care).toBeUndefined();
    expect(more.rows.at(-1)).toEqual({ kind: 'care', label: 'OGS' });
    const care = column(more, 'thu').cells.map((c) => c.cell).find((c) => c.kind === 'care');
    // The lit day names the care and the quiet ones only say until when, and
    // both of those are now measured against their own column rather than
    // taken from which day is lit.
    expect(care).toEqual({ kind: 'care', careName: 'OGS', until: '16:00', form: 'full' });
    const quietCare = column(more, 'mon').cells.map((c) => c.cell).find((c) => c.kind === 'care');
    expect(quietCare).toMatchObject({ form: 'short' });
  });

  it('dims a closed column and fades the lessons a short day never reaches', () => {
    const school = withSpecialDays(GAR, [
      { date: '2027-02-04', label: 'Zeugnistag', kind: 'ends-after', period: 4 },
      { date: '2027-02-05', label: 'Rosenmontag', kind: 'off' },
    ]);
    const focus = resolveFocus(utc('2027-02-04T08:00:00Z'), ZONE, context(LEON, school));
    const card = model(MEMBERS.leon, LEON, school, 'less', THREE_UP, focus);

    expect(column(card, 'fri').closedLabel).toBe('Rosenmontag');
    expect(column(card, 'thu')).toMatchObject({ endsAfterPeriod: 4, shortLabel: 'Zeugnistag' });
    const faded = column(card, 'thu').cells.filter((c) => c.faded).map((c) => c.cell);
    expect(faded.map((c) => (c.kind === 'lesson' ? c.label : c.kind))).toEqual(['Französisch', 'Physik']);
    expect(column(card, 'thu').cells.find((c) => c.cell === lessonAt(card, 'thu', 3))?.faded).toBe(false);
  });

  it('spells the dates out whenever the week on screen is not this one', () => {
    expect(model(MEMBERS.leon, LEON, GAR, 'less', THREE_UP).showDayDates).toBe(false);
    const nextWeek = resolveFocus(utc('2026-09-12T08:00:00Z'), ZONE, context(LEON, GAR));
    expect(model(MEMBERS.leon, LEON, GAR, 'less', THREE_UP, nextWeek).showDayDates).toBe(true);
    expect(model(MEMBERS.leon, LEON, GAR, 'some', TWO_UP).showDayDates).toBe(true);
  });
});

/**
 * The card's furniture, measured against the column it sits in.
 *
 * Everything around the grid used to be held to a pixel floor with no upper
 * bound and no seat at the width budget, so a card that shrank kept its
 * full-size pill, care clause and going-home line and let an
 * `overflow: hidden` decide what a reader saw. What that cost was not space
 * but meaning: Thursday the 10th drawn as "Do 1", a pick-up at 16:00 drawn as
 * "s 16:0". Each of these pins one piece of furniture choosing a shorter form
 * instead.
 */
describe('furniture that does not fit its column takes a shorter form', () => {
  it('keeps the lit day off a closed day: no going-home time and nothing to pack', () => {
    // Ascension Day. School is shut, so there is no time to come home at and
    // nothing to put in a bag, and a card that says otherwise is asking
    // somebody to do something that is not happening.
    const ctx = context(MIA, GGS, { publicHolidays: [{ date: '2027-05-06', name: 'Christi Himmelfahrt' }] });
    const focus = resolveFocus(utc('2027-05-06T07:00:00Z'), ZONE, ctx);
    const card = model(MEMBERS.mia, MIA, GGS, 'more', ONE_UP, focus);

    expect(card.header.closedLabel).toBe('Christi Himmelfahrt');
    expect(card.tail).toBeUndefined();
    expect(card.footer?.bring).toBeUndefined();
    // The same Thursday with the school open carries both, and the packing
    // line is the one the card used to print on the holiday.
    const open = resolveFocus(utc('2027-05-06T07:00:00Z'), ZONE, context(MIA, GGS));
    const thursday = model(MEMBERS.mia, MIA, GGS, 'more', ONE_UP, open);
    expect(thursday.tail?.endTime).toBe('12:45');
    expect(thursday.footer?.bring).toEqual(['Sportzeug']);
  });

  it('drops the date from the lit pill rather than cutting it in half', () => {
    // The pill is about 75px whatever the card's size, because its type has a
    // pixel floor. Five across a television leaves the lit column under 50px,
    // and a sliced "Do 10." reads as Thursday the 1st.
    const roomy = model(MEMBERS.leon, LEON, GAR, 'some', THREE_UP);
    expect(column(roomy, 'thu')).toMatchObject({ showDate: true });
    expect(roomy.header.pill).toBe('full');

    const tight = model(MEMBERS.leon, LEON, GAR, 'some', FIVE_UP);
    expect(column(tight, 'thu').showDate).toBe(false);
    // The weekday and the lozenge stay: the wash and the pill are what mark
    // the day, and neither of them can be read as a wrong date.
    expect(tight.header.pill).not.toBe('none');
  });

  it('keeps the pick-up time on the care band and gives up the name first', () => {
    const roomy = model(MEMBERS.mia, MIA, GGS, 'more', ONE_UP);
    const litRoomy = careCell(roomy, 'thu');
    expect(litRoomy).toMatchObject({ careName: 'OGS', until: '16:00', form: 'full' });

    // Five across: "OGS bis 16:00" wants two and a half times its column. The
    // name goes, then the word, and the time is the last thing standing.
    const tight = model(MEMBERS.mia, MIA, GGS, 'more', FIVE_UP);
    for (const day of ['thu', 'mon'] as const) {
      const care = careCell(tight, day);
      expect(care?.form).not.toBe('full');
      expect(care?.form).not.toBe('none');
    }
  });

  it('drops the going-home line rather than printing half a time', () => {
    // The sentence, then the bare time beside the house, then nothing: the
    // line above the grid already says when the day ends, and "13:1" is not a
    // time.
    expect(model(MEMBERS.leon, LEON, GAR, 'more', ONE_UP).tail?.form).toBe('sentence');
    expect(model(MEMBERS.leon, LEON, GAR, 'some', THREE_UP).tail?.form).toBe('time');
    expect(model(MEMBERS.leon, LEON, GAR, 'some', FIVE_UP).tail).toBeUndefined();
  });
});

/**
 * The boxes the fixes in this round were measured against, read off the
 * rendered wall rather than reasoned about.
 *
 * `DEFAULT_3UP` is the registry's own default size with three cards across it,
 * which is what a fresh drop from the palette lands as: a 286px card at
 * 16.7px, 42px quiet columns and a 90px folded row. `FIVE_MORE` is five cards
 * across a television at More, where the day line came out different on every
 * card.
 */
const DEFAULT_3UP = { cardWidth: 286, cardHeight: 846, baseFontSize: 16.7087, padding: 0, ...CLOCK };
const FIVE_MORE = { cardWidth: 321.2, cardHeight: 982, baseFontSize: 17.4, padding: 0, ...CLOCK };

/**
 * Three cards across a 1024x600 wall panel: a 283px card at 16px, with 39.5px
 * quiet columns, which is three pixels narrower than `DEFAULT_3UP`. The pair
 * is what the one-line name bound has to tell apart.
 */
const SMALL_WALL_3UP = { cardWidth: 283.3, cardHeight: 534, baseFontSize: 16, padding: 0, ...CLOCK };

const withRows = (
  geometry: typeof DEFAULT_3UP,
  timetable: Timetable,
  school: TimetableSchool,
  detail: TimetableDetail,
): CardMetricsInput & { baseFontSize: number } => ({
  ...geometry,
  detail,
  rows: buildRows(timetable, school, detail).rows,
  longestLabelChars: longestSubjectLabel(timetable, SUBJECTS),
});

describe('the cards in one row agree', () => {
  /**
   * The row's own header row: the longest name, class, care word and week
   * badge anywhere in it. Every card settles its day line against this rather
   * than against its own name, so the row sheds the same words at the same
   * moment instead of one card keeping a sentence its neighbour has lost.
   */
  it('settles the day line against the row, not each card on its own', () => {
    const alone = (member: typeof MEMBERS.leon, timetable: Timetable, school: TimetableSchool) =>
      model(member, timetable, school, 'more', FIVE_MORE).header.compact;

    // Five across a television: "Mia" is three characters shorter than the
    // rest of the row, which is the whole of the difference.
    expect(alone(MEMBERS.leon, LEON, GAR)).toBe(true);
    expect(alone(MEMBERS.mia, MIA, GGS)).toBe(false);

    const row = rowFacts([
      { name: 'Leon', className: '7c', parity: true, care: undefined, focusWord: 'Heute' },
      { name: 'Mia', className: '4b', parity: false, care: 'OGS', focusWord: 'Heute' },
    ]);
    for (const card of [
      model(MEMBERS.leon, LEON, GAR, 'more', FIVE_MORE, undefined, { row }),
      model(MEMBERS.mia, MIA, GGS, 'more', FIVE_MORE, undefined, { row }),
    ]) {
      expect(card.header.compact).toBe(true);
    }
  });
});

describe('a size bigger than the cells can hold', () => {
  /** The registry default box, three cards, with the rows a week really has. */
  const input = withRows(DEFAULT_3UP, LEON, GAR, 'more');

  it('is honoured, and the cells give up the room first and the names after', () => {
    // Text size goes to 160% and every cell clips its own contents, so a card
    // asked for more than its cells can hold used to draw it and lose the room
    // under a name into thin air. The ladder is the room, then the names.
    const own = cardBaseFontSize(input);
    expect(shedFor(input, own)).toBe(0);
    // Measured on this box: More holds about an eighth over its own size, sheds
    // the rooms from there and the names at about two and a half times.
    expect(shedFor(input, own * 1.8)).toBe(1);
    expect(shedFor(input, own * 2.5)).toBe(2);
    // Never back up a rung as the card is asked for more.
    let last = 0;
    for (const factor of [1, 1.2, 1.4, 1.6, 1.8, 2, 2.5, 3, 4]) {
      const shed = shedFor(input, own * factor);
      expect(shed).toBeGreaterThanOrEqual(last);
      last = shed;
    }
    expect(shedPreset('more', 1)).toMatchObject({ rooms: false, names: 'all' });
    expect(shedPreset('more', 2)).toMatchObject({ rooms: false, names: 'focus' });
  });

  it('holds a label to the lines its cell really has, not the budget', () => {
    // The other half of the same fault: a two-line budget forced into a cell
    // with room for one drew the second line past the bottom edge, where
    // nobody can see that anything was cut.
    const own = cardBaseFontSize(input);
    const roomy = cardMetrics({ ...input, baseFontSize: own });
    const pressed = cardMetrics({ ...input, baseFontSize: own * 3 });
    expect(roomy.labelClamp.quiet).toBeGreaterThanOrEqual(2);
    expect(pressed.labelClamp.quiet).toBe(1);
  });

  it('gives nothing up for a week with no lessons to shed anything from', () => {
    const blank: Timetable = { memberId: 'x', schoolId: 'gar', className: '7c', weeks: { A: {} } };
    expect(shedFor(withRows(DEFAULT_3UP, blank, GAR, 'more'), 80)).toBe(0);
  });

  it('declines a size it cannot hold, and never below the one it chose itself', () => {
    // Text size 160% on a television: the request is honoured as far as the
    // cells go and then declined, and declining must not leave the card
    // smaller than it would have been if nobody had asked for anything.
    const tv = withRows({ ...DEFAULT_3UP, cardWidth: 571.3, cardHeight: 982 }, LEON, GAR, 'more');
    const own = cardBaseFontSize(tv);
    for (const factor of [1, 1.3, 1.6, 2, 3, 6]) {
      const answer = resolveCardFontSize(tv, own * factor);
      expect(answer.fontSize).toBeGreaterThanOrEqual(own);
      expect(answer.fontSize).toBeLessThanOrEqual(own * factor);
    }
    // Text size 60% is a size the card can always hold, so it is honoured whole.
    expect(resolveCardFontSize(tv, own * 0.6)).toEqual({ fontSize: own * 0.6, shed: 0 });
  });

  it('comes down to its honest size where the pixel floor is more than it can hold', () => {
    // Three cards in a 420 by 300 corner box. The floor used to win and the
    // cells clipped their own contents, which nothing could see.
    const corner = withRows({ ...DEFAULT_3UP, cardWidth: 93.3, cardHeight: 266 }, LEON, GAR, 'some');
    const answer = resolveCardFontSize(corner, DEFAULT_MODULE_STYLE.fontSize);
    expect(answer.fontSize).toBeLessThan(DEFAULT_MODULE_STYLE.fontSize);
    expect(answer.fontSize).toBeGreaterThanOrEqual(6);
  });
});

describe('the heading above the cards', () => {
  /** A television, a 4K wall and a corner widget, module boxes as the wall lays them out. */
  const boxOf = (width: number, height: number, cardCount = 3) => ({
    width,
    height,
    cardCount,
    stacked: false,
    inset: 17,
  });

  it('scales off the cards below it instead of sitting at a fixed size', () => {
    const television = resolveHeading(boxOf(1856, 1016), 'some');
    const fourK = resolveHeading(boxOf(3744, 2064), 'some');
    // A fixed 16px is what this replaces: 16px over cards drawn at 53px.
    expect(television.fontPx).toBeGreaterThan(16);
    expect(fourK.fontPx).toBeGreaterThan(television.fontPx * 1.5);
  });

  it('holds its band to about an eighth of the module, whatever it is asked for', () => {
    for (const box of [boxOf(420, 300, 1), boxOf(1600, 260), boxOf(1856, 1016)]) {
      for (const fixed of [undefined, 72]) {
        expect(resolveHeading(box, 'some', fixed).bandPx).toBeLessThanOrEqual(box.height * 0.12);
      }
    }
  });

  it('settles on one answer, so two screenshots of one wall are the same', () => {
    // The band it wants is height the cards do not get, and its size comes
    // from the cards, so the two chase each other. Whole pixels and a few
    // rounds, and the answer for one box is one number.
    for (const box of [boxOf(420, 300, 1), boxOf(1856, 1016), boxOf(3744, 2064), boxOf(1600, 260, 5)]) {
      const first = resolveHeading(box, 'some');
      expect(resolveHeading(box, 'some')).toEqual(first);
      // The band the cards were measured against is the band that is drawn.
      const card = cardBoxIn({ ...box, bandPx: first.bandPx });
      expect(card.height).toBeGreaterThan(0);
    }
  });

  it('gives every card in a row the box the grid really hands it', () => {
    // Measured off the rendered wall: three cards in a 1856 by 1016 module
    // come out 571.3 by 982, and five come out 321.2.
    expect(cardBoxIn(boxOf(1856, 1016))).toEqual({ width: 571.3333333333334, height: 982 });
    expect(cardBoxIn(boxOf(1856, 1016, 5)).width).toBeCloseTo(321.2, 1);
    expect(cardBoxIn({ ...boxOf(1856, 1016, 5), stacked: true })).toMatchObject({ width: 1822 });
  });
});

describe('a folded afternoon is measured against the cell it gets', () => {
  it('keeps the subject name where the cell has the width for it', () => {
    // Leon's Tuesday runs art from 14:10 in a folded row. The cell is 41px
    // wide and 90px tall, and "Kunst" measures 38px in the card's own face,
    // so the name fits and the catalogue code is not what belongs there.
    const card = model(MEMBERS.leon, LEON, GAR, 'some', withRows(DEFAULT_3UP, LEON, GAR, 'some'));
    expect(cellsOfKind(card, 'tue', 'folded')[0].entries[0]).toMatchObject({
      label: 'Kunst',
      labelStyle: 'name',
    });
  });

  it('still falls back to the code for a name the cell cannot hold', () => {
    // The same art lesson on a 320px card, where the cell is 40px and the
    // name does not go in. The code the catalogue carries is what belongs
    // there, and it is what the school's own timetable says.
    const card = model(MEMBERS.leon, LEON, GAR, 'some', {
      ...FIVE_UP,
      cardWidth: 320,
      cardHeight: 982,
      rows: buildRows(LEON, GAR, 'some').rows,
      longestLabelChars: longestSubjectLabel(LEON, SUBJECTS),
    });
    expect(cellsOfKind(card, 'tue', 'folded')[0].entries[0]).toMatchObject({
      label: 'Ku',
      labelStyle: 'code',
    });
  });

  it('hands the entry the width it is really drawn in', () => {
    // One lesson in the row has the whole column, less the padding a quiet
    // cell carries. Two share it, less the gap drawn between them.
    const one = cellsOfKind(
      model(MEMBERS.leon, LEON, GAR, 'some', withRows(DEFAULT_3UP, LEON, GAR, 'some')),
      'tue',
      'folded',
    )[0];
    expect(one.widthPx).toBeGreaterThan(38);
    expect(one.widthPx).toBeLessThan(43);
  });

  it('steps down to the code where the cell is a few pixels short of the name', () => {
    // Mia's Wednesday violin lesson on a 1024x600 wall. The entry is 33.7px
    // wide and "Geige" measures 36.4px in the card's own face, so the name is
    // 3px past what the cell can hold, and a folded entry has no second line
    // to break onto. The card used to print the name and lose its tail to an
    // ellipsis: "Gei" in a cell whose whole subject is five letters.
    const card = model(MEMBERS.mia, MIA, GGS, 'some', withRows(SMALL_WALL_3UP, MIA, GGS, 'some'));
    const violin = cellsOfKind(card, 'wed', 'folded')[0].entries[0];
    expect(violin.labelStyle).toBe('code');
    // The catalogue code for violin is the same five letters, so what saves it
    // is the size step a code may take and a name may not.
    expect(violin.labelScale).toBeLessThan(1);
  });
});

describe('the school-holiday line has three forms of the same fact', () => {
  /** Mid-break, so the card shows the week school starts again in. */
  const inTheBreak = () =>
    resolveFocus(utc('2026-10-26T08:00:00Z'), ZONE, context(LEON, GAR, { schoolHolidays: [HERBSTFERIEN] }));

  /**
   * The three German sentences the component composes, at the lengths it
   * really hands down: the whole thing with the long date, the whole thing
   * with a short one, and the two facts with no sentence around them.
   */
  const GERMAN: TimetableWords = {
    endCap: 'Feierabend um '.length,
    room: 'Raum '.length,
    careFull: ' bis '.length,
    careShort: 'bis '.length,
    lateStart: 'erst um '.length,
    timeRange: ' bis '.length,
    focusWord: 'Heute'.length,
    dayName: 'Do'.length,
    dayNumber: '10.'.length,
    dayHead: 'Do10. Okt.'.length,
    holidayFull: 'Herbstferien, wieder Schule am Montag, 2. November'.length,
    holidayShort: 'Herbstferien, wieder Schule am 2. Nov.'.length,
    holidayBrief: 'Herbstferien, wieder ab 2. Nov.'.length,
  };

  const lineOn = (geometry: Omit<CardMetricsInput, 'detail'> & { baseFontSize: number }, detail: TimetableDetail) =>
    model(MEMBERS.leon, LEON, GAR, detail, geometry, inTheBreak(), { words: GERMAN }).holiday;

  it('says the whole sentence on a card with the width for it', () => {
    // Three cards across a television: 571px at 25.4px, where the sentence
    // with the long date takes about 484px of it.
    expect(lineOn({ cardWidth: 571.3, cardHeight: 982, baseFontSize: 25.4, padding: 0, ...CLOCK }, 'some'))
      .toMatchObject({ name: 'Herbstferien', backOn: '2026-11-02', form: 'full' });
  });

  it('keeps the sentence and shortens the date where the long one does not go', () => {
    expect(lineOn({ cardWidth: 400, cardHeight: 982, baseFontSize: 20, padding: 0, ...CLOCK }, 'some')?.form)
      .toBe('short');
  });

  it('drops the sentence and keeps the two facts at five cards across', () => {
    // The frame this was measured on: five cards on a television at More,
    // 321px at 17.5px. Even the short date left the sentence 23px past the
    // card, which the line gave up to an ellipsis.
    expect(lineOn({ cardWidth: 321.2, cardHeight: 982, baseFontSize: 17.5, padding: 0, ...CLOCK }, 'more')?.form)
      .toBe('brief');
  });

  it('gives up the line rather than cutting the holiday name in half', () => {
    // Under the shortest form the only thing left to cut is the name of the
    // holiday itself, and a card that says "Herbstf" has spent a line saying
    // nothing.
    expect(lineOn({ cardWidth: 200, cardHeight: 534, baseFontSize: 16, padding: 0, ...CLOCK }, 'some'))
      .toBeUndefined();
  });
});

describe('weekDifferences', () => {
  it('groups a changed double into one entry', () => {
    const leon = weekDifferences(LEON, GAR, SUBJECTS);
    expect(leon).toHaveLength(1);
    expect(leon[0]).toMatchObject({ day: 'thu', periods: [3, 4] });
    expect([leon[0].a?.name, leon[0].b?.name]).toEqual(['Erdkunde', 'Musik']);

    const emma = weekDifferences(EMMA, GAR, SUBJECTS);
    expect(emma).toHaveLength(1);
    expect(emma[0]).toMatchObject({ day: 'fri', periods: [3, 4] });
    expect([emma[0].a?.name, emma[0].b?.name]).toEqual(['Chemie', 'Musik']);
  });

  it('is empty for somebody with one week plan', () => {
    expect(weekDifferences(MIA, GGS, SUBJECTS)).toEqual([]);
  });
});

describe('the Less, Some and More presets', () => {
  it('turns on exactly what each setting promises', () => {
    expect(TIMETABLE_PRESETS.less).toEqual({
      names: 'focus', rooms: false, times: 'start', pack: 'cell',
      endCap: false, careRow: false, foot: false, ab: false, late: false,
    });
    expect(TIMETABLE_PRESETS.some).toEqual({
      names: 'all', rooms: 'focus', times: 'start', pack: 'cell',
      endCap: true, careRow: false, foot: false, ab: false, late: false,
    });
    expect(TIMETABLE_PRESETS.more).toEqual({
      names: 'all', rooms: 'all', times: 'range', pack: 'foot',
      endCap: true, careRow: true, foot: true, ab: true, late: true,
    });
  });

  const less = () => model(MEMBERS.leon, LEON, GAR, 'less', THREE_UP);
  const some = () => model(MEMBERS.leon, LEON, GAR, 'some', TWO_UP);
  const more = () => model(MEMBERS.leon, LEON, GAR, 'more', ONE_UP);

  it('prints codes in the quiet columns at Less and names above it', () => {
    expect(lessonAt(less(), 'mon', 1)).toMatchObject({ label: 'Ma', labelStyle: 'code' });
    expect(lessonAt(some(), 'mon', 1)).toMatchObject({ label: 'Mathe', labelStyle: 'name' });
    expect(lessonAt(more(), 'mon', 1)).toMatchObject({ label: 'Mathe', labelStyle: 'name' });
  });

  it('keeps the focus column on full names at every setting', () => {
    for (const card of [less(), some(), more()]) {
      expect(lessonAt(card, 'thu', 5)).toMatchObject({ label: 'Französisch', labelStyle: 'name', rich: true });
    }
  });

  it('adds the room to the quiet columns only at More', () => {
    expect(lessonAt(less(), 'mon', 1)?.room).toBeUndefined();
    expect(lessonAt(some(), 'mon', 1)?.room).toBeUndefined();
    expect(lessonAt(more(), 'mon', 1)?.room).toBe('112');
  });

  it('grows the focus column sub-lines one setting at a time', () => {
    expect(lessonAt(less(), 'thu', 5)?.room).toBeUndefined();
    expect(lessonAt(less(), 'thu', 5)?.timeRange).toBeUndefined();
    expect(lessonAt(some(), 'thu', 5)?.room).toBe('112');
    expect(lessonAt(some(), 'thu', 5)?.timeRange).toBeUndefined();
    expect(lessonAt(more(), 'thu', 5)?.room).toBe('112');
    expect(lessonAt(more(), 'thu', 5)?.timeRange).toEqual({ start: '11:40', end: '12:25' });
  });

  it('moves the packing line out of the cell and into the footer at More', () => {
    expect(lessonAt(less(), 'thu', 3)?.bring).toBe('Atlas');
    expect(lessonAt(some(), 'thu', 3)?.bring).toBe('Atlas');
    expect(lessonAt(more(), 'thu', 3)?.bring).toBeUndefined();
    expect(less().footer).toBeUndefined();
    expect(some().footer).toBeUndefined();
    expect(more().footer?.bring).toEqual(['Atlas']);
  });

  it('gives subject pictures to young readers everywhere and to everyone else by degrees', () => {
    // Leon is not a young reader: the focus column earns pictures at Some,
    // the quiet columns not until More.
    expect(lessonAt(less(), 'thu', 5)?.showIcon).toBe(false);
    expect(lessonAt(some(), 'thu', 5)?.showIcon).toBe(true);
    expect(lessonAt(less(), 'mon', 1)?.showIcon).toBe(false);
    expect(lessonAt(more(), 'mon', 1)?.showIcon).toBe(true);

    const mia = model(MEMBERS.mia, MIA, GGS, 'less', THREE_UP);
    expect(lessonAt(mia, 'mon', 1)?.showIcon).toBe(true);
    expect(cellsOfKind(mia, 'wed', 'folded')[0].entries[0].showIcon).toBe(false);
    const miaMore = model(MEMBERS.mia, MIA, GGS, 'more', ONE_UP);
    expect(cellsOfKind(miaMore, 'wed', 'folded')[0].entries[0].showIcon).toBe(true);
  });

  it('hands the gutter an end time only at More', () => {
    expect(less().gutter[0]).toEqual({ kind: 'period', n: 1, start: '07:50', end: undefined });
    expect(some().gutter[0]).toEqual({ kind: 'period', n: 1, start: '07:50', end: undefined });
    expect(more().gutter[0]).toEqual({ kind: 'period', n: 1, start: '07:50', end: '08:35' });
  });

  it('drops the times from the gutter when the household turns them off', () => {
    const card = cardModel({
      timeFormat: '12h',
      member: MEMBERS.leon, timetable: LEON, school: GAR, subjects: SUBJECTS,
      detail: 'more', focus: thursdayFocus(LEON, GAR),
      metrics: cardMetrics({ ...ONE_UP, detail: 'more', showStartTimes: false }),
      showStartTimes: false,
    });
    expect(card.gutter[0]).toEqual({ kind: 'period', n: 1, start: undefined, end: undefined });
  });

  it('adds the going-home block from Some upwards', () => {
    expect(less().tail).toBeUndefined();
    // Thursday's last lesson sits on row 7, so the tail takes the folded row.
    expect(some().tail).toEqual({ endTime: '13:15', rowStart: 8, rowEnd: 9, form: 'sentence' });
    expect(more().tail).toMatchObject({ endTime: '13:15' });
  });

  it('explains a late start only at More', () => {
    expect(cellsOfKind(less(), 'thu', 'free')[0].lateStart).toBeUndefined();
    expect(cellsOfKind(some(), 'thu', 'free')[0].lateStart).toBeUndefined();
    expect(cellsOfKind(more(), 'thu', 'free')[0].lateStart).toBe('08:40');
  });

  it('names the lunch break only at More', () => {
    expect(cellsOfKind(model(MEMBERS.paul, PAUL, GAR, 'less', THREE_UP), 'mon', 'lunch')[0].showLabel).toBe(false);
    expect(cellsOfKind(model(MEMBERS.paul, PAUL, GAR, 'more', ONE_UP), 'mon', 'lunch')[0].showLabel).toBe(true);
  });

  it('marks the week letter and lists the swap only at More', () => {
    expect(lessonAt(less(), 'thu', 3)?.weekBadge).toBeUndefined();
    expect(lessonAt(some(), 'thu', 3)?.weekBadge).toBeUndefined();
    expect(lessonAt(more(), 'thu', 3)?.weekBadge).toBe('A');
    expect(lessonAt(more(), 'thu', 5)?.weekBadge).toBeUndefined();
    expect(more().footer?.legend).toHaveLength(1);
    expect(more().footer?.legend[0]).toMatchObject({ day: 'thu', periods: [3, 4] });
  });

  it('labels the folded row with a code at Less and a name above it', () => {
    expect(cellsOfKind(less(), 'tue', 'folded')[0].entries[0]).toMatchObject({ label: 'Ku', labelStyle: 'code' });
    expect(cellsOfKind(some(), 'tue', 'folded')[0].entries[0]).toMatchObject({ label: 'Kunst', labelStyle: 'name' });
    expect(cellsOfKind(more(), 'tue', 'folded')[0].entries[0]).toMatchObject({ label: 'Kunst', labelStyle: 'name' });
  });

  it('says nothing to pack when the day needs nothing', () => {
    const card = model(MEMBERS.emma, EMMA, GAR, 'more', PORTRAIT);
    expect(card.footer?.bring).toEqual([]);
    expect(card.footer?.legend[0]).toMatchObject({ day: 'fri', periods: [3, 4] });
  });

  it('shortens a subject name that carries a programme in brackets', () => {
    const card = model(MEMBERS.mia, MIA, GGS, 'more', ONE_UP);
    expect(cellsOfKind(card, 'wed', 'folded')[0].entries[0].label).toBe('Geige');
  });
});

describe('a day a dated exception cuts short', () => {
  const school: TimetableSchool = {
    id: 'school-1',
    name: 'Gymnasium',
    slots: [
      { kind: 'period', n: 1, start: '08:00', end: '08:45' },
      { kind: 'period', n: 2, start: '08:50', end: '09:35' },
      { kind: 'period', n: 3, start: '09:55', end: '10:40' },
      { kind: 'period', n: 4, start: '10:45', end: '11:30' },
    ],
    weekCycle: { mode: 'off' },
    // A report-card morning: lessons stop after second period.
    specialDays: [{ date: '2026-09-11', label: 'Zeugnisausgabe', kind: 'ends-after', period: 2 }],
  };
  const subjects: TimetableSubject[] = [
    { id: 'ma', code: 'Ma', name: 'Mathe', color: '#4f8ef7', icon: 'triangle' },
  ];
  const full = { 1: { subjectId: 'ma' }, 2: { subjectId: 'ma' }, 3: { subjectId: 'ma' }, 4: { subjectId: 'ma' } };
  const timetable: Timetable = {
    memberId: 'leon',
    schoolId: 'school-1',
    weeks: { A: { mon: full, tue: full, wed: full, thu: full, fri: full } },
  };

  it('says the day ends when its last surviving lesson does', () => {
    // Friday 2026-09-11 is the short day. Mid-morning, before anything is over.
    const now = new Date('2026-09-11T09:00:00');
    const focus = resolveFocus(now, undefined, { school, timetable, subjects });
    const model = cardModel({
      timeFormat: '12h',
      member: { id: 'leon', name: 'Leon', color: '#60a5fa' },
      timetable,
      school,
      subjects,
      detail: 'more',
      focus,
      metrics: cardMetrics({ timeFormat: '12h', cardWidth: 900, baseFontSize: 16, detail: 'more' }),
    });

    // Second period ends at 09:35, not fourth period's 11:30. All four periods
    // are Mathe, so they merge into one double that straddles the cut: asking
    // the block when it ends answers 11:30, which is why the time comes off the
    // school's own bell for the period the day stops after.
    expect(model.header.span?.end).toBe('09:35');
    // The going-home line carries the same time wherever it has room to appear.
    expect(model.tail?.endTime ?? '09:35').toBe('09:35');
    // And the periods past the cut are still drawn, dimmed, so the column says
    // what is not happening rather than going blank.
    const friday = model.days.find((day) => day.day === 'fri')!;
    expect(friday.endsAfterPeriod).toBe(2);
    expect(friday.cells.some((placed) => placed.faded)).toBe(true);
  });

  it('turns the page once the short day is actually over, not hours later', () => {
    // 10:00 is after 09:35 and well before 11:30. The week is finished.
    const focus = resolveFocus(new Date('2026-09-11T10:00:00'), undefined, { school, timetable, subjects });
    expect(focus.currentWeek).toBe(false);
    expect(focus.focusDay).toBe('mon');
  });

  it('stays on the short day while lessons are still running', () => {
    const focus = resolveFocus(new Date('2026-09-11T09:00:00'), undefined, { school, timetable, subjects });
    expect(focus.currentWeek).toBe(true);
    expect(focus.focusDay).toBe('fri');
  });
});

// ---------------------------------------------------------------------------
// Dates to remember on the week card
// ---------------------------------------------------------------------------

describe('dates to remember', () => {
  const NOTED_LEON: Timetable = {
    ...LEON,
    notes: [
      { id: 'n1', date: '2026-09-11', kind: 'test', subjectId: 'ma', text: 'Mathe-Arbeit' },
      { id: 'n2', date: '2026-09-11', kind: 'cancelled', periods: [6] },
      { id: 'n3', date: '2026-09-11', kind: 'bring', text: 'Wanderschuhe' },
    ],
  };
  const ctx = (timetable: Timetable): FocusContext => ({ school: GAR, timetable, subjects: SUBJECTS });

  it('reads a date\'s notes into tests, things to bring and periods off', () => {
    const notes = notesOn(NOTED_LEON, '2026-09-11');
    expect([...notes.tests]).toEqual([['ma', 'Mathe-Arbeit']]);
    expect(notes.bring).toEqual(['Wanderschuhe']);
    expect([...notes.cancelled]).toEqual([6]);
    expect(hasNotes(notesOn(NOTED_LEON, '2026-09-10'))).toBe(false);
  });

  it('marks a cancelled period off in the blocks and keeps it out of the span', () => {
    const blocks = dayBlocks(NOTED_LEON, GAR, SUBJECTS, 'fri', 'A', undefined, new Set([6]));
    const last = blocks[blocks.length - 1];
    expect(last.kind).toBe('lesson');
    expect(last.kind === 'lesson' && last.off).toBe('cancelled');
    // Sport was a double over 5 and 6; only the 6th is off, so it is two blocks.
    expect(blocks.filter((b) => b.kind === 'lesson' && b.subject.id === 'sp').map((b) => b.kind === 'lesson' && b.periods)).toEqual([[5], [6]]);
    expect(daySpan(blocks)?.end).toBe('12:25');
    expect(bringFor(blocks)).toEqual(['Sportzeug']);
  });

  it('turns the page when the cancelled last lesson would have ended, not when it ends', () => {
    // Friday 12:30 in Berlin: the 6th period is off, so the week is over at 12:25.
    const at = new Date('2026-09-11T10:30:00Z');
    expect(resolveFocus(at, ZONE, ctx(NOTED_LEON)).focusLabelKind).toBe('weekday');
    expect(resolveFocus(at, ZONE, ctx(LEON)).focusLabelKind).toBe('today');
  });

  it('carries the notes of the shown week by day', () => {
    const focus = resolveFocus(new Date('2026-09-10T05:10:00Z'), ZONE, ctx(NOTED_LEON));
    expect(Object.keys(focus.notes)).toEqual(['fri']);
    expect(focus.notes.fri?.bring).toEqual(['Wanderschuhe']);
  });

  function friday(detail: TimetableDetail, timetable = NOTED_LEON): TimetableCardModel {
    const focus = resolveFocus(new Date('2026-09-11T05:10:00Z'), ZONE, ctx(timetable));
    const metrics = cardMetrics({ timeFormat: '12h', cardWidth: 900, cardHeight: 880, detail, padding: 0, rows: buildRows(timetable, GAR, detail).rows });
    return cardModel({ timeFormat: '12h', member: { id: 'leon', name: 'Leon', color: '#60a5fa' }, timetable, school: GAR, subjects: SUBJECTS, detail, focus, metrics });
  }

  it('flags the test on the lesson, fades the cancelled one, and moves the going-home time', () => {
    const model = friday('some');
    const fri = model.days.find((d) => d.day === 'fri')!;
    const lessons = fri.cells.filter((c) => c.cell.kind === 'lesson');
    const maths = lessons.find((c) => c.cell.kind === 'lesson' && c.cell.subject.id === 'ma')!;
    expect(maths.cell.kind === 'lesson' && maths.cell.test).toBe('Mathe-Arbeit');
    const sixth = lessons.find((c) => c.cell.kind === 'lesson' && c.cell.periods.includes(6))!;
    expect(sixth.faded).toBe(true);
    expect(sixth.cell.kind === 'lesson' && sixth.cell.cancelled).toBe(true);
    expect(model.header.span).toEqual({ start: '07:50', end: '12:25' });
    expect(model.tail?.endTime).toBe('12:25');
    // The one-off item sits under the going-home line at Some.
    expect(model.tail?.bring).toEqual(['Wanderschuhe']);
    expect(model.footer).toBeUndefined();
  });

  it('at More the one-off item joins the footer, with the test named', () => {
    const model = friday('more');
    expect(model.tail?.bring).toBeUndefined();
    expect(model.footer?.bring).toEqual(['Sportzeug', 'Wanderschuhe']);
    expect(model.footer?.tests).toEqual(['Mathe-Arbeit']);
    expect(model.footer?.tomorrow).toBeUndefined();
  });

  it('at More on the day before, the footer says what tomorrow brings', () => {
    const focus = resolveFocus(new Date('2026-09-10T05:10:00Z'), ZONE, ctx(NOTED_LEON));
    const metrics = cardMetrics({ timeFormat: '12h', cardWidth: 900, cardHeight: 880, detail: 'more', padding: 0, rows: buildRows(NOTED_LEON, GAR, 'more').rows });
    const model = cardModel({ timeFormat: '12h', member: { id: 'leon', name: 'Leon', color: '#60a5fa' }, timetable: NOTED_LEON, school: GAR, subjects: SUBJECTS, detail: 'more', focus, metrics });
    expect(model.footer?.tomorrow).toEqual({ tests: ['Mathe-Arbeit'], cancelled: [6] });
    // Thursday itself has no notes, so no test pills of its own.
    expect(model.footer?.tests).toBeUndefined();
  });

  it('draws a chip under the last lesson even at Less, which has no going-home line', () => {
    const model = friday('less');
    expect(model.tail?.endTime).toBeUndefined();
    expect(model.tail?.bring).toEqual(['Wanderschuhe']);
  });
});
