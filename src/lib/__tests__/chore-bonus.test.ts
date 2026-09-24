import { describe, expect, it } from 'vitest';
import type { ChoreCompletion, ChoreDefinition, ChoreGrab, ChoreSettings } from '@/types/config';
import {
  atGrabLimit,
  bonusTicketsEarned,
  canPutBack,
  bonusDisplayOrder,
  bonusShowsOn,
  MANUAL_GRAB_DAYS,
  countsSinceReset,
  stampBonusSince,
  bonusCompletionsOn,
  checkBonusComplete,
  checkGrab,
  DEFAULT_CHORE_SETTINGS,
  grabState,
  isValidBonus,
  parseChoreSettings,
  readChoreSettings,
  resolveBonusFor,
  type BonusChore,
  type BonusMarks,
} from '../chore-bonus';
import { buildCompletionSet, choresOwedBy, isAssignedOn, resolveAssignmentsFor } from '../chore-assignments';
import { timestampInTZ } from '../timezone';

// 2026-09-19 is a Saturday; its week runs Monday 14th to Sunday 20th.
const SAT = '2026-09-19';
const SUN = '2026-09-20';
const MON = '2026-09-21';
const WED = '2026-09-16';

const kids = [{ id: 'ada' }, { id: 'bram' }, { id: 'cleo' }];
const KIDS = kids.map((k) => k.id);
const groups = [{ id: 'kids', memberIds: ['ada', 'bram', 'cleo'] }];

function bonus(id: string, over: Partial<ChoreDefinition> = {}, kind: BonusChore['bonus'] = { claim: 'first', comesBack: 'daily' }): BonusChore {
  return {
    id, name: id, emoji: '', points: 5, frequency: 'daily', daysOfWeek: [], timeOfDay: 'anytime',
    assigneeIds: [], assigneeGroupIds: ['kids'], rotation: 'fixed', bonus: kind, ...over,
  } as BonusChore;
}

function marks(completions: ChoreCompletion[] = [], grabs: ChoreGrab[] = [], bonusResets: Record<string, string> = {}): BonusMarks {
  return { completions, grabs, bonusResets };
}

const settings = (over: Partial<ChoreSettings> = {}): ChoreSettings => ({ ...DEFAULT_CHORE_SETTINGS, ...over });

describe('settings', () => {
  it('fills the defaults for anything missing or malformed', () => {
    expect(readChoreSettings(undefined)).toEqual({ grabLimit: 1, grabHold: 'day' });
    expect(readChoreSettings({ grabLimit: 7, grabHold: 'forever' })).toEqual({ grabLimit: 1, grabHold: 'day' });
    expect(readChoreSettings({ grabLimit: 0, grabHold: 'until-back' })).toEqual({ grabLimit: 0, grabHold: 'until-back' });
  });

  it('refuses a save outside the offered choices', () => {
    expect(parseChoreSettings({ grabLimit: 2, grabHold: 'day' })).toEqual({ grabLimit: 2, grabHold: 'day' });
    expect(parseChoreSettings({ grabLimit: 4, grabHold: 'day' })).toBeNull();
    expect(parseChoreSettings({ grabLimit: 1 })).toBeNull();
    expect(parseChoreSettings(null)).toBeNull();
  });

  it('knows a well formed bonus field', () => {
    expect(isValidBonus(undefined)).toBe(true);
    expect(isValidBonus({ claim: 'each', comesBack: 'manual' })).toBe(true);
    expect(isValidBonus({ claim: 'first', comesBack: 'once' })).toBe(false);
    expect(isValidBonus('first')).toBe(false);
  });
});

describe('bonus chores are owed by nobody', () => {
  it('never assigns one, so no count, star or streak sees it', () => {
    const chore = bonus('car');
    expect(isAssignedOn(chore, 'ada', SAT, groups)).toBe(false);
    const set = buildCompletionSet([{ choreId: 'car', memberId: 'ada', date: SAT }]);
    expect(resolveAssignmentsFor([chore], kids.map((k) => ({ ...k, name: k.id, color: '', createdAt: '', updatedAt: '' })), SAT, set, groups)).toEqual([]);
  });
});

describe('not today', () => {
  const chore = { ...bonus('bed'), bonus: undefined, assigneeIds: ['ada', 'bram'], assigneeGroupIds: [] } as ChoreDefinition;

  it('keeps a skipped chore out of what someone owes and apart from done', () => {
    const set = buildCompletionSet([{ choreId: 'bed', memberId: 'ada', date: SAT, status: 'skipped' }]);
    expect(choresOwedBy([chore], 'ada', SAT, set, groups)).toEqual([]);
    expect(choresOwedBy([chore], 'bram', SAT, set, groups)).toEqual([chore]);
    const [ada] = resolveAssignmentsFor([chore], [{ id: 'ada', name: 'Ada', color: '', createdAt: '', updatedAt: '' }], SAT, set, groups);
    expect(ada).toMatchObject({ isSkipped: true, isCompleted: false });
  });
});

describe('up for grabs', () => {
  it('is open, then grabbed, then done', () => {
    const chore = bonus('car');
    expect(grabState(chore, SAT, marks(), 'day', KIDS, SAT)).toEqual({ status: 'open' });
    expect(grabState(chore, SAT, marks([], [{ choreId: 'car', memberId: 'bram', date: SAT }]), 'day', KIDS, SAT))
      .toEqual({ status: 'grabbed', memberId: 'bram' });
    expect(grabState(chore, SAT, marks([{ choreId: 'car', memberId: 'cleo', date: SAT }], [{ choreId: 'car', memberId: 'bram', date: SAT }]), 'day', KIDS, SAT))
      .toEqual({ status: 'done', memberId: 'cleo', date: SAT });
  });

  it('lets a grab lapse at the end of its day, or hold until the chore comes back', () => {
    const weekly = bonus('car', {}, { claim: 'first', comesBack: 'weekly' });
    const grab = [{ choreId: 'car', memberId: 'bram', date: WED }];
    expect(grabState(weekly, SAT, marks([], grab), 'day', KIDS, SAT)).toEqual({ status: 'open' });
    expect(grabState(weekly, SAT, marks([], grab), 'until-back', KIDS, SAT)).toEqual({ status: 'grabbed', memberId: 'bram' });
    // A new week: the chore came back, so the grab is over either way.
    expect(grabState(weekly, MON, marks([], grab), 'until-back', KIDS, MON)).toEqual({ status: 'open' });
  });

  it('stays done for the rest of the week once a weekly one is done', () => {
    const weekly = bonus('car', {}, { claim: 'first', comesBack: 'weekly' });
    const done = [{ choreId: 'car', memberId: 'cleo', date: WED }];
    expect(grabState(weekly, SUN, marks(done), 'day', KIDS, SUN)).toMatchObject({ status: 'done', memberId: 'cleo' });
    expect(grabState(weekly, MON, marks(done), 'day', KIDS, MON)).toEqual({ status: 'open' });
    // A daily one is open again the next day.
    expect(grabState(bonus('car'), SUN, marks([{ choreId: 'car', memberId: 'cleo', date: SAT }]), 'day', KIDS, SUN)).toEqual({ status: 'open' });
  });

  it('stays done until a grown-up puts it back', () => {
    const manual = bonus('garage', {}, { claim: 'first', comesBack: 'manual' });
    const done = [{ choreId: 'garage', memberId: 'ada', date: WED, at: `${WED}T10:00:00.000Z` }];
    expect(grabState(manual, MON, marks(done), 'day', KIDS, MON)).toMatchObject({ status: 'done' });
    expect(grabState(manual, MON, marks(done, [], { garage: `${WED}T12:00:00.000Z` }), 'day', KIDS, MON)).toEqual({ status: 'open' });
    // Done after the reset counts again; an entry with no time compares by day.
    const later = [...done, { choreId: 'garage', memberId: 'bram', date: SAT }];
    expect(bonusCompletionsOn(manual, MON, marks(later, [], { garage: `${WED}T12:00:00.000Z` })).map((c) => c.memberId)).toEqual(['bram']);
  });

  it('refuses a grab someone else holds, one already done, or one past the limit', () => {
    const car = bonus('car');
    const porch = bonus('porch');
    const chores = [car, porch];
    const held = marks([], [{ choreId: 'porch', memberId: 'bram', date: SAT }]);
    expect(checkGrab(car, 'ada', SAT, chores, held, groups, settings())).toBeNull();
    expect(checkGrab(porch, 'ada', SAT, chores, held, groups, settings())).toEqual({ refusal: 'grabbed', memberId: 'bram' });
    expect(checkGrab(porch, 'bram', SAT, chores, held, groups, settings())).toBeNull();
    expect(checkGrab(car, 'bram', SAT, chores, held, groups, settings())).toEqual({ refusal: 'limit' });
    expect(checkGrab(car, 'bram', SAT, chores, held, groups, settings({ grabLimit: 2 }))).toBeNull();
    expect(checkGrab(car, 'bram', SAT, chores, held, groups, settings({ grabLimit: 0 }))).toBeNull();
    expect(checkGrab(car, 'ada', SAT, chores, marks([{ choreId: 'car', memberId: 'cleo', date: SAT }]), groups, settings()))
      .toEqual({ refusal: 'taken', memberId: 'cleo' });
    expect(checkGrab(car, 'mom', SAT, chores, marks(), groups, settings())).toEqual({ refusal: 'not-yours' });
    expect(checkGrab(bonus('sat-only', { daysOfWeek: [6] }), 'ada', SUN, chores, marks(), groups, settings())).toEqual({ refusal: 'not-today' });
    expect(atGrabLimit('bram', chores, SAT, held, settings(), groups)).toBe(true);
  });

  it('lets anyone it is open to finish an open one in one go, and only the holder a grabbed one', () => {
    const car = bonus('car');
    expect(checkBonusComplete(car, 'ada', SAT, marks(), groups, 'day', SAT)).toBeNull();
    const held = marks([], [{ choreId: 'car', memberId: 'bram', date: SAT }]);
    expect(checkBonusComplete(car, 'ada', SAT, held, groups, 'day', SAT)).toEqual({ refusal: 'grabbed', memberId: 'bram' });
    expect(checkBonusComplete(car, 'bram', SAT, held, groups, 'day', SAT)).toBeNull();
    expect(checkBonusComplete(car, 'ada', SAT, marks([{ choreId: 'car', memberId: 'cleo', date: SAT }]), groups, 'day', SAT))
      .toEqual({ refusal: 'taken', memberId: 'cleo' });
    expect(checkBonusComplete(car, 'mom', SAT, marks(), groups, 'day', SAT)).toEqual({ refusal: 'not-yours' });
  });
});

describe('a done put-back chore after its day', () => {
  it('waits out of sight once the day it was done is over, and not before', () => {
    const garage = bonus('garage', {}, { claim: 'first', comesBack: 'manual' });
    const doneSat = marks([{ choreId: 'garage', memberId: 'ada', date: SAT }]);
    expect(resolveBonusFor([garage], kids, SAT, doneSat, groups, settings(), SAT)[0].waiting).toBe(false);
    expect(resolveBonusFor([garage], kids, SUN, doneSat, groups, settings(), SUN)[0].waiting).toBe(true);
    // A chore that comes back by itself never waits.
    const weekly = bonus('car', {}, { claim: 'first', comesBack: 'weekly' });
    expect(resolveBonusFor([weekly], kids, SUN, marks([{ choreId: 'car', memberId: 'ada', date: SAT }]), groups, settings(), SUN)[0].waiting).toBe(false);
  });

  it('waits for an everyone-can one only when everyone has done it', () => {
    const tidy = bonus('tidy', {}, { claim: 'each', comesBack: 'manual' });
    const some = marks([{ choreId: 'tidy', memberId: 'ada', date: SAT }, { choreId: 'tidy', memberId: 'bram', date: SAT }]);
    expect(resolveBonusFor([tidy], kids, SUN, some, groups, settings(), SUN)[0].waiting).toBe(false);
    const all = marks([...some.completions, { choreId: 'tidy', memberId: 'cleo', date: SAT }]);
    expect(resolveBonusFor([tidy], kids, SUN, all, groups, settings(), SUN)[0].waiting).toBe(true);
  });
});

describe('putting a bonus chore back', () => {
  it('is offered once someone has done a when-I-put-it-back chore, of either kind', () => {
    const grab = bonus('garage', {}, { claim: 'first', comesBack: 'manual' });
    const each = bonus('tidy', {}, { claim: 'each', comesBack: 'manual' });
    const done = marks([{ choreId: 'garage', memberId: 'ada', date: SAT }, { choreId: 'tidy', memberId: 'bram', date: SAT }]);
    const [g, e] = resolveBonusFor([grab, each], kids, SAT, done, groups, settings(), SAT);
    expect(canPutBack(g)).toBe(true);
    expect(canPutBack(e)).toBe(true);
    const [openG, openE] = resolveBonusFor([grab, each], kids, SAT, marks(), groups, settings(), SAT);
    expect(canPutBack(openG)).toBe(false);
    expect(canPutBack(openE)).toBe(false);
    // A daily one comes back by itself; there is nothing to put back.
    const [daily] = resolveBonusFor([bonus('car')], kids, SAT, marks([{ choreId: 'car', memberId: 'ada', date: SAT }]), groups, settings(), SAT);
    expect(canPutBack(daily)).toBe(false);
  });
});

describe('bonus tickets earned', () => {
  it('adds up what bonus chores paid on the given days, and nothing for a not today or a regular chore', () => {
    const regular = { ...bonus('bed'), bonus: undefined } as ChoreDefinition;
    const earned = bonusTicketsEarned([bonus('car'), regular], 'ada', [SAT, SUN], [
      { choreId: 'car', memberId: 'ada', date: SAT },
      { choreId: 'car', memberId: 'ada', date: MON },
      { choreId: 'bed', memberId: 'ada', date: SAT },
      { choreId: 'car', memberId: 'bram', date: SAT },
    ]);
    expect(earned).toBe(5);
  });
});

describe('everyone can', () => {
  it('lets each person do it once per time round', () => {
    const read = bonus('read', {}, { claim: 'each', comesBack: 'weekly' });
    const done = marks([{ choreId: 'read', memberId: 'ada', date: WED }]);
    expect(checkBonusComplete(read, 'ada', SAT, done, groups, 'day', SAT)).toEqual({ already: true });
    expect(checkBonusComplete(read, 'bram', SAT, done, groups, 'day', SAT)).toBeNull();
  });

  it('resolves who did it and who it is open to', () => {
    const read = bonus('read', {}, { claim: 'each', comesBack: 'daily' });
    const [item] = resolveBonusFor([read], kids, SAT, marks([{ choreId: 'read', memberId: 'bram', date: SAT }]), groups, settings(), SAT);
    expect(item.eligibleIds).toEqual(['ada', 'bram', 'cleo']);
    expect(item.doneIds).toEqual(['bram']);
    expect(item.grab).toBeUndefined();
  });

  it('leaves out a bonus chore nobody in the family can do, or one not on that day', () => {
    const nobody = bonus('x', { assigneeGroupIds: [] });
    const sunday = bonus('y', { daysOfWeek: [0] });
    expect(resolveBonusFor([nobody, sunday], kids, SAT, marks(), groups, settings(), SAT)).toEqual([]);
  });
});

describe('scenario bugs from plan 108', () => {
  it('1: a chore that just became a bonus chore does not count ticks from before', () => {
    const car = bonus('car', {}, { claim: 'first', comesBack: 'manual', since: `${SAT}T12:00:00.000Z` });
    expect(countsSinceReset(car, { date: SAT, at: `${SAT}T08:00:00.000Z` }, {})).toBe(false);
    expect(countsSinceReset(car, { date: WED }, {})).toBe(false);
    expect(countsSinceReset(car, { date: SAT, at: `${SAT}T13:00:00.000Z` }, {})).toBe(true);
    const weekly = bonus('car', {}, { claim: 'first', comesBack: 'weekly', since: `${SAT}T12:00:00.000Z` });
    expect(grabState(weekly, SAT, marks([{ choreId: 'car', memberId: 'ada', date: SAT, at: `${SAT}T08:00:00.000Z` }]), 'day', kids.map((k) => k.id), SAT))
      .toEqual({ status: 'open' });
  });

  it('1: the hub stamps a chore that became a bonus chore, and keeps the stamp through any later change', () => {
    const regular = { ...bonus('car'), bonus: undefined } as ChoreDefinition;
    const NOW = '2026-09-23T07:00:00.000Z';
    const [made] = stampBonusSince([bonus('car')], [regular], NOW);
    expect(made.bonus?.since).toBe(NOW);
    const kept = { ...bonus('car'), bonus: { claim: 'first' as const, comesBack: 'daily' as const, since: 'old' } };
    const [same] = stampBonusSince([{ ...kept, bonus: { ...kept.bonus, since: 'phone' } }], [kept], NOW);
    expect(same.bonus?.since).toBe('old');
    // Changing how it comes back must not reopen (and repay) a job done this morning.
    const [changed] = stampBonusSince([{ ...kept, bonus: { claim: 'first', comesBack: 'weekly' } }], [kept], NOW);
    expect(changed.bonus?.since).toBe('old');
    expect(stampBonusSince([regular], [kept], NOW)[0].bonus).toBeUndefined();
  });

  it('2: a grab on a chore that is not on today does not count toward the limit', () => {
    // Monday and Saturday, once a week; Ada grabs it Monday and the grab lasts until the chore comes back.
    const car = bonus('car', { daysOfWeek: [1, 6] }, { claim: 'first', comesBack: 'weekly' });
    const porch = bonus('porch');
    const held = marks([], [{ choreId: 'car', memberId: 'ada', date: '2026-09-14' }]);
    const untilBack = settings({ grabHold: 'until-back' });
    expect(atGrabLimit('ada', [car, porch], WED, held, untilBack, groups)).toBe(false);
    expect(atGrabLimit('ada', [car, porch], SAT, held, untilBack, groups)).toBe(true);
  });

  it('5: a grab by someone the chore is no longer open to does not count', () => {
    const porch = bonus('porch');
    const stale = marks([], [{ choreId: 'porch', memberId: 'gone', date: SAT }]);
    expect(grabState(porch, SAT, stale, 'day', kids.map((k) => k.id), SAT)).toEqual({ status: 'open' });
    expect(checkGrab(porch, 'ada', SAT, [porch], stale, groups, settings())).toBeNull();
    expect(resolveBonusFor([porch], kids, SAT, stale, groups, settings(), SAT)[0].grab).toEqual({ status: 'open' });
  });

  it('7: grabs only matter today; a past day is never locked by an old grab', () => {
    const porch = bonus('porch');
    const oldGrab = marks([], [{ choreId: 'porch', memberId: 'cleo', date: SAT }]);
    expect(checkBonusComplete(porch, 'bram', SAT, oldGrab, groups, 'day', MON)).toBeNull();
    expect(resolveBonusFor([porch], kids, SAT, oldGrab, groups, settings(), MON)[0].grab).toEqual({ status: 'open' });
    // Today it still holds.
    expect(checkBonusComplete(porch, 'bram', SAT, oldGrab, groups, 'day', SAT)).toEqual({ refusal: 'grabbed', memberId: 'cleo' });
  });
});

describe('plan 109 rules', () => {
  it('9: a put-back only changes the day it was made and later ones', () => {
    const garage = bonus('garage', {}, { claim: 'first', comesBack: 'manual' });
    const doneMon = marks([{ choreId: 'garage', memberId: 'ada', date: '2026-09-14', at: '2026-09-14T10:00:00' }], [], { garage: '2026-09-16T12:00:00' });
    expect(grabState(garage, '2026-09-14', doneMon, 'day', KIDS, SAT).status).toBe('done');
    expect(grabState(garage, '2026-09-15', doneMon, 'day', KIDS, SAT).status).toBe('done');
    expect(grabState(garage, '2026-09-16', doneMon, 'day', KIDS, SAT).status).toBe('open');
  });

  it('4: a bonus chore shows on its days whatever regular frequency it kept', () => {
    const once = bonus('car', { frequency: 'once', specificDate: '2026-01-01', daysOfWeek: [6] });
    expect(bonusShowsOn(once, SAT)).toBe(true);
    expect(bonusShowsOn(once, SUN)).toBe(false);
    expect(resolveBonusFor([once], kids, SAT, marks(), groups, settings(), SAT)).toHaveLength(1);
  });

  it('37: under "until it comes back" a put-back chore\'s grab lasts a week', () => {
    const garage = bonus('garage', {}, { claim: 'first', comesBack: 'manual' });
    const grabbed = (date: string) => marks([], [{ choreId: 'garage', memberId: 'ada', date }]);
    expect(MANUAL_GRAB_DAYS).toBe(7);
    expect(grabState(garage, SAT, grabbed('2026-09-13'), 'until-back', KIDS, SAT).status).toBe('grabbed');
    expect(grabState(garage, SAT, grabbed('2026-09-12'), 'until-back', KIDS, SAT).status).toBe('open');
  });

  it('a put-back chore\'s grab always reaches the chore\'s next day', () => {
    const lawn = bonus('lawn', { daysOfWeek: [6] }, { claim: 'first', comesBack: 'manual' });
    const grabbed = (date: string) => marks([], [{ choreId: 'lawn', memberId: 'ada', date }]);
    // Grabbed last Saturday: this Saturday is its next day, a week and a day on.
    expect(grabState(lawn, SAT, grabbed('2026-09-12'), 'until-back', KIDS, SAT).status).toBe('grabbed');
    // Grabbed two Saturdays ago: last Saturday came and went.
    expect(grabState(lawn, SAT, grabbed('2026-09-05'), 'until-back', KIDS, SAT).status).toBe('open');
  });

  it('an earlier day of today\'s time round is drawn as the round stands now', () => {
    const car = bonus('car', {}, { claim: 'first', comesBack: 'weekly' });
    const read = bonus('read', {}, { claim: 'each', comesBack: 'weekly' });
    // Today is Saturday; Wednesday is in the same week.
    const doneSat = marks([{ choreId: 'car', memberId: 'bram', date: SAT }, { choreId: 'read', memberId: 'ada', date: SAT }]);
    const [carWed, readWed] = resolveBonusFor([car, read], kids, WED, doneSat, groups, settings(), SAT);
    expect(carWed.grab).toEqual({ status: 'done', memberId: 'bram', date: SAT });
    expect(carWed.roundIsToday).toBe(true);
    expect(readWed.doneOn).toEqual({ ada: SAT });
    const heldSat = marks([], [{ choreId: 'car', memberId: 'ada', date: SAT }]);
    expect(grabState(car, WED, heldSat, 'day', KIDS, SAT)).toEqual({ status: 'grabbed', memberId: 'ada' });
    // A daily chore's Wednesday is its own round: drawn as it stood.
    const porch = bonus('porch');
    expect(resolveBonusFor([porch], kids, WED, marks([{ choreId: 'porch', memberId: 'bram', date: SAT }]), groups, settings(), SAT)[0])
      .toMatchObject({ grab: { status: 'open' }, roundIsToday: false });
  });

  it('a grabbed chore not on today is still finished from its own days', () => {
    // Monday and Wednesday only; today is Saturday of the same week.
    const bins = bonus('bins', { daysOfWeek: [1, 3] }, { claim: 'first', comesBack: 'weekly' });
    const [wed] = resolveBonusFor([bins], kids, WED, marks(), groups, settings(), SAT);
    expect(wed.roundIsToday).toBe(false);
  });

  it('draws any earlier day with its whole round, and a held chore not on today on its own days', () => {
    const car = bonus('car', {}, { claim: 'first', comesBack: 'weekly' });
    // Last week: done on Saturday; its Wednesday reads done by Bram, as a tick there is judged.
    const lastWeek = marks([{ choreId: 'car', memberId: 'bram', date: SAT }]);
    expect(grabState(car, WED, lastWeek, 'day', KIDS, MON)).toEqual({ status: 'done', memberId: 'bram', date: SAT });
    // Mon and Wed only, grabbed Wednesday, held until it comes back; today is Saturday.
    const bins = bonus('bins', { daysOfWeek: [1, 3] }, { claim: 'first', comesBack: 'weekly' });
    const held = marks([], [{ choreId: 'bins', memberId: 'ada', date: WED }]);
    const [wed] = resolveBonusFor([bins], kids, WED, held, groups, settings({ grabHold: 'until-back' }), SAT);
    expect(wed).toMatchObject({ grab: { status: 'grabbed', memberId: 'ada' }, roundIsToday: false });
  });

  it('reads a put-back stamped in the hub\'s offset on the hub\'s day, whatever the reader\'s clock', () => {
    const garage = bonus('garage', {}, { claim: 'first', comesBack: 'manual' });
    // Put back Wednesday 21:00 in Chicago, which is already Thursday in UTC.
    const resets = { garage: '2026-09-16T21:00:00.000-05:00' };
    const done = { date: '2026-09-15', at: '2026-09-15T14:00:00.000Z' };
    expect(countsSinceReset(garage, done, resets, WED)).toBe(false);
    expect(countsSinceReset(garage, done, resets, '2026-09-15')).toBe(true);
    // 02:05 UTC on the 17th is still the 16th in Chicago, and the stamp says so.
    expect(timestampInTZ(new Date('2026-09-17T02:05:00.000Z'), 'America/Chicago')).toBe('2026-09-16T21:05:00.000-05:00');
    expect(timestampInTZ(new Date('2026-09-17T02:05:00.000Z'), 'Pacific/Kiritimati')).toBe('2026-09-17T16:05:00.000+14:00');
    // Milliseconds kept: a tick made in the same second sorts before the stamp.
    expect(timestampInTZ(new Date('2026-09-17T02:05:00.405Z'), 'America/Chicago')).toBe('2026-09-16T21:05:00.405-05:00');
    expect(Date.parse(timestampInTZ(new Date('2026-09-17T02:05:00.405Z'), 'America/Chicago'))).toBe(Date.parse('2026-09-17T02:05:00.405Z'));
  });

  it('treats work dated after today as today\'s, after the household\'s day steps back', () => {
    // Today is Wednesday; the time zone was just moved back from Thursday.
    const car = bonus('car', {}, { claim: 'first', comesBack: 'weekly' });
    const thu = '2026-09-17';
    expect(grabState(car, WED, marks([{ choreId: 'car', memberId: 'bram', date: thu }]), 'day', KIDS, WED))
      .toEqual({ status: 'done', memberId: 'bram', date: thu });
    expect(grabState(car, WED, marks([], [{ choreId: 'car', memberId: 'ada', date: thu }]), 'day', KIDS, WED))
      .toEqual({ status: 'grabbed', memberId: 'ada' });
    // A put-back stamped Thursday reopens it today.
    const garage = bonus('garage', {}, { claim: 'first', comesBack: 'manual' });
    const reopened = { completions: [{ choreId: 'garage', memberId: 'bram', date: WED, at: '2026-09-16T10:00:00.000Z' }], grabs: [], bonusResets: { garage: '2026-09-17T08:00:00.000+14:00' } };
    expect(grabState(garage, WED, reopened, 'day', KIDS, WED)).toEqual({ status: 'open' });
  });

  it('2: the newest grab wins over an older one still in the file', () => {
    const porch = bonus('porch', {}, { claim: 'first', comesBack: 'weekly' });
    const two = marks([], [{ choreId: 'porch', memberId: 'ada', date: WED }, { choreId: 'porch', memberId: 'bram', date: SAT }]);
    expect(grabState(porch, SAT, two, 'until-back', KIDS, SAT)).toEqual({ status: 'grabbed', memberId: 'bram' });
  });

  it('5: a wall with limited room shows grabbed chores first and finished ones last', () => {
    const items = resolveBonusFor(
      [bonus('done'), bonus('open'), bonus('each', {}, { claim: 'each', comesBack: 'daily' }), bonus('held')],
      kids, SAT,
      marks([{ choreId: 'done', memberId: 'ada', date: SAT }], [{ choreId: 'held', memberId: 'bram', date: SAT }]),
      groups, settings(), SAT,
    );
    expect(bonusDisplayOrder(items).map((i) => i.chore.id)).toEqual(['held', 'open', 'each', 'done']);
  });

  it('8: an everyone-can chore knows the day each person did it', () => {
    const windows = bonus('windows', {}, { claim: 'each', comesBack: 'weekly' });
    const [item] = resolveBonusFor([windows], kids, SAT, marks([{ choreId: 'windows', memberId: 'cleo', date: WED }]), groups, settings(), SAT);
    expect(item.doneOn).toEqual({ cleo: WED });
  });
});
