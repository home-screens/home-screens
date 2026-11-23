/**
 * What every phone and editor request to the hub shares once `editorFetch`
 * has sent it: the error for a hub that could not be reached, reading an
 * answer that may have no body, a refusal as the error it is, and the words
 * a surface shows for one in the family's own language.
 */

import type { TranslateFn } from '@/i18n/types';
import { RefusalError, isRefusalBody, refusalFromBody } from './refusal';

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
 * otherwise. For a store whose refusals carry a code, `refusalText` shows the
 * family's own language instead.
 */
export function requestFailureText(err: unknown, words: { unreachable: string; fallback: string }): string {
  if (err instanceof HubUnreachableError) return words.unreachable;
  return err instanceof Error && err.message ? err.message : words.fallback;
}

/** The dictionary key for a refusal code: `refusals.lists.nameTooLong`. */
export function refusalKey(code: string): string {
  return `refusals.${code}`;
}

/**
 * What a surface shows for a refused request, in the family's language.
 *
 * `source` is the error a client threw (`RefusalError`, `HubUnreachableError`
 * or anything else) or the hub's answer body itself. A refusal code maps to
 * `refusals.<code>` in the dictionary `t` reads, with the refusal's params
 * filled in; a hub out of reach shows `unreachableKey`; anything else, a code
 * with no sentence included, shows `fallbackKey`. The hub's English sentence
 * is never shown: it is for logs, and a German phone read "A day holds 3
 * notes" off it.
 */
export function refusalText(source: unknown, t: TranslateFn, fallbackKey: string, unreachableKey = fallbackKey): string {
  if (source instanceof HubUnreachableError) return t(unreachableKey);
  return refusalSentence(source, t) ?? t(fallbackKey);
}

/**
 * The sentence for a refusal's code in the dictionary `t` reads, or null when
 * `source` carries no code or the code has no sentence. For a surface whose
 * refusal sentences are shared (`core`) while its fallback words are its own:
 * `refusalSentence(result, tCore) ?? t('photosTab.moveFailed')`.
 */
export function refusalSentence(source: unknown, t: TranslateFn): string | null {
  const refusal = source instanceof RefusalError
    ? source
    : isRefusalBody(source) ? refusalFromBody(source, 0, '') : null;
  if (!refusal) return null;
  const key = refusalKey(refusal.code);
  const text = t(key, refusal.params);
  return text === key ? null : text;
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
 * The error a refused answer becomes: a `RefusalError` carrying the code and
 * params when the hub named one (a surface shows it through `refusalText`),
 * else a plain error with the route's own sentence or `fallback`.
 */
export function refusalError(json: unknown, status: number, fallback: string): Error {
  return refusalFromBody(json, status, fallback) ?? new Error(refusalMessage(json, fallback));
}

/**
 * Send one JSON write and hand back the answer's JSON. A refusal rejects with
 * `refusalError` (a `RefusalError` when the hub named a code); a hub that
 * cannot be reached rejects with `HubUnreachableError` and an expired session
 * with its own error, both untouched, so a caller can tell the three apart.
 */
export async function sendJsonWrite(fetcher: HubFetch, request: JsonWriteRequest, fallback: string): Promise<unknown> {
  const res = await fetcher(request.url, {
    method: request.method,
    ...(request.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) } : {}),
  });
  const json = await readJson(res);
  if (!res.ok) throw refusalError(json, res.status, fallback);
  return json;
}

/** What a whole-list save quoting a revision came to. */
export type RevisionedSave<S> =
  | { kind: 'saved'; snapshot: S }
  /**
   * Somebody else saved first. `snapshot` is the copy the hub holds now, for
   * the surface to show or to make its change again on top of; null only
   * when the refusal came back without one.
   */
  | { kind: 'conflict'; snapshot: S | null };

/**
 * Send one save of a whole list (chores, rewards, routines, the meal arrays,
 * the timetables) and read the answer the way every one of those routes
 * gives it (`revision-put.ts` is the hub's half).
 *
 * A save built from an older copy comes back as a conflict, not an error,
 * because it is the one refusal a surface can do something about. Only a 409
 * that says `reason: 'revision'` is one: the same routes answer 409 for a
 * person who left the family and for an empty list, and taking the hub's copy
 * for either would throw away the change to explain a race that never
 * happened. Anything else rejects with `refusalError` (or what `refused`
 * builds, for a client with an error class of its own); a hub out of reach
 * and an expired session reject as themselves. What to do about a conflict
 * (drop the change, make it again) stays with the caller.
 */
export async function sendRevisionedSave<S>(
  fetcher: HubFetch,
  request: JsonWriteRequest,
  parse: (json: unknown) => S | null,
  refused: string | ((json: unknown, status: number) => Error),
): Promise<RevisionedSave<S>> {
  const res = await fetcher(request.url, {
    method: request.method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request.body),
  });
  const json = await readJson(res);
  if (res.status === 409 && (json as { reason?: unknown } | null)?.reason === 'revision') {
    return { kind: 'conflict', snapshot: parse(json) };
  }
  const saved = res.ok ? parse(json) : null;
  if (!saved) throw typeof refused === 'string' ? refusalError(json, res.status, refused) : refused(json, res.status);
  return { kind: 'saved', snapshot: saved };
}
