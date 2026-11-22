/**
 * The grown-up code: an optional four-number code a household sets in
 * Settings, which the wall, the kids' chores page and an unsigned phone ask
 * for before the jobs ticked there (spending tickets, unticking a chore,
 * closing a Todoist task). The rules both sides share live here; the hub
 * keeps the code itself (`grown-up-code-data.ts`) and refuses a ticked job
 * without a fresh unlock (`grown-up-gate.ts`).
 *
 * It keeps little hands off the bigger jobs. It is not a lock for the home
 * network: four digits and a per-address limit are a speed bump, and the
 * password is the lock.
 */

/** The jobs that can ask for the code, in the order Settings lists them. */
export const GROWN_UP_ACTIONS = ['redeem', 'untick', 'todoist-close', 'calendar-remove', 'calendar-change-series'] as const;
export type GrownUpAction = typeof GROWN_UP_ACTIONS[number];

/** What a newly set code asks for: spending tickets, the one a kid most wants to do alone. */
export const DEFAULT_GROWN_UP_ACTIONS: readonly GrownUpAction[] = ['redeem'];

/** How long a right code keeps that wall (or phone) unlocked, in minutes. */
export const UNLOCK_MINUTE_CHOICES = [1, 5, 15] as const;
export const DEFAULT_UNLOCK_MINUTES = 5;

export const GROWN_UP_CODE_LENGTH = 4;

/** The request header that carries an unlock to the hub. */
export const GROWN_UP_HEADER = 'x-hs-grown-up';

/** Wrong codes from one address before it has to wait, and for how long. */
export const WRONG_CODES_PER_ADDRESS = 5;
export const WRONG_CODE_WAIT_MS = 60_000;
/** Wrong codes from everywhere together before the whole hub waits. */
export const WRONG_CODES_PER_HUB = 30;
export const WRONG_CODE_HUB_WAIT_MS = 10 * 60_000;

/** What any surface may know: whether a code is set and what it guards. Never the code. */
export interface GrownUpStatus {
  set: boolean;
  actions: GrownUpAction[];
  unlockMinutes: number;
  /**
   * The page that asked is a signed-in grown-up, who is never asked for the
   * code. Only in the hub's answer to that page (`GET /api/grown-up-code`).
   */
  signedIn?: boolean;
}

export const NO_GROWN_UP_CODE: GrownUpStatus = { set: false, actions: [], unlockMinutes: DEFAULT_UNLOCK_MINUTES };

export function isGrownUpCode(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^\\d{${GROWN_UP_CODE_LENGTH}}$`).test(value);
}

/** The known jobs in `value`, in the canonical order; null when it is not a list. */
export function cleanGrownUpActions(value: unknown): GrownUpAction[] | null {
  if (!Array.isArray(value)) return null;
  return GROWN_UP_ACTIONS.filter((action) => value.includes(action));
}

/** One of the offered unlock lengths, or null. */
export function cleanUnlockMinutes(value: unknown): number | null {
  return (UNLOCK_MINUTE_CHOICES as readonly number[]).includes(value as number) ? (value as number) : null;
}

/** Whether this job asks the page holding `status` for the code. */
export function asksForCode(status: GrownUpStatus | null | undefined, action: GrownUpAction): boolean {
  return !!status?.set && !status.signedIn && status.actions.includes(action);
}
