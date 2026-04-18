import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';

/* ─── Cached auth config ─────────────────────── */

interface AuthConfig {
  enabled: boolean;
  ipAllowlist: string[];
  ipRestrictAccess: boolean;
}

let authConfigCache: { value: AuthConfig; at: number } | null = null;
const AUTH_CACHE_TTL = 5_000; // 5 seconds

/**
 * Read auth config from data/auth.json with a short TTL cache.
 * Uses synchronous read since Next.js proxy must return synchronously.
 * Returns auth-enabled flag plus IP allowlist state for access restriction.
 */
function getAuthConfig(): AuthConfig {
  const now = Date.now();
  if (authConfigCache && now - authConfigCache.at < AUTH_CACHE_TTL) {
    return authConfigCache.value;
  }

  let enabled = false;
  let ipAllowlist: string[] = [];
  let ipRestrictAccess = false;
  try {
    const filePath = path.join(process.cwd(), 'data', 'auth.json');
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    enabled = data.passwordHash !== null && data.passwordHash !== undefined;
    if (Array.isArray(data.ipAllowlist)) {
      ipAllowlist = data.ipAllowlist.filter((e: unknown): e is string => typeof e === 'string');
    }
    if (typeof data.ipRestrictAccess === 'boolean') {
      ipRestrictAccess = data.ipRestrictAccess;
    }
  } catch (e: unknown) {
    // ENOENT = file doesn't exist → auth disabled (default state)
    // Any other error (corrupt JSON, permission denied) → fail closed
    if (e && typeof e === 'object' && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT') {
      enabled = false;
    } else {
      enabled = true;
    }
  }

  const value: AuthConfig = { enabled, ipAllowlist, ipRestrictAccess };
  authConfigCache = { value, at: now };
  return value;
}

/* ─── IP allowlist helpers ───────────────────── */

/** Extract client IP from proxy headers. Mirrors getClientIP in api-utils.ts. */
function extractIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Inline IPv4 CIDR match. Mirrors isIpAllowed in ip-allowlist.ts.
 * Duplicated rather than imported to keep the proxy runtime lightweight
 * (avoids pulling in the `net` module which may not be available in Edge).
 *
 * Fails safe: garbage entries are skipped, never treated as match-all.
 * IPv6 addresses (including ::1 and fe80::...) always return false — see
 * the IPv6 warning in SecuritySection.tsx.
 */
function ipMatchesAllowlist(ip: string, allowlist: string[]): boolean {
  // Normalize IPv4-mapped IPv6
  const normalized = ip.replace(/^::ffff:/i, '');
  if (!isValidIPv4(normalized)) return false;

  const parts = normalized.split('.');
  const ipNum = ((+parts[0]) << 24 | (+parts[1]) << 16 | (+parts[2]) << 8 | (+parts[3])) >>> 0;

  for (const entry of allowlist) {
    const [cidrIp, prefixStr] = entry.split('/');
    if (!isValidIPv4(cidrIp)) continue; // fail-safe: skip garbage

    const prefix = prefixStr != null ? +prefixStr : 32;
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) continue;

    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    const cidrParts = cidrIp.split('.');
    const cidrNum = ((+cidrParts[0]) << 24 | (+cidrParts[1]) << 16 | (+cidrParts[2]) << 8 | (+cidrParts[3])) >>> 0;

    if ((ipNum & mask) === (cidrNum & mask)) return true;
  }

  return false;
}

/**
 * IPv4 validator that actually checks octet ranges (regex isn't enough).
 * Matches the behavior of Node's `net.isIPv4()` used by the library version,
 * including rejection of leading zeros ("01.168.1.0" is invalid per RFC).
 */
function isValidIPv4(s: string): boolean {
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)) return false;
  const parts = s.split('.');
  return parts.every((p) => {
    if (p.length > 1 && p[0] === '0') return false; // no leading zeros
    const n = +p;
    return n >= 0 && n <= 255;
  });
}

/* ─── Route classification ───────────────────── */

/**
 * Public auth routes that must always be reachable (even without a session cookie).
 */
const PUBLIC_AUTH_ROUTES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/status',
  '/api/auth/google/callback',
];

/**
 * POST routes accessible without auth — used by display-side plugins and
 * display-only Pi reporters.
 *
 * - /api/plugins/proxy/… — display-side plugin network proxy. The plugin
 *   proxy validates the plugin is installed + enabled and enforces its own
 *   domain allowlist + rate limiting.
 * - /api/display/hw-stats — the per-Pi bash reporter's endpoint. Gated
 *   route-side by requireAdoptedDisplay (displayId must appear in
 *   config.displays), which replaces password auth for this one path. The
 *   reporter runs on a display-only Pi with no session and no bearer token.
 */
function isDisplayAccessiblePost(pathname: string): boolean {
  if (pathname.startsWith('/api/plugins/proxy/')) return true;
  if (pathname === '/api/display/hw-stats') return true;
  return false;
}

/**
 * POST routes the unauthenticated /chores kid view needs:
 *   /api/chores  → toggle a chore completion
 *   /api/rewards → redeem a reward
 *
 * Exact match (not prefix) — the admin-only sub-paths /api/chores/data and
 * /api/rewards/data must stay protected, since reward editing and manual
 * balance adjustments live there. Both handlers do their own input
 * validation and (for redemptions) balance checks.
 */
const KID_VIEW_POST_ROUTES = new Set(['/api/chores', '/api/rewards']);

function isKidViewPost(pathname: string): boolean {
  return KID_VIEW_POST_ROUTES.has(pathname);
}

function isPublicAuthRoute(pathname: string): boolean {
  return PUBLIC_AUTH_ROUTES.some((r) => pathname === r);
}

/**
 * Protected GET routes — editor-only or expose sensitive info.
 * All write operations (PUT/POST/DELETE) on /api/* are protected by default
 * (except public auth routes), so only GET routes need explicit listing here.
 */
const PROTECTED_GET_ROUTES = [
  '/api/secrets',
  '/api/calendars',
  '/api/backgrounds/directories',
  '/api/system/backups',
  '/api/system/changelog',
  '/api/system/version',
  '/api/system/status',
  '/api/auth/password',
  '/api/auth/sessions',
  '/api/auth/google',
  '/api/auth/google/device',
  '/api/auth/google/status',
];

function isProtectedRoute(pathname: string, method: string): boolean {
  // Editor and remote pages — always protected
  if (pathname.startsWith('/editor') || pathname.startsWith('/remote')) return true;

  // API write operations — protected (except public auth routes, display-accessible
  // POSTs, and the LAN-public kid-view POSTs the /chores route depends on)
  if (pathname.startsWith('/api/') && ['PUT', 'POST', 'DELETE'].includes(method)) {
    if (isPublicAuthRoute(pathname)) return false;
    if (method === 'POST' && isDisplayAccessiblePost(pathname)) return false;
    if (method === 'POST' && isKidViewPost(pathname)) return false;
    return true;
  }

  // Specific GET routes that are editor-only
  if (PROTECTED_GET_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'))) {
    return true;
  }

  // Unsplash routes are editor-only
  if (pathname.startsWith('/api/unsplash')) return true;

  return false;
}

/* ─── Proxy ──────────────────────────────────── */

/**
 * Next.js 16 proxy.
 *
 * Two responsibilities:
 * 1. IP access restriction — blocks non-allowlisted IPs from all routes
 *    except /login and /api/auth/status (when enabled via settings).
 * 2. Cookie-presence auth gate — enforces session cookie on protected routes
 *    (only when auth is enabled). Real validation happens in requireSession()
 *    inside route handlers.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  const config = getAuthConfig();

  // ─── IP access restriction ─────────────────
  // Runs before auth checks so non-allowlisted IPs can't even reach the login page
  // via a protected route. /login and /api/auth/status are always exempt so the
  // login page can render its "IP restricted" note.
  if (config.ipRestrictAccess && config.ipAllowlist.length > 0) {
    if (pathname !== '/login' && pathname !== '/api/auth/status') {
      const clientIp = extractIp(request);
      if (!ipMatchesAllowlist(clientIp, config.ipAllowlist)) {
        if (pathname.startsWith('/api/')) {
          return Response.json(
            { error: 'Access denied', reason: 'ip_restricted' },
            { status: 403 },
          );
        }
        // Page routes → redirect to /login (where the note explains the situation)
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  // ─── Auth cookie gate ───────────────────────
  // If auth is not enabled, let everything through
  if (!config.enabled) return NextResponse.next();

  if (!isProtectedRoute(pathname, method)) return NextResponse.next();

  // Cheap credential-presence check (no signature validation here — real
  // validation happens in requireSession / requireDisplayAuth in route handlers).
  // Accept session cookie, Bearer token, or ?token= query param.
  const session = request.cookies.get('hs-session');
  if (session?.value) return NextResponse.next();
  const authHeader = request.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) return NextResponse.next();
  if (request.nextUrl.searchParams.has('token')) return NextResponse.next();

  // No cookie on protected route
  if (pathname.startsWith('/api/')) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Page route — redirect to login (preserve query string so ?tab= survives)
  const loginUrl = new URL('/login', request.url);
  const from = pathname + request.nextUrl.search;
  loginUrl.searchParams.set('from', from);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // IP restriction needs to cover ALL routes, not just auth-protected ones,
    // so we use a broad matcher that excludes only static assets.
    '/((?!_next/static|_next/image|favicon\\.ico|manifest|icons/|\\.well-known).*)',
  ],
};
