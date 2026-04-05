import type { ChoreResetFrequency, ChoreRotation } from '@/types/config';

// ── Chore frequency & rotation labels (shared across editor + remote) ────

export const CHORE_FREQUENCIES: { value: ChoreResetFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every Other Week' },
];

export const CHORE_ROTATIONS: { value: ChoreRotation; label: string }[] = [
  { value: 'fixed', label: 'Fixed (all do it)' },
  { value: 'rotate-daily', label: 'Rotate Daily' },
  { value: 'rotate-weekly', label: 'Rotate Weekly' },
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

/** Format a relative time string from a Date or ISO string */
export function formatTimeAgo(input: Date | string): string {
  const ms = Math.max(0, Date.now() - (typeof input === 'string' ? new Date(input).getTime() : input.getTime()));
  const seconds = Math.floor(ms / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}
