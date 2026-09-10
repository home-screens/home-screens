/** Shared identity used by chores, calendars, rewards and lists. */
export interface FamilyMember {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyData {
  members: FamilyMember[];
  migrated?: boolean;
  /** Legacy calendar identity -> current member. Never a chain or self-alias. */
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
