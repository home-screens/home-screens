/**
 * What every phone and editor request to the hub shares once `editorFetch`
 * has sent it: the error for a hub that could not be reached, reading an
 * answer that may have no body, and a refusal in the route's own words.
 */

/**
 * How long one request may take, answer body included, before it counts as
 * the hub not answering. Longer than the hub itself waits on an outside
 * service (Mealie: three tries of ten seconds), so a slow service comes back
 * as that service's failure, not as this device losing the hub.
 */
export const HUB_REQUEST_TIMEOUT_MS = 45_000;

/**
 * The phone or laptop could not reach the hub at all: no connection, or no
 * answer within the request's deadline. A surface says so in its own words;
 * the browser's ("Load failed", "Failed to fetch") mean nothing to a family.
 */
export class HubUnreachableError extends Error {
  constructor() {
    super("Couldn't reach Home Screens.");
    this.name = 'HubUnreachableError';
  }
}

/**
 * What a surface shows for a request that failed: its own sentence for a hub
 * out of reach, the route's refusal when the error carries one, its fallback
 * otherwise.
 */
export function requestFailureText(err: unknown, words: { unreachable: string; fallback: string }): string {
  if (err instanceof HubUnreachableError) return words.unreachable;
  return err instanceof Error && err.message ? err.message : words.fallback;
}

/**
 * The answer's JSON, or `null` when its body is not JSON (empty, an HTML error
 * page). A body that could not be read at all rejects: an answer that never
 * arrived is not an empty one, and reading it as one cleared the phone's day
 * notes and called a write saved when a deadline cut the body off. Any
 * failure to read is the hub out of reach, an abort included: Chromium ends a
 * body the deadline cut off with a plain AbortError, not the deadline's own
 * error, so the two cannot be told apart here. A caller that cancels checks
 * its own signal.
 */
export async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch (err) {
    // A body that arrived but is not JSON is the one failure that means "no JSON".
    if (err instanceof SyntaxError) return null;
    throw new HubUnreachableError();
  }
}

/** The route's own plain sentence when it wrote one, the caller's fallback otherwise. */
export function refusalMessage(json: unknown, fallback: string): string {
  const error = (json as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error ? error : fallback;
}

export type HubFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface JsonWriteRequest {
  url: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/**
 * Send one JSON write and hand back the answer's JSON. A refusal rejects with
 * the route's own sentence, else `fallback`; a hub that cannot be reached
 * rejects with `HubUnreachableError` and an expired session with its own
 * error, both untouched, so a caller can tell the three apart.
 */
export async function sendJsonWrite(fetcher: HubFetch, request: JsonWriteRequest, fallback: string): Promise<unknown> {
  const res = await fetcher(request.url, {
    method: request.method,
    ...(request.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) } : {}),
  });
  const json = await readJson(res);
  if (!res.ok) throw new Error(refusalMessage(json, fallback));
  return json;
}
