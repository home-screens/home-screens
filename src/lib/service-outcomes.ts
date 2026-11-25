/**
 * How the hub's last request to a service went, for the services it talks
 * to over the household's own network. Each service's one request function
 * records it; `service-attention.ts` turns a request that got no answer into
 * "Needs attention" on Status and API keys.
 *
 * Per-process, like the calendar's last-good bookkeeping: a restart forgets
 * an outage until the next request finds it again.
 */
export type ReachableServiceId = 'immich';

const outcomes = new Map<ReachableServiceId, boolean>();

/** Record whether a request to the service got an answer. */
export function noteServiceOutcome(id: ReachableServiceId, answered: boolean): void {
  outcomes.set(id, answered);
}

/** Forget how the service last answered, after its address or key changed. */
export function forgetServiceOutcome(id: ReachableServiceId): void {
  outcomes.delete(id);
}

/** The services whose last request got no answer. */
export function unansweredServices(): ReachableServiceId[] {
  return [...outcomes].filter(([, answered]) => !answered).map(([id]) => id);
}

export function __resetServiceOutcomesForTests(): void {
  outcomes.clear();
}
