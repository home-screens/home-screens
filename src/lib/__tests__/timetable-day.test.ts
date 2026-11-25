import { describe, it, expect } from 'vitest';
import type { TimetableData, TimetableSchool } from '@/types/timetables';
import household from '../../../e2e/fixtures/timetables/sample-household.json';
import {
  axisShare,
  dayAxis,
  familyDayRow,
  nowOnAxis,
  resolveFamilyDay,
  tickLabel,
  tomorrowFromMinutes,
  type FamilyDayPerson,
} from '../timetable-day';

// ---------------------------------------------------------------------------
// The sample household the H frames were drawn from: two schools, five kids.
// ---------------------------------------------------------------------------

const DATA = household as unknown as TimetableData;
const ZONE = 'Europe/Berlin';

/** Berlin wall time as an instant: CEST in September is UTC+2, CET in February UTC+1. */
function berlin(date: string, time: string): Date {
  const summer = date >= '2026-03-29' && date < '2026-10-25' || date >= '2027-03-28';
  return new Date(`${date}T${time}:00${summer ? '+02:00' : '+01:00'}`);
}

function person(
  memberId: string,
  overrides: Omit<Partial<FamilyDayPerson>, 'school'> & { school?: Partial<TimetableSchool> } = {},
): FamilyDayPerson {
  const timetable = DATA.timetables.find((t) => t.memberId === memberId)!;
  const base = DATA.schools.find((s) => s.id === timetable.schoolId)!;
  const { school: schoolOverrides, ...rest } = overrides;
  const school: TimetableSchool = { ...base, ...(schoolOverrides ?? {}) };
  return { ...rest, school, timetable, subjects: DATA.subjects };
}

const THREE = () => [person('leon'), person('emma'), person('mia')];

describe('tomorrowFromMinutes', () => {
  it('reads HH:MM and falls back to 16:00 for anything else', () => {
    expect(tomorrowFromMinutes('14:30')).toBe(14 * 60 + 30);
    expect(tomorrowFromMinutes(' 09:05 ')).toBe(9 * 60 + 5);
    expect(tomorrowFromMinutes(undefined)).toBe(16 * 60);
    expect(tomorrowFromMinutes('')).toBe(16 * 60);
    expect(tomorrowFromMinutes('late')).toBe(16 * 60);
    expect(tomorrowFromMinutes('25:00')).toBe(16 * 60);
  });
});

describe('resolveFamilyDay', () => {
  it('shows today before the switch time on a school day', () => {
    const day = resolveFamilyDay(berlin('2026-09-10', '07:10'), ZONE, THREE());
    expect(day).toEqual({ date: '2026-09-10', labelKind: 'today', weekNumber: 37 });
  });

  it('moves on to tomorrow at the switch time exactly, and stays there', () => {
    expect(resolveFamilyDay(berlin('2026-09-10', '16:00'), ZONE, THREE())?.date).toBe('2026-09-11');
    expect(resolveFamilyDay(berlin('2026-09-10', '16:00'), ZONE, THREE())?.labelKind).toBe('tomorrow');
    expect(resolveFamilyDay(berlin('2026-09-10', '23:59'), ZONE, THREE())?.date).toBe('2026-09-11');
    expect(resolveFamilyDay(berlin('2026-09-10', '15:59'), ZONE, THREE())?.date).toBe('2026-09-10');
  });

  it('honours the household switch time and shrugs off a malformed one', () => {
    expect(resolveFamilyDay(berlin('2026-09-10', '13:00'), ZONE, THREE(), '12:30')?.date).toBe('2026-09-11');
    expect(resolveFamilyDay(berlin('2026-09-10', '13:00'), ZONE, THREE(), 'soon')?.date).toBe('2026-09-10');
  });

  it('shows Monday from Friday evening and all weekend, named by its weekday', () => {
    const friday = resolveFamilyDay(berlin('2026-09-11', '19:10'), ZONE, THREE());
    expect(friday).toEqual({ date: '2026-09-14', labelKind: 'weekday', weekNumber: 38 });
    expect(resolveFamilyDay(berlin('2026-09-12', '09:00'), ZONE, THREE())?.date).toBe('2026-09-14');
    expect(resolveFamilyDay(berlin('2026-09-13', '09:00'), ZONE, THREE())?.labelKind).toBe('tomorrow');
  });

  it('flips the week letter with the ISO week', () => {
    // Week 38 is even, and the Gymnasium's odd weeks are A.
    const monday = familyDayRow(person('leon'), '2026-09-14');
    expect(monday.weekLetter).toBe('B');
    expect(familyDayRow(person('leon'), '2026-09-11').weekLetter).toBe('A');
    // The Grundschule runs one week only, so Mia's row carries no letter.
    expect(familyDayRow(person('mia'), '2026-09-14').weekLetter).toBeUndefined();
  });

  it('skips a holiday for everyone to the first day back, spelled as a date', () => {
    const holiday = [{ name: 'Herbstferien', start: '2026-10-17', end: '2026-10-31' }];
    const people = THREE().map((p) => ({ ...p, schoolHolidays: holiday }));
    const day = resolveFamilyDay(berlin('2026-10-20', '19:10'), ZONE, people);
    expect(day).toEqual({ date: '2026-11-02', labelKind: 'date', weekNumber: 45 });
  });

  it('keeps the date when only one school is on holiday, and closes that row', () => {
    const holiday = [{ name: 'Herbstferien', start: '2026-09-11', end: '2026-09-11' }];
    const leon = { ...person('leon'), schoolHolidays: holiday };
    const emma = { ...person('emma'), schoolHolidays: holiday };
    const mia = person('mia');
    const day = resolveFamilyDay(berlin('2026-09-10', '19:10'), ZONE, [leon, emma, mia]);
    expect(day?.date).toBe('2026-09-11');
    expect(familyDayRow(leon, '2026-09-11').closed).toBe('Herbstferien');
    expect(familyDayRow(mia, '2026-09-11').closed).toBeUndefined();
  });

  it('skips a public holiday nobody has school on', () => {
    const publicHolidays = [{ date: '2026-09-10', name: 'Tag der Einheit' }];
    const people = THREE().map((p) => ({ ...p, publicHolidays }));
    expect(resolveFamilyDay(berlin('2026-09-10', '07:10'), ZONE, people)?.date).toBe('2026-09-11');
  });

  it('skips a day off at one school when nobody else has lessons that day', () => {
    // Leon alone, and his school has Friday off.
    const leon = person('leon', { school: { specialDays: [{ date: '2026-09-11', label: 'Pädagogischer Tag', kind: 'off' }] } });
    const day = resolveFamilyDay(berlin('2026-09-10', '19:10'), ZONE, [leon]);
    expect(day).toEqual({ date: '2026-09-14', labelKind: 'weekday', weekNumber: 38 });
  });

  it('reads the date on the display clock, not the hub clock', () => {
    // 23:30 UTC on Thursday is 01:30 Friday in Berlin: past the switch, it is
    // Friday already, so the card shows Friday as today.
    const day = resolveFamilyDay(new Date('2026-09-10T23:30:00Z'), ZONE, THREE());
    expect(day?.date).toBe('2026-09-11');
    expect(day?.labelKind).toBe('today');
    // Read on UTC the same instant is Thursday evening, and Friday is tomorrow.
    expect(resolveFamilyDay(new Date('2026-09-10T23:30:00Z'), 'UTC', THREE())?.labelKind).toBe('tomorrow');
  });

  it('returns null for nobody, and for people with empty weeks', () => {
    expect(resolveFamilyDay(berlin('2026-09-10', '07:10'), ZONE, [])).toBeNull();
    const empty: FamilyDayPerson = { ...person('leon'), timetable: { ...person('leon').timetable, weeks: { A: {} } } };
    expect(resolveFamilyDay(berlin('2026-09-10', '07:10'), ZONE, [empty])).toBeNull();
  });
});

describe('familyDayRow', () => {
  it('draws a plain day: blocks in order, the span, and care from the last bell', () => {
    const row = familyDayRow(person('mia'), '2026-09-11');
    expect(row.closed).toBeUndefined();
    expect(row.span).toEqual({ start: '08:15', end: '12:45' });
    expect(row.blocks.map((b) => b.kind)).toEqual(['lesson', 'lesson', 'lesson', 'lesson', 'lesson', 'care']);
    expect(row.care).toEqual({ name: 'OGS', from: '12:45', until: '15:00' });
    const care = row.blocks[row.blocks.length - 1];
    expect(care.startMin).toBe(12 * 60 + 45);
    expect(care.endMin).toBe(15 * 60);
    expect(row.lateStart).toBeUndefined();
    expect(row.cutAt).toBeUndefined();
  });

  it('merges a double into one block and packs its item once', () => {
    const row = familyDayRow(person('leon'), '2026-09-11');
    const sport = row.blocks.find((b) => b.kind === 'lesson' && b.subject.code === 'Sp');
    expect(sport?.kind === 'lesson' && sport.periods).toEqual([5, 6]);
    expect(row.bring).toEqual(['Sportzeug']);
    expect(row.span).toEqual({ start: '07:50', end: '13:15' });
  });

  it('keeps a free first period and says when the day really starts', () => {
    const row = familyDayRow(person('leon'), '2026-09-10');
    expect(row.blocks[0].kind).toBe('free');
    expect(row.lateStart).toBe('08:40');
    expect(row.span?.start).toBe('08:40');
    // Erdkunde's atlas is in the bag; nothing else on the day carries an item.
    expect(row.bring).toEqual(['Atlas']);
  });

  it('marks everything after the cut off, ends at the bell, and splits a straddling double', () => {
    const emma = person('emma', {
      school: { specialDays: [{ date: '2026-09-11', label: 'Weiberfastnacht', kind: 'ends-after', period: 3 }] },
    });
    const row = familyDayRow(emma, '2026-09-11');
    // Emma's Friday: Ph, Bio, Ch Ch (a double over periods 3 and 4), Deu, Ge.
    const kinds = row.blocks.map((b) => (b.kind === 'lesson' ? `${b.subject.code}${b.off ? '-' : ''}` : b.kind));
    expect(kinds).toEqual(['Ph', 'Bio', 'Ch', 'Ch-', 'Deu-', 'Ge-']);
    expect(row.span).toEqual({ start: '07:50', end: '10:30' });
    expect(row.cutAt).toBe('10:30');
    expect(row.usualEnd).toBe('13:15');
    expect(row.shortLabel).toBe('Weiberfastnacht');
  });

  it('starts care at the cut on a short day and drops the lessons it covers', () => {
    const mia = person('mia', {
      school: { specialDays: [{ date: '2026-09-10', label: 'Weiberfastnacht', kind: 'ends-after', period: 4 }] },
    });
    const row = familyDayRow(mia, '2026-09-10');
    expect(row.span).toEqual({ start: '08:15', end: '11:45' });
    expect(row.care).toEqual({ name: 'OGS', from: '11:45', until: '16:00' });
    // Period 5 (Sport, 12:00) falls under the care band and is not drawn.
    expect(row.blocks.some((b) => b.off)).toBe(false);
    expect(row.blocks[row.blocks.length - 1].kind).toBe('care');
    // Sport is off, so the Sportzeug stays home.
    expect(row.bring).toEqual([]);
  });

  it('gives a closed row its reason and nothing else', () => {
    const leon = person('leon', { school: { specialDays: [{ date: '2026-09-11', label: 'Pädagogischer Tag', kind: 'off' }] } });
    const row = familyDayRow(leon, '2026-09-11');
    // The week letter stays, so the header can still say which week it is.
    expect(row).toEqual({ closed: 'Pädagogischer Tag', blocks: [], bring: [], extras: [], weekLetter: 'A' });
  });

  it('dedupes a bring item that two lessons share', () => {
    // Mia's Monday: Sport twice in a row is one double and one Sportzeug; make
    // it two separate Sport lessons to prove the dedupe rather than the merge.
    const base = person('mia');
    const timetable = {
      ...base.timetable,
      weeks: { A: { ...base.timetable.weeks.A, mon: { 1: { subjectId: 'sp' }, 2: { subjectId: 'deu' }, 3: { subjectId: 'sp' } } } },
    };
    const row = familyDayRow({ ...base, timetable }, '2026-09-14');
    expect(row.blocks.filter((b) => b.kind === 'lesson')).toHaveLength(3);
    expect(row.bring).toEqual(['Sportzeug']);
  });

  it('is empty at the weekend and on a day with no lessons', () => {
    expect(familyDayRow(person('leon'), '2026-09-12')).toEqual({ blocks: [], bring: [], extras: [] });
    const empty = { ...person('leon'), timetable: { ...person('leon').timetable, weeks: { A: {} } } };
    expect(familyDayRow(empty, '2026-09-11')).toEqual({ blocks: [], bring: [], extras: [], weekLetter: 'A' });
  });
});

describe('dayAxis', () => {
  it('rounds out to the half hour with a lead, care included', () => {
    const rows = [person('leon'), person('emma'), person('mia')].map((p) => familyDayRow(p, '2026-09-11'));
    const axis = dayAxis(rows);
    // Earliest 07:50 less 12 rounds down to 07:30; latest is Mia's OGS at
    // 15:00, plus 12 rounds up to 15:30.
    expect(axis.startMin).toBe(7 * 60 + 30);
    expect(axis.endMin).toBe(15 * 60 + 30);
    expect(axis.ticks).toEqual([8, 9, 10, 11, 12, 13, 14, 15].map((h) => h * 60));
  });

  it('never stretches a short day past four hours of clock', () => {
    const emma = person('emma', {
      school: { specialDays: [{ date: '2026-09-11', label: 'kurz', kind: 'ends-after', period: 1 }] },
    });
    const row = familyDayRow(emma, '2026-09-11');
    // Off lessons still sit on the clock, so take the surviving span alone.
    const axis = dayAxis([{ ...row, blocks: row.blocks.filter((b) => !b.off) }]);
    expect(axis.endMin - axis.startMin).toBe(4 * 60);
  });

  it('labels every other hour when asked', () => {
    const rows = [familyDayRow(person('paul'), '2026-09-10')];
    const axis = dayAxis(rows, 120);
    expect(axis.ticks.every((t) => (t / 60) % 2 === 0)).toBe(true);
    expect(axis.ticks.length).toBeGreaterThan(2);
  });

  it('ignores closed rows and falls back to a school morning with nothing on', () => {
    const closed = { closed: 'frei', blocks: [], bring: [], extras: [] };
    // A school morning, rounded out like any other day: 08:00 to 12:00 with the lead.
    expect(dayAxis([closed])).toEqual({ startMin: 7 * 60 + 30, endMin: 12 * 60 + 30, ticks: [8, 9, 10, 11, 12].map((h) => h * 60) });
    expect(axisShare(dayAxis([closed]), 10 * 60)).toBe(0.5);
    expect(axisShare(dayAxis([closed]), 6 * 60)).toBe(0);
    expect(axisShare(dayAxis([closed]), 20 * 60)).toBe(1);
  });
});

describe('nowOnAxis', () => {
  const axis = { startMin: 7 * 60 + 30, endMin: 12 * 60 + 30, ticks: [8, 9, 10, 11, 12].map((h) => h * 60) };

  it('gives the minute on the display clock while it is inside the axis', () => {
    expect(nowOnAxis(new Date('2026-09-10T07:52:30Z'), 'Europe/Berlin', axis)).toBe(9 * 60 + 52);
    // The ends count: the first and last minute of the axis still draw.
    expect(nowOnAxis(new Date('2026-09-10T05:30:00Z'), 'Europe/Berlin', axis)).toBe(7 * 60 + 30);
    expect(nowOnAxis(new Date('2026-09-10T10:30:00Z'), 'Europe/Berlin', axis)).toBe(12 * 60 + 30);
  });

  it('is null before the clock starts and after it ends', () => {
    expect(nowOnAxis(new Date('2026-09-10T05:10:00Z'), 'Europe/Berlin', axis)).toBeNull();
    expect(nowOnAxis(new Date('2026-09-10T17:10:00Z'), 'Europe/Berlin', axis)).toBeNull();
    // Same instant, another wall: 09:52 in Berlin is 02:52 in Minnesota.
    expect(nowOnAxis(new Date('2026-09-10T07:52:00Z'), 'America/Chicago', axis)).toBeNull();
  });
});

describe('tickLabel', () => {
  it("writes the ruler's hours the way the formatting language does", () => {
    expect(tickLabel(7 * 60, '24h', 'de-DE')).toBe('07:00');
    expect(tickLabel(7 * 60, '24h', 'da-DK')).toBe('07.00');
    expect(tickLabel(7 * 60, '24h', 'es-ES')).toBe('7:00');
    expect(tickLabel(7 * 60, '12h', 'en-US')).toBe('7 AM');
    expect(tickLabel(13 * 60, '12h', 'es-ES')).toBe('1 p. m.');
    expect(tickLabel(13 * 60, '12h', 'da-DK')).toBe('1 PM');
  });
});

describe('familyDayRow with dates to remember', () => {
  const noted = (memberId: string, notes: import('@/types/timetables').TimetableNote[]) => {
    const base = person(memberId);
    return { ...base, timetable: { ...base.timetable, notes } };
  };

  it('marks a test on every lesson in that subject, and puts it on the packing card', () => {
    const leon = noted('leon', [{ id: 'n1', date: '2026-09-11', kind: 'test', subjectId: 'ma', text: 'Mathe-Arbeit' }]);
    const row = familyDayRow(leon, '2026-09-11');
    const maths = row.blocks.find((b) => b.kind === 'lesson' && b.subject.id === 'ma');
    expect(maths?.test).toBe('Mathe-Arbeit');
    expect(row.blocks.filter((b) => b.test !== undefined)).toHaveLength(1);
    expect(row.extras).toEqual([{ kind: 'test', text: 'Mathe-Arbeit' }]);
    // A test on another day leaves this one alone.
    expect(familyDayRow(leon, '2026-09-10').blocks.some((b) => b.test !== undefined)).toBe(false);
  });

  it('lists a one-off thing to bring after the subjects\' own items', () => {
    const mia = noted('mia', [{ id: 'n1', date: '2026-09-10', kind: 'bring', text: 'Wanderschuhe' }]);
    const row = familyDayRow(mia, '2026-09-10');
    expect(row.bring).toEqual(['Sportzeug']);
    expect(row.extras).toEqual([{ kind: 'bring', text: 'Wanderschuhe' }]);
  });

  it('fades a cancelled lesson, moves the end forward, and keeps the usual end', () => {
    // Emma's Friday ends with Deu (5) and Ge (6); the 6th is off.
    const emma = noted('emma', [{ id: 'n1', date: '2026-09-11', kind: 'cancelled', periods: [6] }]);
    const row = familyDayRow(emma, '2026-09-11');
    const kinds = row.blocks.map((b) => (b.kind === 'lesson' ? `${b.subject.code}${b.off ? `-${b.off}` : ''}` : b.kind));
    expect(kinds).toEqual(['Ph', 'Bio', 'Ch', 'Deu', 'Ge-cancelled']);
    expect(row.span).toEqual({ start: '07:50', end: '12:25' });
    expect(row.cutAt).toBe('12:25');
    expect(row.usualEnd).toBe('13:15');
    expect(row.shortLabel).toBeUndefined();
  });

  it('moves the start back when the first lessons are off, and says so', () => {
    const emma = noted('emma', [{ id: 'n1', date: '2026-09-11', kind: 'cancelled', periods: [1, 2] }]);
    const row = familyDayRow(emma, '2026-09-11');
    expect(row.span?.start).toBe('09:45');
    expect(row.lateStart).toBe('09:45');
    expect(row.blocks.slice(0, 2).every((b) => b.off === 'cancelled')).toBe(true);
  });

  it('splits a double when only half of it is off', () => {
    // Emma's Chemie is periods 3 and 4; only the 4th is off.
    const emma = noted('emma', [{ id: 'n1', date: '2026-09-11', kind: 'cancelled', periods: [4] }]);
    const row = familyDayRow(emma, '2026-09-11');
    const chemie = row.blocks.filter((b) => b.kind === 'lesson' && b.subject.code === 'Ch');
    expect(chemie.map((b) => [b.kind === 'lesson' ? b.periods : [], b.off])).toEqual([[[3], undefined], [[4], 'cancelled']]);
  });

  it('keeps the kit at home for a cancelled Sport, and the care starts at the new end', () => {
    // Mia's Thursday ends with Sport (5); OGS then runs from 11:45.
    const mia = noted('mia', [{ id: 'n1', date: '2026-09-10', kind: 'cancelled', periods: [5] }]);
    const row = familyDayRow(mia, '2026-09-10');
    expect(row.bring).toEqual([]);
    expect(row.span?.end).toBe('11:45');
    expect(row.care).toEqual({ name: 'OGS', from: '11:45', until: '16:00' });
    // The cancelled lesson sits under the care band and is not drawn.
    expect(row.blocks.some((b) => b.off === 'cancelled')).toBe(false);
  });

  it('gives a day with every lesson off no start or end, but keeps its notes', () => {
    const leon = noted('leon', [
      { id: 'n1', date: '2026-09-11', kind: 'cancelled', periods: [1, 2, 3, 4, 5, 6] },
      { id: 'n2', date: '2026-09-11', kind: 'bring', text: 'Brotdose' },
    ]);
    const row = familyDayRow(leon, '2026-09-11');
    expect(row.span).toBeUndefined();
    expect(row.closed).toBeUndefined();
    expect(row.blocks.every((b) => b.off === 'cancelled')).toBe(true);
    expect(row.extras).toEqual([{ kind: 'bring', text: 'Brotdose' }]);
  });

  it('ignores a note on a day the school is shut', () => {
    const leon = noted('leon', [{ id: 'n1', date: '2026-09-11', kind: 'test', subjectId: 'ma' }]);
    const shut = { ...leon, school: { ...leon.school, specialDays: [{ date: '2026-09-11', label: 'Pädagogischer Tag', kind: 'off' as const }] } };
    expect(familyDayRow(shut, '2026-09-11').extras).toEqual([]);
  });

  it('does not let a cancelled last lesson hold the card on today past the new end', () => {
    // Leon's Friday normally ends 13:15; with the 6th off it ends 12:25, and
    // at 13:00 with the switch time at 12:30 the card has moved on to Monday.
    const leon = noted('leon', [{ id: 'n1', date: '2026-09-11', kind: 'cancelled', periods: [5, 6] }]);
    expect(resolveFamilyDay(berlin('2026-09-11', '13:00'), ZONE, [leon], '12:30')?.date).toBe('2026-09-14');
  });
});
