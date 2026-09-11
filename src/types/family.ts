/** Shared identity used by chores, calendars, rewards and lists. */
export interface FamilyMember {
  /** Unique ID */
  id: string;
  /** Name */
  name: string;
  /** Color used for this person everywhere */
  color: string;
  /** Emoji shown with the name */
  emoji?: string;
  /** When the person was added (ISO timestamp) */
  createdAt: string;
  /** When the person was last changed (ISO timestamp) */
  updatedAt: string;
}

export interface FamilyData {
  /** The household, in display order (see the member table below) */
  members: FamilyMember[];
  /** Set once older chore and calendar people have been folded into this list */
  migrated?: boolean;
  /**
   * Older calendar person IDs, mapped to the member each one became
   *
   * Legacy calendar identity -> current member. Never a chain or self-alias.
   */
  aliasIds?: Record<string, string>;
}

export interface FamilyResponse {
  members: FamilyMember[];
  revision: string;
}

export const FAMILY_LIMITS = { maxMembers: 64, maxNameLength: 40 } as const;

export const MEMBER_COLORS = [
  '#f472b6', '#60a5fa', '#4ade80', '#fbbf24', '#a78bfa',
  '#fb923c', '#22d3ee', '#f87171', '#34d399', '#e879f9',
] as const;
