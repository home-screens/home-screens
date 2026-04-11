import { NextRequest, NextResponse } from 'next/server';

/**
 * IP access restriction middleware.
 * Blocks non-allowlisted IPs from all routes except /login and /api/auth/status.
 * Reads auth.json directly with a TTL cache to avoid import cycles with auth.ts.
 */

const CACHE_TTL = 5_000;
let cached: { data: IpConfig; at: number } | null = null;

interface IpConfig {
  ipAllowlist?: string[];
  ipRestrictAccess?: boolean;
}

async function getIpConfig(): Promise<IpConfig> {
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const raw = await fs.readFile(path.join(process.cwd(), 'data/auth.json'), 'utf-8');
    const data = JSON.parse(raw) as IpConfig;
    cached = { data, at: Date.now() };
    return data;
  } catch {
    return {};
  }
}

/** Extract client IP from proxy headers. Mirrors getClientIP in api-utils.ts. */
function extractIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** Inline IPv4 CIDR match. Avoids importing net module (Edge compat). */
function ipMatchesAllowlist(ip: string, allowlist: string[]): boolean {
  // Normalize IPv4-mapped IPv6
  const normalized = ip.replace(/^::ffff:/i, '');
  // Quick IPv4 check (avoid net module in middleware)
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) return false;

  const parts = normalized.split('.');
  const ipNum = ((+parts[0]) << 24 | (+parts[1]) << 16 | (+parts[2]) << 8 | (+parts[3])) >>> 0;

  for (const entry of allowlist) {
    const [cidrIp, prefixStr] = entry.split('/');
    const prefix = prefixStr != null ? +prefixStr : 32;
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    const cidrParts = cidrIp.split('.');
    const cidrNum = ((+cidrParts[0]) << 24 | (+cidrParts[1]) << 16 | (+cidrParts[2]) << 8 | (+cidrParts[3])) >>> 0;

    if ((ipNum & mask) === (cidrNum & mask)) return true;
  }

  return false;
}

export async function middleware(request: NextRequest) {
  const config = await getIpConfig();

  // Feature disabled or no allowlist → pass through
  if (!config.ipRestrictAccess || !config.ipAllowlist?.length) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Exempt paths: login page and auth status endpoint
  if (pathname === '/login' || pathname === '/api/auth/status') {
    return NextResponse.next();
  }

  const clientIp = extractIp(request);

  if (ipMatchesAllowlist(clientIp, config.ipAllowlist)) {
    return NextResponse.next();
  }

  // Blocked: API routes get 403 JSON, pages redirect to login
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Access denied', reason: 'ip_restricted' },
      { status: 403 },
    );
  }

  // Page routes: redirect to /login
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, icons, manifest
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icons/|manifest).*)',
  ],
};
