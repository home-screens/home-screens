import { NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/api-utils';
import { isBlockedHost } from '@/lib/url-safety';

// --- Constants ---

const PROXY_TIMEOUT_MS = 15_000;
/** Maximum number of redirect hops the proxy will follow. Each hop is
 *  re-validated against allowedDomains and isSafeExternalUrl, so this is the
 *  cap on how many DNS lookups a single request can fan out to. */
const MAX_REDIRECT_HOPS = 5;

// --- Domain validation ---

function matchesDomain(hostname: string, pattern: string): boolean {
  if (pattern === '*') return true; // caller already checked isBlockedHost
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return hostname === suffix || hostname.endsWith('.' + suffix);
  }
  return hostname === pattern;
}

export function isAllowedDomain(url: string, allowedDomains: string[], allowLan: boolean): boolean {
  try {
    const { hostname } = new URL(url);
    // Without allowLan, apply the strict SSRF blocklist (rejects all private
    // ranges and loopback). With allowLan, reject only the targets that are
    // dangerous regardless of permission: cloud metadata + unspecified.
    if (!allowLan && isBlockedHost(hostname)) return false;
    if (allowLan) {
      const lit = hostname.toLowerCase();
      if (lit === '0.0.0.0' || lit === '169.254.169.254') return false;
    }
    return allowedDomains.some((pattern) => matchesDomain(hostname, pattern));
  } catch {
    return false;
  }
}

// --- Redirect following with per-hop SSRF re-validation ---

export interface FollowRedirectsOptions {
  /** Already-validated initial upstream URL. */
  url: string;
  method: string;
  /** Request body for body-bearing methods; ignored for GET/HEAD. */
  payload: string | undefined;
  headers: Record<string, string>;
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
 */
export async function followRedirectsWithValidation(
  opts: FollowRedirectsOptions,
): Promise<FollowRedirectsResult> {
  const { headers, allowedDomains, allowLan, safeCheck } = opts;
  let isBodyMethod = opts.method !== 'GET' && opts.method !== 'HEAD';
  let currentUrl = opts.url;
  let currentMethod = opts.method;
  let currentBody: string | undefined = isBodyMethod ? opts.payload : undefined;
  let upstreamRes!: Response;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    upstreamRes = await fetchWithTimeout(currentUrl, {
      method: currentMethod,
      headers,
      body: isBodyMethod ? currentBody : undefined,
      timeout: PROXY_TIMEOUT_MS,
      redirect: 'manual',
      retries: 0, // Retries belong on the client's request, not per redirect hop
    });
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
      return {
        ok: false,
        error: NextResponse.json(
          { error: 'Redirect target not in plugin allowedDomains' },
          { status: 403 },
        ),
      };
    }
    if (!(await safeCheck(nextUrl))) {
      return {
        ok: false,
        error: NextResponse.json(
          { error: 'Redirect target resolves to a blocked address' },
          { status: 403 },
        ),
      };
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
