import { addDays, addMonths } from 'date-fns';
import type { CalendarConfig, FullscreenCalendarConfig, FullscreenMealPlannerView, MealPlannerView } from '@/types/config';
import { MEALIE_WINDOW_WEEKS_AFTER, MEALIE_WINDOW_WEEKS_BEFORE } from '@/lib/meal-sources';

/**
 * Look-ahead on a touch wall: arrows that step a calendar or a meal planner
 * week (or month, or its run of days) forward or back, and the rules behind
 * them. The arrows only show where taps are on (`wallScrollOn`); the stepping
 * itself, the minute after which it slides back, and the rotation hold live
 * in `useLookAhead`.
 */

export type LookAheadUnit = 'day' | 'week' | 'month';

/** What one tap moves, and how many taps the arrows reach either way. */
export interface LookAheadStep {
  unit: LookAheadUnit;
  /** Units per tap: a three-day Daily view moves three days at a time. */
  count: number;
  /** Taps back from now. */
  back: number;
  /** Taps forward from now. */
  forward: number;
}

/** Week and day views reach eight weeks either way. */
export const LOOK_AHEAD_DAYS = 56;
/** Month views reach two months back and six on. */
export const LOOK_AHEAD_MONTHS = { back: 2, forward: 6 } as const;

const WEEK: LookAheadStep = { unit: 'week', count: 1, back: LOOK_AHEAD_DAYS / 7, forward: LOOK_AHEAD_DAYS / 7 };
const MONTH: LookAheadStep = { unit: 'month', count: 1, ...LOOK_AHEAD_MONTHS };
/** The hub reads Mealie's plan for one week back and three ahead, and a wall can ask for no other weeks. */
const MEALIE_WEEK: LookAheadStep = { unit: 'week', count: 1, back: MEALIE_WINDOW_WEEKS_BEFORE, forward: MEALIE_WINDOW_WEEKS_AFTER };

/** A view that draws `count` days moves `count` days a tap, as far as eight weeks reach. */
export function daySteps(count: number): LookAheadStep {
  const days = Math.max(1, Math.round(count));
  const taps = Math.max(1, Math.floor(LOOK_AHEAD_DAYS / days));
  return { unit: 'day', count: days, back: taps, forward: taps };
}

/**
 * The small Calendar's step, or null. The agenda lists events rather than a
 * run of days, so it moves a week and starts the list at that week's first day.
 */
export function calendarLookAhead(config: Partial<Pick<CalendarConfig, 'viewMode' | 'daysToShow'>>): LookAheadStep | null {
  switch (config.viewMode ?? 'daily') {
    case 'daily': return daySteps(config.daysToShow ?? 3);
    case 'month': return MONTH;
    case 'agenda':
    case 'week':
    case 'multi-week':
    case 'rolling': return WEEK;
    default: return null;
  }
}

/**
 * The full-screen Calendar's step, or null for the views about right now
 * (Up next, Free time). The schedule moves by the columns it draws, which
 * depend on the module's width, so its caller passes them. The agenda, a
 * list, moves a week whatever run of days it shows: "Next week" and "Last
 * week" are what a family asks for, not "in 14 days".
 */
export function fullscreenCalendarLookAhead(
  config: Partial<Pick<FullscreenCalendarConfig, 'view'>>,
  scheduleColumns = 7,
): LookAheadStep | null {
  switch (config.view) {
    case 'week-list':
    case 'family-grid':
    case 'agenda':
    case 'rolling': return WEEK;
    case 'schedule': return scheduleColumns === 7 ? WEEK : daySteps(scheduleColumns);
    case 'month-grid': return MONTH;
    case 'day-timeline': return daySteps(1);
    default: return null;
  }
}

/**
 * The meal planners' step: the week views and the small List move a week;
 * the rest are about today. A plan kept in Home Screens reaches as far as a
 * calendar (it keeps twelve weeks of the past and any future); a plan in
 * Mealie only as far as the hub reads it for walls.
 */
export function mealLookAhead(view: MealPlannerView | FullscreenMealPlannerView, inMealie: boolean): LookAheadStep | null {
  if (view !== 'week' && view !== 'list') return null;
  return inMealie ? MEALIE_WEEK : WEEK;
}

/** Keeps a step count inside what the arrows reach. */
export function clampLookAhead(offset: number, step: LookAheadStep): number {
  return Math.min(step.forward, Math.max(-step.back, Math.round(offset)));
}

/**
 * The day a view draws from after `offset` taps: `today` itself at 0. A
 * month moves by calendar month (the 31st lands on the 30th), and a month
 * grid only reads the month.
 */
export function lookAheadAnchor(today: Date, offset: number, step: LookAheadStep): Date {
  if (offset === 0) return today;
  if (step.unit === 'month') return addMonths(today, offset * step.count);
  return addDays(today, offset * step.count * (step.unit === 'week' ? 7 : 1));
}

/** Days from now that `offset` taps reach, for the words. */
function daysMoved(offset: number, step: LookAheadStep): number {
  return offset * step.count * (step.unit === 'week' ? 7 : 1);
}

/** A key under `lookAhead` in the modules dictionary, and its values. */
export interface LookAheadWords {
  key: string;
  values?: Record<string, number>;
}

/**
 * What the heading calls the stepped-to period: This week, Next week, In 3
 * weeks, Last week, 2 weeks ago; Today, Tomorrow, In 3 days; This month,
 * Next month. A run of days in whole weeks is said in weeks.
 */
export function lookAheadHeading(offset: number, step: LookAheadStep): LookAheadWords {
  if (step.unit === 'month') {
    const n = offset * step.count;
    if (n === 0) return { key: 'thisMonth' };
    if (n === 1) return { key: 'nextMonth' };
    if (n === -1) return { key: 'lastMonth' };
    return n > 0 ? { key: 'inMonths', values: { count: n } } : { key: 'monthsAgo', values: { count: -n } };
  }
  const days = daysMoved(offset, step);
  if (step.unit === 'week' || (step.count % 7 === 0 && days !== 0)) {
    const weeks = days / 7;
    if (weeks === 0) return { key: 'thisWeek' };
    if (weeks === 1) return { key: 'nextWeek' };
    if (weeks === -1) return { key: 'lastWeek' };
    return weeks > 0 ? { key: 'inWeeks', values: { count: weeks } } : { key: 'weeksAgo', values: { count: -weeks } };
  }
  if (days === 0) return { key: 'today' };
  if (days === 1) return { key: 'tomorrow' };
  if (days === -1) return { key: 'yesterday' };
  return days > 0 ? { key: 'inDays', values: { count: days } } : { key: 'daysAgo', values: { count: -days } };
}

/**
 * What a tap past the end says, as a key under `lookAhead` and its count:
 * "The wall goes up to 8 weeks ahead". A run of days in whole weeks is said
 * in weeks.
 */
export function lookAheadLimit(step: LookAheadStep, direction: 'back' | 'forward'): LookAheadWords {
  const taps = direction === 'back' ? step.back : step.forward;
  const side = direction === 'back' ? 'limitBack' : 'limitAhead';
  if (step.unit === 'month') return { key: `${side}.month`, values: { count: taps * step.count } };
  const days = daysMoved(taps, step);
  if (step.unit === 'week' || days % 7 === 0) return { key: `${side}.week`, values: { count: days / 7 } };
  return { key: `${side}.day`, values: { count: days } };
}

/** What the way-back button says, as a key under `lookAhead`: Back to this week, this month, or today. */
export function lookAheadHomeKey(step: LookAheadStep): 'homeWeek' | 'homeMonth' | 'homeToday' {
  return step.unit === 'month' ? 'homeMonth' : step.unit === 'week' ? 'homeWeek' : 'homeToday';
}

/**
 * The first and last instant the arrows can bring into view, for the shared
 * calendar fetch: `windowAt(anchor)` is the view's drawn days for an anchor.
 * Fetched once on the first step away, so tapping on never fetches again.
 */
export function lookAheadReach(
  today: Date,
  step: LookAheadStep,
  windowAt: (anchor: Date) => { start: Date; end: Date },
): { start: Date; end: Date } {
  return {
    start: windowAt(lookAheadAnchor(today, -step.back, step)).start,
    end: windowAt(lookAheadAnchor(today, step.forward, step)).end,
  };
}
