import type { ChoreBonusClaim, ChoreBonusComesBack, ChoreResetFrequency, ChoreRotation } from '@/types/config';
import type { TranslateFn } from '@/i18n/types';

// ── Chore frequency & rotation values (shared across editor + remote) ────
//
// Only the canonical `value` is exported. The previous `label` field was
// dead — every consumer (`ChoresManageView`, `ChoreChartModal`) resolves
// labels through `frequencyLabelMap[opt.value]` / `rotationLabelMap[opt.value]`,
// which read from the active locale dictionary instead of the constant.

export const CHORE_FREQUENCIES: { value: ChoreResetFrequency }[] = [
  { value: 'daily' },
  { value: 'weekly' },
  { value: 'biweekly' },
  { value: 'once' },
];

/**
 * Icon a brand-new chore starts with. Chores with no icon rendered as a grey
 * "?" in the manage list, which read like something had gone wrong; the
 * sparkle is a neutral stand-in that still looks like a chore.
 */
export const DEFAULT_CHORE_ICON = 'lucide:sparkles';

/** Icon a brand-new reward starts with. */
export const DEFAULT_REWARD_ICON = 'lucide:gift';

export const CHORE_ROTATIONS: { value: ChoreRotation }[] = [
  { value: 'fixed' },
  { value: 'rotate-daily' },
  { value: 'rotate-weekly' },
  { value: 'schedule' },
];

/** A chore's two kinds, in the order both forms offer them. */
export const CHORE_KINDS = ['regular', 'bonus'] as const;

/** Who a bonus chore goes to, in the order both forms offer them. */
export const CHORE_CLAIMS: readonly ChoreBonusClaim[] = ['first', 'each'];

/** When a bonus chore is on offer again, in the order both forms offer them. */
export const CHORE_COMES_BACK: readonly ChoreBonusComesBack[] = ['daily', 'weekly', 'manual'];

/**
 * A copy of the list with the bonus chores after the regular ones, each group
 * in the order it was written. Both Manage lists draw the bonus chores under
 * their own heading.
 */
export function regularBeforeBonus<T extends { bonus?: unknown }>(chores: readonly T[]): T[] {
  return [...chores].sort((a, b) => Number(!!a.bonus) - Number(!!b.bonus));
}

// ── Reward icon presets ────

export const REWARD_ICONS = [
  // Gifts & prizes
  'gift', 'trophy', 'gem', 'crown', 'star', 'badge-check', 'sticker',
  // Screens & entertainment
  'tv', 'gamepad-2', 'headphones', 'clapperboard', 'popcorn', 'drama', 'music',
  // Food & treats
  'ice-cream-cone', 'pizza', 'candy', 'cookie', 'cake', 'apple', 'coffee',
  // Activities
  'bike', 'volleyball', 'puzzle', 'palette', 'tent', 'fish', 'plane',
  // Money & passes
  'banknote', 'circle-dollar-sign', 'wallet', 'ticket', 'circle-check-big',
  // Fun
  'party-popper', 'rocket', 'sparkles', 'heart', 'smile',
] as const;

// ── Time formatting (shared across remote components) ────

/**
 * Format a relative time string from a Date or ISO string. Output strings are
 * pulled from translation keys under `core.relativeTime.*`. Callers bind a
 * `TranslateFn` via `useTranslate('core')` and pass it in.
 */
export function formatTimeAgoLocalized(
  input: Date | string,
  t: TranslateFn,
  now: Date = new Date(),
): string {
  const inputMs = typeof input === 'string' ? new Date(input).getTime() : input.getTime();
  const ms = Math.max(0, now.getTime() - inputMs);
  const seconds = Math.floor(ms / 1000);
  if (seconds < 5) return t('relativeTime.justNow');
  if (seconds < 60) return t('relativeTime.secondsAgo', { n: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('relativeTime.minutesAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('relativeTime.hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('relativeTime.daysAgo', { n: days });
  const weeks = Math.floor(days / 7);
  return t('relativeTime.weeksAgo', { n: weeks });
}

/** A wall sheet (the bonus picker, "did it / let it go") closes itself after this long with no touch. */
export const CHORE_SHEET_IDLE_MS = 30_000;
/** The store or the history, opened from a chart, goes back by itself after this long with no touch. */
export const CHORE_STORE_IDLE_MS = 60_000;
