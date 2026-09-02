import type { ChoreResetFrequency, ChoreRotation } from '@/types/config';
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

export const CHORE_ROTATIONS: { value: ChoreRotation }[] = [
  { value: 'fixed' },
  { value: 'rotate-daily' },
  { value: 'rotate-weekly' },
  { value: 'schedule' },
];

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
