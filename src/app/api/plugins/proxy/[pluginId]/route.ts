import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { errorResponse, fetchWithTimeout, withDisplayAuth } from '@/lib/api-utils';
import { getInstalledPlugins } from '@/lib/plugins';
import { sanitizePluginId, getPluginManifest } from '@/lib/plugin-utils';
import { getPluginSecret } from '@/lib/plugin-secrets';
import { audit } from '@/lib/audit';
import { isBlockedHost } from '@/lib/url-safety';

export const dynamic = 'force-dynamic';

// --- Rate limiting (per-plugin, in-memory) ---

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

const rateLimits = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(pluginId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(pluginId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(pluginId, { count: 1, windowStart: now });
    // Evict stale entries while we're here
    for (const [id, e] of rateLimits) {
      if (now - e.windowStart > RATE_LIMIT_WINDOW_MS) rateLimits.delete(id);
    }
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// --- Domain validation ---

function matchesDomain(hostname: string, pattern: string): boolean {
  if (pattern === '*') return true; // caller already checked isBlockedHost
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return hostname === suffix || hostname.endsWith('.' + suffix);
  }
  return hostname === pattern;
}

function isAllowedDomain(url: string, allowedDomains: string[]): boolean {
  try {
    const { hostname } = new URL(url);
    // Block internal/metadata hosts unconditionally — no manifest can override this
    if (isBlockedHost(hostname)) return false;
    return allowedDomains.some((pattern) => matchesDomain(hostname, pattern));
  } catch {
    return false;
  }
}

// --- Secret placeholder resolution ---

async function resolveSecrets(
  pluginId: string,
  template: Record<string, string>,
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(template)) {
    let result = value;
    // Fresh regex per value — matches any key chars allowed in manifest declarations
    const matches = value.matchAll(/\{\{([a-z0-9_-]+)\}\}/gi);
    for (const match of matches) {
      const secretKey = match[1];
      const secretValue = await getPluginSecret(pluginId, secretKey);
      if (secretValue === null || secretValue === '') {
        throw new Error(`Secret "${secretKey}" is not configured for plugin "${pluginId}"`);
      }
      result = result.replaceAll(match[0], secretValue);
    }
    resolved[key] = result;
  }
  return resolved;
}

// --- Per-entry TTL cache ---

const MAX_CACHE_ENTRIES = 50;
const proxyCache = new Map<string, { body: string; contentType: string; expiresAt: number }>();

function getCached(key: string): { body: string; contentType: string } | null {
  const entry = proxyCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    proxyCache.delete(key);
    return null;
  }
  return { body: entry.body, contentType: entry.contentType };
}

function setCached(key: string, body: string, contentType: string, ttlMs: number): void {
  // Evict expired entries when at capacity
  if (!proxyCache.has(key) && proxyCache.size >= MAX_CACHE_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of proxyCache) {
      if (now > v.expiresAt) proxyCache.delete(k);
    }
    // If still full, drop oldest
    if (proxyCache.size >= MAX_CACHE_ENTRIES) {
      const oldest = proxyCache.keys().next().value;
      if (oldest !== undefined) proxyCache.delete(oldest);
    }
  }
  proxyCache.set(key, { body, contentType, expiresAt: Date.now() + ttlMs });
}

// --- Constants ---

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const PROXY_TIMEOUT_MS = 15_000;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH']);

// --- Route handler ---

interface ProxyRequestBody {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  payload?: string;        // request body for POST/PUT/PATCH
  secretInjections?: {
    header?: Record<string, string>;
    query?: Record<string, string>;
  };
  cacheTtlMs?: number;
}

type RouteContext = { params: Promise<{ pluginId: string }> };

export const POST = withDisplayAuth<RouteContext>(async (request, ctx) => {
  const { pluginId } = await ctx.params;
  // sanitizePluginId validates and strips unsafe chars (throws on empty)
  const safeId = sanitizePluginId(pluginId);

  try {
    // Look up by raw pluginId (matches installed.json entries) and verify enabled
    const installed = await getInstalledPlugins();
    const plugin = installed.plugins.find((p) => p.id === pluginId && p.enabled);
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not installed or not enabled' }, { status: 404 });
    }

    // Load manifest (uses sanitized ID for filesystem path)
    const manifest = await getPluginManifest(safeId);
    if (!manifest) {
      return NextResponse.json({ error: 'Plugin manifest not found' }, { status: 404 });
    }

    // Rate limit
    if (!checkRateLimit(safeId)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded (60 requests/minute)' },
        { status: 429 },
      );
    }

    // Parse request body
    const body: ProxyRequestBody = await request.json();
    if (!body.url || typeof body.url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    // Enforce request payload size limit (1MB)
    if (body.payload && body.payload.length > 1_048_576) {
      return NextResponse.json({ error: 'Payload too large (max 1MB)' }, { status: 413 });
    }

    // Validate HTTP method
    const method = (body.method ?? 'GET').toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
      return NextResponse.json(
        { error: `HTTP method "${method}" is not allowed. Use GET, POST, PUT, or PATCH.` },
        { status: 400 },
      );
    }

    // Validate domain
    const allowedDomains = manifest.allowedDomains ?? [];
    if (allowedDomains.length === 0) {
      return NextResponse.json(
        { error: 'Plugin has no allowedDomains declared — proxy requests denied' },
        { status: 403 },
      );
    }
    if (!isAllowedDomain(body.url, allowedDomains)) {
      return NextResponse.json(
        { error: 'Upstream domain not in plugin allowedDomains' },
        { status: 403 },
      );
    }

    // Resolve secret injections
    let upstreamUrl = body.url;
    const upstreamHeaders: Record<string, string> = { ...body.headers };

    if (body.secretInjections?.header) {
      const resolved = await resolveSecrets(safeId, body.secretInjections.header);
      Object.assign(upstreamHeaders, resolved);
    }

    if (body.secretInjections?.query) {
      const resolved = await resolveSecrets(safeId, body.secretInjections.query);
      const url = new URL(upstreamUrl);
      for (const [key, value] of Object.entries(resolved)) {
        url.searchParams.set(key, value);
      }
      upstreamUrl = url.toString();
    }

    // Check cache (GET-only, keyed on resolved URL + headers hash)
    const cacheTtl = Math.min(Math.max(body.cacheTtlMs ?? 60_000, 0), 3600_000);
    const headerHash = crypto.createHash('sha256')
      .update(JSON.stringify(Object.entries(upstreamHeaders).sort()))
      .digest('hex').slice(0, 8);
    const cacheKey = `${safeId}:${upstreamUrl}:${headerHash}`;
    if (method === 'GET' && cacheTtl > 0) {
      const cached = getCached(cacheKey);
      if (cached) {
        return new NextResponse(cached.body, {
          headers: { 'Content-Type': cached.contentType },
        });
      }
    }

    // Make upstream request
    const isBodyMethod = method !== 'GET' && method !== 'HEAD';
    const upstreamRes = await fetchWithTimeout(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      body: isBodyMethod ? body.payload : undefined,
      timeout: PROXY_TIMEOUT_MS,
    });

    // Enforce response size limit
    const contentLength = upstreamRes.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      return NextResponse.json(
        { error: 'Upstream response too large (max 5MB)' },
        { status: 502 },
      );
    }

    const rawBuffer = await upstreamRes.arrayBuffer();
    if (rawBuffer.byteLength > MAX_RESPONSE_SIZE) {
      return NextResponse.json(
        { error: 'Upstream response too large (max 5MB)' },
        { status: 502 },
      );
    }

    const contentType = upstreamRes.headers.get('content-type') ?? 'application/octet-stream';

    // Cache successful GET text/json responses with per-entry TTL
    if (method === 'GET' && upstreamRes.ok && cacheTtl > 0) {
      const isTextContent = contentType.startsWith('text/') ||
        contentType.includes('json') || contentType.includes('xml');
      if (isTextContent) {
        setCached(cacheKey, new TextDecoder().decode(rawBuffer), contentType, cacheTtl);
      }
    }

    const domain = new URL(body.url).hostname;
    audit({ action: 'plugin_proxy', pluginId: safeId, domain, method, status: upstreamRes.status });

    return new NextResponse(rawBuffer, {
      status: upstreamRes.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (error) {
    return errorResponse(error, 'Plugin proxy request failed');
  }
}, 'Plugin proxy request failed');
