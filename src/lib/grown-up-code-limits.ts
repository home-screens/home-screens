import { createRateLimiter } from '@/lib/api-utils';
import { WRONG_CODE_HUB_WAIT_MS, WRONG_CODE_WAIT_MS, WRONG_CODES_PER_ADDRESS, WRONG_CODES_PER_HUB } from '@/lib/grown-up-code';

/**
 * The wrong-code counts behind the grown-up code: per address, and for the
 * whole hub under one key, so guessing from many addresses at once waits
 * too. In memory: a restart forgets the count, which for four digits behind
 * a minute's wait is an acceptable gift.
 *
 * Shared by the unlock route, which counts, and the signed-in code settings,
 * which show the hub-wide wait and let a grown-up clear it: thirty wrong
 * tries at one wall used to lock every wall, `/chores` and signed-out phone
 * out for ten minutes with nothing anyone could do.
 */
export const perAddress = createRateLimiter(WRONG_CODES_PER_ADDRESS, WRONG_CODE_WAIT_MS);
export const perHub = createRateLimiter(WRONG_CODES_PER_HUB, WRONG_CODE_HUB_WAIT_MS);
export const HUB_KEY = '*';

/** Seconds the whole hub still waits before taking a code, or 0 when it does not. */
export function hubCodeLockSeconds(): number {
  return perHub.isLimited(HUB_KEY) ? Math.max(1, Math.ceil(perHub.retryAfterMs(HUB_KEY) / 1000)) : 0;
}

/** A signed-in grown-up ends the hub-wide wait. Each address's own minute stays. */
export function clearHubCodeLock(): void {
  perHub.clear(HUB_KEY);
}
