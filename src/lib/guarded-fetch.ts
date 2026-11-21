/**
 * Fetching a user-supplied URL safely: the address checks from
 * `url-safety.ts` applied to every redirect hop, and a body read that stops
 * at a byte cap.
 *
 * Kept apart from the checks so a test can stand in for the DNS lookup
 * (mocking `url-safety`) and still run the real redirect loop.
 */

import { fetchWithTimeout } from '@/lib/api-utils';
import { isAllowedDomain, isSafeExternalUrl, isSafeLocalOrExternalUrl, matchesAllowedHost } from '@/lib/url-safety';

// ── Why every hop is followed by hand ────────────────────────────────────
//
// Following redirects is where an SSRF check quietly stops working: an
// allowed public host answers 302 and points at http://169.254.169.254/ or
// http://192.168.1.1/, and fetch's automatic following takes us there with
// no second check. So every hop is followed by hand and re-checked with the
// same rules as the first URL, and the body is read against a byte cap so a
// link to something enormous cannot exhaust memory.
//
// This reads a URL with GET. The plugin proxy carries a method and a body
// and streams the response straight back to its caller, so it keeps its own
// loop; everything that downloads a document can use this.

/** Why a fetch could not be completed. Callers map these to their own wording. */
export type FetchRedirectFailure =
  /** The link, or a Location header, is not a usable web address. */
  | 'invalid-url'
  /** The host is outside `allowHosts`. */
  | 'not-allowed'
  /** The host resolves to a private, loopback or cloud-metadata address. */
  | 'blocked'
  /** More redirects than `maxHops`. */
  | 'too-many-redirects'
  /** The response body is over `maxBytes`. */
  | 'too-large'
  /** No answer within `timeoutMs`. */
  | 'timeout'
  /** The connection failed. */
  | 'unreachable';

export interface FetchWithAllowedRedirectsOptions {
  /**
   * Hosts the request may reach, as exact hostnames, `*.example.com` for a
   * domain and its subdomains, or `*` for any host that is not blocked.
   */
  allowHosts: string[];
  /** Redirects to follow before giving up. Default 5. */
  maxHops?: number;
  /** Cap on the response body, enforced while reading. Default 1 MB. */
  maxBytes?: number;
  /** Per-request timeout in ms. Default 15000. */
  timeoutMs?: number;
  /** Retries per request on a timeout or a 5xx. Default 0. */
  retries?: number;
  /** Extra request headers, such as a user agent or an accept header. */
  headers?: Record<string, string>;
  /**
   * Allow private addresses, for a household that runs the service being
   * fetched on its own network. That includes the hub itself (loopback), for
   * a service running beside it. Cloud metadata stays blocked.
   */
  allowPrivateNetwork?: boolean;
  /**
   * Replaces the built-in address check, for the one caller whose first URL
   * may be an address a later hop may not (a tarball typed as
   * `http://localhost` for local testing). `hop` is 0 for the URL passed in
   * and counts up with each redirect. `allowHosts` is still matched; with
   * this set, nothing else refuses a private address, so the function must.
   */
  isSafe?: (url: string, hop: number) => Promise<boolean>;
}

export type FetchWithAllowedRedirectsResult =
  | {
      /**
       * The request finished safely and the whole body fits the cap. This
       * says nothing about the HTTP result: check `status`, since an error
       * page is often the most useful thing to show a person.
       */
      ok: true;
      /** The URL that answered, after any redirects. */
      url: string;
      status: number;
      /** Lowercased content type, parameters included, or '' when absent. */
      contentType: string;
      /**
       * The answering response's headers. Some downloads carry the only copy
       * of a useful name in `content-disposition`, so callers need to read
       * headers other than the content type.
       */
      responseHeaders: Headers;
      body: Uint8Array<ArrayBuffer>;
    }
  | {
      ok: false;
      reason: FetchRedirectFailure;
      /** The URL the failure happened at, which may be a redirect target. */
      url: string;
      status?: number;
      contentType?: string;
    };

function fetchFailure(error: unknown): 'timeout' | 'unreachable' {
  const name = error instanceof Error ? error.name : '';
  return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable';
}

const DEFAULT_MAX_HOPS = 5;
const DEFAULT_MAX_BODY_BYTES = 1_000_000;
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

/**
 * Read a response body in chunks, stopping as soon as the running total goes
 * over `maxBytes`. Returns null when it does, so nothing oversized is ever
 * held in memory in full.
 */
export async function readBoundedBody(res: Response, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  // Fast path: trust a sane Content-Length before consuming anything.
  const declaredLength = Number(res.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;

  const reader = res.body?.getReader();
  // No streaming body. Real responses always have one; this is for synthetic
  // responses that turn up in tests.
  if (!reader) {
    const buffered = new Uint8Array(await res.arrayBuffer());
    return buffered.byteLength > maxBytes ? null : buffered;
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > maxBytes) {
      // Cancel so the socket is released instead of being drained.
      try { await reader.cancel(); } catch { /* ignore */ }
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * GET a URL, following redirects by hand and re-checking every hop against
 * `allowHosts` and the SSRF blocklist before going there.
 *
 * Never throws: a timeout, a refused hop or an oversized body all come back
 * as `{ ok: false, reason }` with the URL that caused it, which is enough to
 * tell a person in plain words what went wrong.
 */
export async function fetchWithAllowedRedirects(
  url: string,
  options: FetchWithAllowedRedirectsOptions,
): Promise<FetchWithAllowedRedirectsResult> {
  const {
    allowHosts,
    maxHops = DEFAULT_MAX_HOPS,
    maxBytes = DEFAULT_MAX_BODY_BYTES,
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    retries = 0,
    headers,
    allowPrivateNetwork = false,
    isSafe: customIsSafe,
  } = options;

  const isSafe = (candidate: string, hop: number) => {
    if (customIsSafe) return customIsSafe(candidate, hop);
    return allowPrivateNetwork ? isSafeLocalOrExternalUrl(candidate) : isSafeExternalUrl(candidate);
  };
  // A caller with its own address check decides about private addresses
  // there, so only the host list is matched here.
  const hostAllowed = (candidate: string) =>
    customIsSafe ? matchesAllowedHost(candidate, allowHosts) : isAllowedDomain(candidate, allowHosts, allowPrivateNetwork);

  let current: string;
  try {
    current = new URL(url).toString();
  } catch {
    return { ok: false, reason: 'invalid-url', url };
  }
  if (!hostAllowed(current)) {
    return { ok: false, reason: 'not-allowed', url: current };
  }
  if (!(await isSafe(current, 0))) {
    return { ok: false, reason: 'blocked', url: current };
  }

  let res!: Response;
  for (let hop = 0; ; hop++) {
    try {
      res = await fetchWithTimeout(current, {
        timeout: timeoutMs,
        retries,
        redirect: 'manual',
        headers,
      });
    } catch (err) {
      return { ok: false, reason: fetchFailure(err), url: current };
    }

    // A 3xx without a Location header has nowhere to go, so it is the answer.
    if (res.status < 300 || res.status >= 400) break;
    const location = res.headers.get('location');
    if (!location) break;

    if (hop === maxHops) {
      return { ok: false, reason: 'too-many-redirects', url: current };
    }

    let next: string;
    try {
      next = new URL(location, current).toString();
    } catch {
      return { ok: false, reason: 'invalid-url', url: current };
    }
    // The whole point of following by hand: the same two checks the first URL
    // had to pass, before anything is fetched from the new host.
    if (!hostAllowed(next)) {
      return { ok: false, reason: 'not-allowed', url: next };
    }
    if (!(await isSafe(next, hop + 1))) {
      return { ok: false, reason: 'blocked', url: next };
    }
    current = next;
  }

  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  let body: Uint8Array<ArrayBuffer> | null;
  try {
    body = await readBoundedBody(res, maxBytes);
  } catch (error) {
    return { ok: false, reason: fetchFailure(error), url: current, status: res.status, contentType };
  }
  if (!body) {
    return { ok: false, reason: 'too-large', url: current, status: res.status, contentType };
  }
  return { ok: true, url: current, status: res.status, contentType, responseHeaders: res.headers, body };
}
