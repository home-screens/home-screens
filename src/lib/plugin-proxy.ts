import { NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/api-utils';
import { addressCheckedFetch } from '@/lib/pinned-fetch';
import { isAddressBlockedError, isAllowedDomain } from '@/lib/url-safety';
import { auditProxyDenied } from './audit';

export { isAllowedDomain } from '@/lib/url-safety';

// --- Constants ---

const PROXY_TIMEOUT_MS = 15_000;
/** Maximum number of redirect hops the proxy will follow. Each hop is
 *  re-validated against allowedDomains and isSafeExternalUrl, so this is the
 *  cap on how many DNS lookups a single request can fan out to. */
const MAX_REDIRECT_HOPS = 5;

// --- Redirect following with per-hop SSRF re-validation ---

export interface FollowRedirectsOptions {
  /** Sanitized plugin id, so a refused redirect names the plugin in the audit log. */
  pluginId: string;
  /** Already-validated initial upstream URL. */
  url: string;
  method: string;
  /** Request body for body-bearing methods; ignored for GET/HEAD. */
  payload: string | undefined;
  headers: Record<string, string>;
  /**
   * Names of the headers the proxy itself added: the sign-in token and any
   * saved keys from `secretInjections.header`. They are dropped once a
   * redirect leaves the site they were added for, the way a browser drops
   * `Authorization`, and any other header the plugin set rides on.
   */
  injectedHeaders?: string[];
  /** The proxy put a saved key or the sign-in token in the URL's query. */
  injectedQuery?: boolean;
  allowedDomains: string[];
  allowLan: boolean;
  /** DNS-resolving SSRF check applied to every redirect target. */
  safeCheck: (url: string) => Promise<boolean>;
}

export type FollowRedirectsResult =
  | { ok: true; response: Response }
  | { ok: false; error: NextResponse };

/**
 * Make the upstream request with manual redirect handling.
 *
 * SSRF defense: we MUST re-validate every redirect hop against
 * allowedDomains and isSafeExternalUrl. Letting Node fetch follow redirects
 * automatically (the default) would let an allowed domain return a 302 to
 * http://169.254.169.254/ or http://10.0.0.1/, completely bypassing the
 * DNS-rebinding defense applied to the initial URL. We follow up to
 * MAX_REDIRECT_HOPS hops and re-check each one with the same rules as the
 * initial URL.
 *
 * `safeCheck` resolves a host's name and so does the connection after it,
 * and a hostile DNS server can answer the two differently. Every hop, the
 * first included, is therefore fetched with `addressCheckedFetch`, which
 * checks the address it is about to connect to under the same rule.
 */
export async function followRedirectsWithValidation(
  opts: FollowRedirectsOptions,
): Promise<FollowRedirectsResult> {
  const { pluginId, allowedDomains, allowLan, safeCheck } = opts;
  let headers = opts.headers;
  const injected = new Set((opts.injectedHeaders ?? []).map((name) => name.toLowerCase()));
  const carriesSavedKeys = injected.size > 0 || opts.injectedQuery === true;
  let isBodyMethod = opts.method !== 'GET' && opts.method !== 'HEAD';
  let currentUrl = opts.url;
  let currentMethod = opts.method;
  let currentBody: string | undefined = isBodyMethod ? opts.payload : undefined;
  let upstreamRes!: Response;
  const fetchImpl = addressCheckedFetch(allowLan ? 'home-network' : 'public');
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    try {
      upstreamRes = await fetchWithTimeout(currentUrl, {
        method: currentMethod,
        headers,
        body: isBodyMethod ? currentBody : undefined,
        timeout: PROXY_TIMEOUT_MS,
        redirect: 'manual',
        retries: 0, // Retries belong on the client's request, not per redirect hop
        fetchImpl,
      });
    } catch (error) {
      if (!isAddressBlockedError(error)) throw error;
      // The name passed the check and then resolved to a forbidden address
      // for the connection itself.
      auditProxyDenied(pluginId, currentUrl, hop === 0 ? 'ssrf_blocked' : 'redirect_ssrf_blocked');
      return {
        ok: false,
        error: NextResponse.json(
          { error: hop === 0 ? 'Upstream URL resolves to a blocked address' : 'Redirect target resolves to a blocked address' },
          { status: 403 },
        ),
      };
    }
    // 3xx with no Location header is treated as the final response
    if (upstreamRes.status < 300 || upstreamRes.status >= 400) break;
    const location = upstreamRes.headers.get('location');
    if (!location) break;
    if (hop === MAX_REDIRECT_HOPS) {
      return {
        ok: false,
        error: NextResponse.json({ error: 'Too many redirects from upstream' }, { status: 502 }),
      };
    }
    // Resolve relative redirects against the current URL
    let nextUrl: string;
    try {
      nextUrl = new URL(location, currentUrl).toString();
    } catch {
      return {
        ok: false,
        error: NextResponse.json(
          { error: 'Upstream returned an invalid redirect Location' },
          { status: 502 },
        ),
      };
    }
    // Re-run the same validation we applied to the initial URL
    if (!isAllowedDomain(nextUrl, allowedDomains, allowLan)) {
      auditProxyDenied(pluginId, nextUrl, 'redirect_domain_not_allowed');
      return {
        ok: false,
        error: NextResponse.json(
          { error: 'Redirect target not in plugin allowedDomains' },
          { status: 403 },
        ),
      };
    }
    if (!(await safeCheck(nextUrl))) {
      auditProxyDenied(pluginId, nextUrl, 'redirect_ssrf_blocked');
      return {
        ok: false,
        error: NextResponse.json(
          { error: 'Redirect target resolves to a blocked address' },
          { status: 403 },
        ),
      };
    }
    // Keys and tokens the proxy added belong to the site they were added for,
    // over https. A hop down to plain http is refused outright when any were
    // added (one in the query may have been carried into the new address by
    // the server), and a hop to another site goes on without the added headers.
    const from = new URL(currentUrl);
    const to = new URL(nextUrl);
    if (carriesSavedKeys && from.protocol === 'https:' && to.protocol === 'http:') {
      auditProxyDenied(pluginId, nextUrl, 'redirect_insecure_with_keys');
      return {
        ok: false,
        error: NextResponse.json(
          { error: 'Upstream redirected a request carrying saved keys to an insecure http address' },
          { status: 403 },
        ),
      };
    }
    if (from.origin !== to.origin && injected.size) {
      headers = Object.fromEntries(Object.entries(headers).filter(([name]) => !injected.has(name.toLowerCase())));
      injected.clear();
    }
    // Per the fetch spec, 301/302/303 downgrade to GET and drop the body;
    // 307/308 preserve the original method and body.
    if (upstreamRes.status === 301 || upstreamRes.status === 302 || upstreamRes.status === 303) {
      currentMethod = 'GET';
      currentBody = undefined;
      isBodyMethod = false;
    }
    currentUrl = nextUrl;
  }
  return { ok: true, response: upstreamRes };
}

// --- Auth-refresh throttling ---
//
// A forced token refresh that still yields a 401 means refreshing cannot fix
// this request (most often an insufficient-scope 401, which is
// indistinguishable from an expired token at the HTTP layer). Without a
// cooldown, a display polling a permanently-401ing endpoint every 60s performs
// ~1,440 refresh grants a day. Providers that rotate the refresh token on every
// grant may rate-limit or revoke one that refreshes that abusively, which would
// take out the user's whole account connection. `refreshSerialized` in
// plugin-auth.ts collapses *concurrent* refreshes; this bounds them *over time*.

export const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

const refreshCooldowns = new Map<string, number>();

export function inRefreshCooldown(pluginId: string, now: number = Date.now()): boolean {
  const until = refreshCooldowns.get(pluginId);
  if (until === undefined) return false;
  if (now >= until) {
    refreshCooldowns.delete(pluginId);
    return false;
  }
  return true;
}

export function startRefreshCooldown(pluginId: string, now: number = Date.now()): void {
  refreshCooldowns.set(pluginId, now + REFRESH_COOLDOWN_MS);
  // Evict expired entries while we're here so the map can't grow unbounded.
  for (const [id, until] of refreshCooldowns) {
    if (now >= until) refreshCooldowns.delete(id);
  }
}

/** Test seam — clears all cooldown state. */
export function _resetRefreshCooldowns(): void {
  refreshCooldowns.clear();
}

/**
 * True when a 401 actually indicates a stale token.
 *
 * RFC 6750 says a bearer-token error carries `WWW-Authenticate: Bearer
 * error="invalid_token"`. Treating *every* 401 as staleness makes a permanent
 * scope error look like an expiry, so an explicit error code that is anything
 * other than `invalid_token` suppresses the retry.
 *
 * The `error` parameter is optional in RFC 6750, and plenty of providers answer
 * an expired token with a bare `Bearer realm="..."`. Those get the retry, same
 * as a response with no `WWW-Authenticate` at all — the retry is what recovers
 * the case where our stored expiry says "valid" but the provider disagrees
 * (clock skew, early revocation), and there is nothing to lose by trying once.
 */
export function looksLikeExpiredToken(res: Response): boolean {
  const header = res.headers.get('www-authenticate');
  if (!header) return true;
  const errorCode = /error\s*=\s*"?([\w-]+)"?/i.exec(header)?.[1];
  if (!errorCode) return true;
  return errorCode.toLowerCase() === 'invalid_token';
}
