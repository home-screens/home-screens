import type { FamilyMember } from '@/types/family';
import type {
  ChoreBonus,
  ChoreCompletion,
  ChoreDefinition,
  ChoreGrab,
  ChoreGrabHold,
  ChoreSettings,
} from '@/types/config';
import { choreAssigneeIds, localDateStr, parseISO, type ChoreGroup } from './chore-assignments';

/**
 * The rules for bonus chores: extras that only earn tickets.
 *
 * Every surface that shows a bonus chore (the wall, the card chart, the phone)
 * and every route that writes one (ticking it, grabbing it) asks the same
 * questions: is it open, who has grabbed it, who did it, may this person grab
 * or finish it now. The answers live here, as pure functions over the stored
 * lists, so a fix cannot land on one surface and not another.
 *
 * A bonus chore is never "assigned": `isAssignedOn` says no to every one, which
 * is what keeps them out of every count, star and streak.
 */

export const DEFAULT_CHORE_SETTINGS: ChoreSettings = { grabLimit: 1, grabHold: 'day' };

/** The grab limits the settings offer, in the order they are shown; 0 is "no limit". */
export const GRAB_LIMIT_CHOICES = [1, 2, 3, 0] as const;

export const GRAB_HOLD_CHOICES: readonly ChoreGrabHold[] = ['day', 'until-back'];

export type BonusChore = ChoreDefinition & { bonus: ChoreBonus };

export function isBonusChore(chore: ChoreDefinition): chore is BonusChore {
  return !!chore.bonus;
}

/** Settings as saved, or the defaults for anything missing or malformed. */
export function readChoreSettings(raw: unknown): ChoreSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ChoreSettings, unknown>>;
  const grabLimit = (GRAB_LIMIT_CHOICES as readonly unknown[]).includes(value.grabLimit)
    ? value.grabLimit as number
    : DEFAULT_CHORE_SETTINGS.grabLimit;
  const grabHold = (GRAB_HOLD_CHOICES as readonly unknown[]).includes(value.grabHold)
    ? value.grabHold as ChoreGrabHold
    : DEFAULT_CHORE_SETTINGS.grabHold;
  return { grabLimit, grabHold };
}

/** Settings a save may store, or null when the body is not a valid set of settings. */
export function parseChoreSettings(raw: unknown): ChoreSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!(GRAB_LIMIT_CHOICES as readonly unknown[]).includes(value.grabLimit)) return null;
  if (!(GRAB_HOLD_CHOICES as readonly unknown[]).includes(value.grabHold)) return null;
  return { grabLimit: value.grabLimit as number, grabHold: value.grabHold as ChoreGrabHold };
}

/** Whether a saved `bonus` field is well formed. */
export function isValidBonus(value: unknown): value is ChoreBonus {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object') return false;
  const bonus = value as Record<string, unknown>;
  return (bonus.claim === 'first' || bonus.claim === 'each')
    && (bonus.comesBack === 'daily' || bonus.comesBack === 'weekly' || bonus.comesBack === 'manual')
    && (bonus.since === undefined || typeof bonus.since === 'string');
}

/**
 * Whether a bonus chore shows up on `date`: on its days, or every day when it
 * names none. A bonus chore ignores the regular fields it keeps from its
 * regular life (frequency, a one-time date, rotation, a schedule grid), so
 * switching it back to regular gets them back untouched.
 */
export function bonusShowsOn(chore: ChoreDefinition, date: string): boolean {
  return chore.daysOfWeek.length === 0 || chore.daysOfWeek.includes(parseISO(date).getDay());
}

/**
 * The calendar day an ISO timestamp falls on for the household. A stamp the
 * hub wrote in the household's offset (`householdTimestamp`) carries that day in its first
 * ten characters, whatever clock the screen reading it is on; an older UTC
 * stamp falls back to the reader's own day.
 */
function localDayOf(iso: string): string {
  return /[+-]\d\d:\d\d$/.test(iso) ? iso.slice(0, 10) : localDateStr(new Date(iso));
}

/** The Monday of the week holding `date`: weeks run Monday to Sunday, as they do for rotation. */
function mondayOf(date: string): string {
  const d = parseISO(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDateStr(d);
}

/**
 * The first day whose finished completions still count on `date`, or null for
 * a chore that stays done until a grown-up puts it back.
 */
export function bonusPeriodStart(chore: BonusChore, date: string): string | null {
  switch (chore.bonus.comesBack) {
    case 'daily': return date;
    case 'weekly': return mondayOf(date);
    case 'manual': return null;
  }
}

/**
 * The last day of the time round holding `date`, or null for a chore that
 * stays done until a grown-up puts it back.
 */
function bonusPeriodEnd(chore: BonusChore, date: string): string | null {
  switch (chore.bonus.comesBack) {
    case 'daily': return date;
    case 'weekly': {
      const d = parseISO(mondayOf(date));
      d.setDate(d.getDate() + 6);
      return localDateStr(d);
    }
    case 'manual': return null;
  }
}

/**
 * Whether a finished completion of a bonus chore still counts: it was done
 * after the chore became a bonus chore (`bonus.since`), and after a grown-up
 * last put it back. A regular chore's completions always count. Entries saved
 * before `at` was recorded compare by day: one from the day of the mark or
 * earlier was done before it.
 *
 * `viewDate` is the day being looked at. A put-back only changes that day and
 * later ones: the day a chore was done still shows it done in the history,
 * whenever it was put back afterwards. Without a day, the put-back applies.
 */
export function countsSinceReset(
  chore: ChoreDefinition,
  completion: Pick<ChoreCompletion, 'date' | 'at'>,
  bonusResets: Readonly<Record<string, string>>,
  viewDate?: string,
): boolean {
  // Instants compare as instants: stamps come in UTC and in the hub's offset.
  const after = (mark: string) => (completion.at ? Date.parse(completion.at) > Date.parse(mark) : completion.date > localDayOf(mark));
  if (chore.bonus?.since && !after(chore.bonus.since)) return false;
  if (chore.bonus?.comesBack !== 'manual') return true;
  const reset = bonusResets[chore.id];
  if (!reset || (viewDate !== undefined && localDayOf(reset) > viewDate)) return true;
  return after(reset);
}

/** Everything saved about who did, grabbed and reopened what. */
export interface BonusMarks {
  completions: readonly ChoreCompletion[];
  grabs: readonly ChoreGrab[];
  /** Chore ID to the ISO time a grown-up last put it back. */
  bonusResets: Readonly<Record<string, string>>;
}

/**
 * The finished completions of `chore` that count on `date`, oldest first.
 *
 * `to-date` is what a screen draws for that day: the time round up to and
 * including it, so a past day shows the chore as it stood then. `whole` is
 * what a tick has to be checked against: the entire time round, later days
 * included, or ticking Monday after Tuesday was already paid would pay twice.
 */
export function bonusCompletionsOn(
  chore: BonusChore,
  date: string,
  marks: BonusMarks,
  span: 'to-date' | 'whole' = 'to-date',
  /** The household's today. Looking at today, every put-back counts, even one stamped "tomorrow". */
  today?: string,
): ChoreCompletion[] {
  const start = bonusPeriodStart(chore, date);
  const end = span === 'to-date' ? date : bonusPeriodEnd(chore, date);
  return marks.completions.filter((c) => c.choreId === chore.id && !c.status
    && (start === null || c.date >= start)
    && (end === null || c.date <= end)
    && countsSinceReset(chore, c, marks.bonusResets, resetViewDay(date, today)));
}

/**
 * The day a put-back is judged from. A put-back only changes its own day and
 * later ones in the history; today it always applies. When the household's
 * day steps back (its time zone set or changed in the evening), a put-back
 * and a tick can carry tomorrow's date, and they belong to today.
 */
export function resetViewDay(date: string, today: string | undefined): string | undefined {
  return today !== undefined && date >= today ? undefined : date;
}

/** Whether the time round holding `date` also holds `today`: ticking that day finishes today's round. */
function sameRound(chore: BonusChore, date: string, today: string): boolean {
  switch (chore.bonus.comesBack) {
    case 'daily': return date === today;
    case 'weekly': return mondayOf(date) === mondayOf(today);
    case 'manual': return true;
  }
}

/** Whether a grown-up can put this bonus chore back: it waits for them, and someone has done it. */
export function canPutBack(item: BonusItem): boolean {
  if (item.chore.bonus.comesBack !== 'manual') return false;
  return item.grab ? item.grab.status === 'done' : item.doneIds.length > 0;
}

/**
 * What the 90-day history clean-up keeps. Old entries go, except what still
 * holds a "when I put it back" chore closed (its completions since the last
 * put-back) and its grabs: those chores only reopen when a grown-up says so,
 * never because their history aged out.
 */
export function pruneChoreMarks<T extends { completions: ChoreCompletion[]; grabs?: ChoreGrab[]; bonusResets?: Record<string, string> }>(
  data: T,
  chores: readonly ChoreDefinition[],
  cutoff: string,
  hold: ChoreGrabHold,
  today: string,
): T {
  const manual = new Map(chores.filter((c) => c.bonus?.comesBack === 'manual').map((c) => [c.id, c]));
  const resets = data.bonusResets ?? {};
  const completions = data.completions.filter((c) => {
    if (c.date >= cutoff) return true;
    const chore = manual.get(c.choreId);
    return !!chore && !c.status && countsSinceReset(chore, c, resets);
  });
  // A grab only matters while it holds: lapsed ones, and grabs on chores that
  // are gone or no longer up for grabs, go. Left behind, a lapsed grab came
  // back to life when the grab-end setting changed.
  const upForGrabs = new Map(chores.filter((c): c is BonusChore => c.bonus?.claim === 'first').map((c) => [c.id, c]));
  const grabs = (data.grabs ?? []).filter((g) => {
    const chore = upForGrabs.get(g.choreId);
    return !!chore && grabHolds(g, chore, today, hold, today);
  });
  if (completions.length === data.completions.length && grabs.length === (data.grabs ?? []).length) return data;
  return { ...data, completions, grabs };
}

/**
 * Whether `grab` still holds `chore` on `date`, going by the household's
 * setting. Grabs are about today: on any other day (a grown-up looking back
 * through history) nothing is held, so a lapsed grab never locks a past day.
 */
export function grabHolds(grab: ChoreGrab, chore: BonusChore, date: string, hold: ChoreGrabHold, today: string): boolean {
  if (date !== today || grab.choreId !== chore.id) return false;
  // A grab dated after today was made before the household's day stepped
  // back (its time zone set or changed): it is today's.
  const grabDate = grab.date > today ? today : grab.date;
  if (hold === 'day') return grabDate === date;
  const start = bonusPeriodStart(chore, date);
  if (start !== null) return grabDate >= start;
  // A put-back chore never comes back by itself, so "until it comes back"
  // would hold forever; for those a grab lasts a week, and always through the
  // chore's next day, so a once-a-week chore's grab reaches its next showing.
  if (grabDate >= addDays(date, -(MANUAL_GRAB_DAYS - 1))) return true;
  for (let d = addDays(grabDate, 1); d < date; d = addDays(d, 1)) {
    if (bonusShowsOn(chore, d)) return false;
  }
  return true;
}

/** How long an unfinished grab of a put-back chore lasts under "when the chore comes back", at the least. */
export const MANUAL_GRAB_DAYS = 7;

function addDays(date: string, days: number): string {
  const d = parseISO(date);
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

/** Where an up-for-grabs chore stands on a day. */
export type GrabState =
  | { status: 'open' }
  | { status: 'grabbed'; memberId: string }
  | { status: 'done'; memberId: string; date: string };

/**
 * The grab holding `chore` on `date`, if any. Only a grab by someone the chore
 * is still open to counts: taking a person out of the group frees theirs.
 */
function holdingGrab(
  chore: BonusChore,
  date: string,
  marks: BonusMarks,
  hold: ChoreGrabHold,
  eligibleIds: readonly string[],
  today: string,
): ChoreGrab | undefined {
  // The newest wins: a grab is appended when made, so an older one still in
  // the file can never take a chore back from whoever grabbed it since.
  return [...marks.grabs].reverse().find((g) => eligibleIds.includes(g.memberId) && grabHolds(g, chore, date, hold, today));
}

/**
 * Where an up-for-grabs chore stands on `date`. A done chore has no grab.
 * Any day before today is drawn with its whole time round, the way a tick
 * there is judged: Monday of a week Dax finished on Friday reads "Dax did it
 * Friday". A day in today's round also shows today's grab. Drawn as it stood
 * then, such a day looked open and every tick there was refused.
 */
export function grabState(
  chore: BonusChore,
  date: string,
  marks: BonusMarks,
  hold: ChoreGrabHold,
  eligibleIds: readonly string[],
  today: string,
): GrabState {
  // An earlier day is drawn with its whole time round, as a tick there is
  // judged; one in today's round shows today's grab, which is the one that
  // holds the chore now.
  // Today too: after the household's day steps back, work dated "tomorrow"
  // is today's, and a tick on it is judged the same way.
  const earlier = date < today;
  const done = bonusCompletionsOn(chore, date, marks, date <= today ? 'whole' : 'to-date', today)[0];
  if (done) return { status: 'done', memberId: done.memberId, date: done.date };
  const grab = holdingGrab(chore, earlier && sameRound(chore, date, today) ? today : date, marks, hold, eligibleIds, today);
  return grab ? { status: 'grabbed', memberId: grab.memberId } : { status: 'open' };
}

/**
 * Whether `date` is a day before today in the time round that holds today,
 * with the chore on today's page too: that page is where the round is
 * finished or let go. A chore not on today (a Monday-and-Tuesday one, seen on
 * Wednesday) is still finished from its own days.
 */
export function roundIsToday(chore: BonusChore, date: string, today: string): boolean {
  return date < today && sameRound(chore, date, today) && bonusShowsOn(chore, today);
}

/** A bonus chore as a screen draws it on one day. */
export interface BonusItem {
  chore: BonusChore;
  /** Everyone it is open to, in the chore's own order. */
  eligibleIds: string[];
  /** Up for grabs: where it stands. Unset on an everyone-can chore. */
  grab?: GrabState;
  /** Everyone can: who has done it this time round. Empty on an up-for-grabs chore. */
  doneIds: string[];
  /** Everyone can: the day each of `doneIds` did it, so a screen can say "You did it Tuesday". */
  doneOn: Record<string, string>;
  /**
   * A day before today in today's time round, drawn as that round stands now.
   * What is done or held there is done or held today: it is changed from
   * today's page, not from this day.
   */
  roundIsToday: boolean;
  /**
   * Done and waiting for a grown-up since before this day: a "when I put it
   * back" chore finished on an earlier day (by everyone, for an everyone-can
   * one). The wall, the card and the kid view leave it out; nothing on it is
   * for a kid any more. Grown-ups still see it, with Put it back.
   */
  waiting: boolean;
}

/** The bonus chores that show up on `date`, each with who can do it and where it stands. */
export function resolveBonusFor(
  chores: readonly ChoreDefinition[],
  members: readonly Pick<FamilyMember, 'id'>[],
  date: string,
  marks: BonusMarks,
  groups: readonly ChoreGroup[],
  settings: ChoreSettings,
  /** The real today: grabs only hold on it. */
  today: string,
): BonusItem[] {
  const known = new Set(members.map((m) => m.id));
  const items: BonusItem[] = [];
  for (const chore of chores) {
    if (!isBonusChore(chore) || !bonusShowsOn(chore, date)) continue;
    const eligibleIds = choreAssigneeIds(chore, groups).filter((id) => known.has(id));
    if (eligibleIds.length === 0) continue;
    const manual = chore.bonus.comesBack === 'manual';
    const current = roundIsToday(chore, date, today);
    if (chore.bonus.claim === 'first') {
      const grab = grabState(chore, date, marks, settings.grabHold, eligibleIds, today);
      items.push({ chore, eligibleIds, grab, doneIds: [], doneOn: {}, roundIsToday: current, waiting: manual && grab.status === 'done' && grab.date < date });
    } else {
      const done = bonusCompletionsOn(chore, date, marks, date <= today ? 'whole' : 'to-date', today);
      const doneOn: Record<string, string> = {};
      for (const c of done) if (eligibleIds.includes(c.memberId)) doneOn[c.memberId] = c.date;
      const doneIds = eligibleIds.filter((id) => doneOn[id] !== undefined);
      const finishedEarlier = doneIds.length === eligibleIds.length && done.every((c) => c.date < date);
      items.push({ chore, eligibleIds, doneIds, doneOn, roundIsToday: current, waiting: manual && finishedEarlier });
    }
  }
  return items;
}

/**
 * How many up-for-grabs chores `memberId` is holding today. A chore that does
 * not show up today is not counted: its grab may still be theirs, but nothing
 * on screen today would let them finish it or let it go.
 */
export function grabsHeldBy(
  memberId: string,
  chores: readonly ChoreDefinition[],
  today: string,
  marks: BonusMarks,
  hold: ChoreGrabHold,
  groups: readonly ChoreGroup[],
): number {
  let held = 0;
  for (const chore of chores) {
    if (!isBonusChore(chore) || chore.bonus.claim !== 'first' || !bonusShowsOn(chore, today)) continue;
    const state = grabState(chore, today, marks, hold, choreAssigneeIds(chore, groups), today);
    if (state.status === 'grabbed' && state.memberId === memberId) held += 1;
  }
  return held;
}

/** Whether `memberId` has reached the household's grab limit today. */
export function atGrabLimit(
  memberId: string,
  chores: readonly ChoreDefinition[],
  today: string,
  marks: BonusMarks,
  settings: ChoreSettings,
  groups: readonly ChoreGroup[],
): boolean {
  return settings.grabLimit > 0 && grabsHeldBy(memberId, chores, today, marks, settings.grabHold, groups) >= settings.grabLimit;
}

/**
 * Why a grab or a tick is refused.
 * - `not-bonus`  the chore is not up for grabs
 * - `not-yours`  the person is not someone it is open to
 * - `not-today`  it does not show up that day
 * - `taken`      someone already did it this time round
 * - `grabbed`    someone else is holding it
 * - `limit`      the person already holds as many as the household allows
 */
export type BonusRefusal = 'not-bonus' | 'not-yours' | 'not-today' | 'taken' | 'grabbed' | 'limit';

export interface BonusCheck {
  refusal: BonusRefusal;
  /** Who did or is holding it, for `taken` and `grabbed`. */
  memberId?: string;
}

/** What stands in the way of `memberId` grabbing `chore` on `date`, or null when they may (or already hold it). */
export function checkGrab(
  chore: ChoreDefinition,
  memberId: string,
  date: string,
  chores: readonly ChoreDefinition[],
  marks: BonusMarks,
  groups: readonly ChoreGroup[],
  settings: ChoreSettings,
): BonusCheck | null {
  if (!isBonusChore(chore) || chore.bonus.claim !== 'first') return { refusal: 'not-bonus' };
  const eligibleIds = choreAssigneeIds(chore, groups);
  if (!eligibleIds.includes(memberId)) return { refusal: 'not-yours' };
  if (!bonusShowsOn(chore, date)) return { refusal: 'not-today' };
  // A grab is always made today, so `date` is today.
  const state = grabState(chore, date, marks, settings.grabHold, eligibleIds, date);
  if (state.status === 'done') return { refusal: 'taken', memberId: state.memberId };
  if (state.status === 'grabbed') return state.memberId === memberId ? null : { refusal: 'grabbed', memberId: state.memberId };
  if (atGrabLimit(memberId, chores, date, marks, settings, groups)) return { refusal: 'limit' };
  return null;
}

/**
 * What stands in the way of `memberId` finishing bonus `chore` on `date`, or
 * null when they may. Ticking an open up-for-grabs chore grabs and finishes it
 * in one go, so the grab limit does not apply here. `already` is set when an
 * everyone-can chore was already done this time round (on another day), which
 * a caller treats as a no-op rather than a refusal.
 *
 * A grab counts when the tick is for today's time round: a grown-up ticking
 * Monday for Bram while Cleo holds this week's chore today is refused, since
 * that tick would finish the job Cleo is doing. A day from an earlier round
 * (yesterday's daily chore) is never held up by a grab.
 */
export function checkBonusComplete(
  chore: BonusChore,
  memberId: string,
  date: string,
  marks: BonusMarks,
  groups: readonly ChoreGroup[],
  hold: ChoreGrabHold,
  /** The real today: a tick on another day is never held up by a grab. */
  today: string,
): BonusCheck | { already: true } | null {
  const eligibleIds = choreAssigneeIds(chore, groups);
  if (!eligibleIds.includes(memberId)) return { refusal: 'not-yours' };
  if (!bonusShowsOn(chore, date)) return { refusal: 'not-today' };
  const done = bonusCompletionsOn(chore, date, marks, 'whole', today);
  if (chore.bonus.claim === 'each') {
    return done.some((c) => c.memberId === memberId) ? { already: true } : null;
  }
  if (done.length > 0) return { refusal: 'taken', memberId: done[0].memberId };
  const grab = sameRound(chore, date, today) ? holdingGrab(chore, today, marks, hold, eligibleIds, today) : undefined;
  if (grab && grab.memberId !== memberId) return { refusal: 'grabbed', memberId: grab.memberId };
  return null;
}

/**
 * Whether ticking `date` finishes the time round holding today, which is when
 * a tick ends the chore's grabs. Ticking an earlier round (yesterday's daily
 * chore) leaves today's grab alone.
 */
export function tickEndsGrabs(chore: BonusChore, date: string, today: string): boolean {
  return chore.bonus.claim === 'first' && sameRound(chore, date, today);
}

/**
 * The order a screen with limited room shows bonus chores in: ones someone is
 * holding first (the holder must be able to reach theirs), then open ones,
 * then everyone-can ones not yet done by all, then finished ones, which give
 * way first. Stable within each group.
 */
export function bonusDisplayOrder(items: readonly BonusItem[]): BonusItem[] {
  const rank = (item: BonusItem) => {
    if (item.grab) return item.grab.status === 'grabbed' ? 0 : item.grab.status === 'open' ? 1 : 3;
    return item.doneIds.length < item.eligibleIds.length ? 2 : 3;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/**
 * Tickets `memberId` earned from bonus chores on `dates`. Bonus chores stay out
 * of every count, but what they pay is still tickets earned that week, so the
 * weekly ticket totals add this to what regular chores earned.
 */
export function bonusTicketsEarned(
  chores: readonly ChoreDefinition[],
  memberId: string,
  dates: readonly string[],
  completions: readonly ChoreCompletion[],
): number {
  const points = new Map(chores.filter(isBonusChore).map((c) => [c.id, c.points]));
  const days = new Set(dates);
  let earned = 0;
  for (const c of completions) {
    if (c.memberId !== memberId || c.status || !days.has(c.date)) continue;
    earned += points.get(c.choreId) ?? 0;
  }
  return earned;
}

/**
 * The chore list as it is saved, with `bonus.since` set by the hub. A chore
 * that just became a bonus chore (new, or regular until now) starts a fresh
 * count, so ticks from its regular life cannot make it look already done. A
 * bonus chore keeps its saved stamp whatever changed and whatever a phone
 * sent: changing how it comes back must not reopen a job done this morning
 * (and pay for it twice), and the stamp is the hub's clock, the one
 * completions are stamped by.
 */
export function stampBonusSince(
  chores: ChoreDefinition[],
  saved: readonly ChoreDefinition[],
  now: string,
): ChoreDefinition[] {
  const before = new Map(saved.map((c) => [c.id, c]));
  return chores.map((chore) => {
    if (!chore.bonus) return chore;
    const old = before.get(chore.id)?.bonus;
    const { since: _sent, ...bonus } = chore.bonus;
    const since = old ? old.since : now;
    return { ...chore, bonus: since ? { ...bonus, since } : bonus };
  });
}
