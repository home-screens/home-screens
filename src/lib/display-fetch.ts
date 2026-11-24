/**
 * Fetch wrapper for the display client.
 *
 * A wall proves itself with its `hs-display` cookie (`display-walls.ts`),
 * which the browser sends with every same-origin request, so nothing is
 * added here for that. The display key is never given to a page.
 *
 * Every request is bounded in time. After a Wi-Fi drop on a Pi, or
 * while the hub is busy with an upgrade, a request can sit half-open until
 * TCP gives up on it, which is minutes. The 3 s pollers keep starting new
 * ones meanwhile, Chromium's six connections to the hub fill with dead
 * sockets within half a minute, and every later request queues behind them
 * even once the network is back: the wall looks frozen. An aborted request
 * frees its socket at once and the next poll starts clean.
 */

/** How long an ordinary hub request may take, headers and body together. */
export const DISPLAY_FETCH_TIMEOUT_MS = 15_000;
/**
 * For pictures, plugin bundles and plugin proxy calls: a photo can be several
 * megabytes over a Pi's Wi-Fi and a proxied upstream API answers at its own
 * pace, so the ordinary limit would cut them off while they are working.
 */
export const DISPLAY_FETCH_LONG_TIMEOUT_MS = 60_000;

export interface DisplayFetchInit extends RequestInit {
  /**
   * Milliseconds before the request is aborted. Defaults to
   * `DISPLAY_FETCH_TIMEOUT_MS`; `null` leaves the request unbounded.
   */
  timeoutMs?: number | null;
}

/**
 * A signal that fires after `timeoutMs`, or when the caller's own signal
 * fires, whichever comes first. Built by hand rather than with
 * `AbortSignal.any` so a test's fake timers drive it. `timedOut` makes the
 * error the deadline aborts with, which a request still waiting for its
 * answer rejects with (a body cut off mid-read may end in a plain AbortError
 * instead, as Chromium's does).
 */
export function timeoutSignal(
  timeoutMs: number,
  callerSignal: AbortSignal | null | undefined,
  timedOut: () => unknown = () => new DOMException(`Request timed out after ${timeoutMs} ms`, 'TimeoutError'),
): AbortSignal {
  const controller = new AbortController();
  // The timer runs for the request's whole life, body included: there is no
  // moment the wrapper can know the caller has finished reading. Aborting a
  // request that already completed does nothing, so the timer is left to
  // fire and is cleared only when the caller's signal fires first.
  const timer = setTimeout(() => controller.abort(timedOut()), timeoutMs);
  if (callerSignal) {
    const forward = () => {
      clearTimeout(timer);
      controller.abort(callerSignal.reason);
    };
    if (callerSignal.aborted) forward();
    else callerSignal.addEventListener('abort', forward, { once: true });
  }
  return controller.signal;
}

/** Fetch wrapper that bounds the request in time. */
export function displayFetch(input: string | URL | Request, init?: DisplayFetchInit): Promise<Response> {
  const { timeoutMs = DISPLAY_FETCH_TIMEOUT_MS, ...rest } = init ?? {};
  const options: RequestInit = rest;
  if (timeoutMs !== null) options.signal = timeoutSignal(timeoutMs, rest.signal);
  return fetch(input, options);
}
