import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { withDisplayAuth, parseJsonBody, createTTLCache } from '@/lib/api-utils';
import { getInstalledPlugins } from '@/lib/plugins';
import { sanitizePluginId, getPluginManifest } from '@/lib/plugin-utils';
import { getPluginSecret } from '@/lib/plugin-secrets';
import { audit } from '@/lib/audit';
import { isSafeExternalUrl, isSafeLocalOrExternalUrl } from '@/lib/url-safety';
import {
  isAllowedDomain,
  followRedirectsWithValidation,
  inRefreshCooldown,
  startRefreshCooldown,
  looksLikeExpiredToken,
} from '@/lib/plugin-proxy';
import { getValidAccessToken, loadPluginTokens, tokenInjectionSpec } from '@/lib/plugin-auth';
import type { TokenInjectionSpec } from '@/lib/plugin-auth';

export const dynamic = 'force-dynamic';

// --- Rate limiting (per-plugin, in-memory) ---

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
// Plugins with the localNetwork permission target self-hosted LAN services
// (e.g. Home Assistant), where near-realtime polling is reasonable and the
// blast radius is the user's own hardware — allow a higher request budget.
const RATE_LIMIT_MAX_LAN = 240;

const rateLimits = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(pluginId: string, max: number): boolean {
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
  if (entry.count >= max) return false;
  entry.count++;
  return true;
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

// --- Response cache ---
//
// The TTL is per-request (`cacheTtlMs` from the plugin, clamped below), so
// every `set` passes an explicit entry TTL; the construction-time default
// mirrors the request default and never actually applies.
const proxyCache = createTTLCache<{ body: string; contentType: string }>(60_000);

// --- Constants ---

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
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
  /** Opt out of auth-adapter token injection (for public endpoints on the
   *  same allowed domain that would reject a stale/wrong Authorization). */
  skipAuth?: boolean;
}

// --- Auth token injection ---
//
// The proxy is provider-agnostic: it asks the auth engine for a placement
// spec (which domains, header vs query) and applies it. Provider specifics
// (Garmin's hosts, an OAuth2 client's declared placement) live in
// `plugin-auth`, never here.

/** Apply a bearer token to a request per the injection spec.
 *  Returns the (possibly rewritten) URL; header injection mutates `headers`. */
function injectToken(
  spec: TokenInjectionSpec,
  url: string,
  headers: Record<string, string>,
  token: string,
): string {
  if (spec.placement === 'header') {
    headers.Authorization = `Bearer ${token}`;
    return url;
  }
  const rewritten = new URL(url);
  rewritten.searchParams.set(spec.paramName ?? 'access_token', token);
  return rewritten.toString();
}

type RouteContext = { params: Promise<{ pluginId: string }> };

export const POST = withDisplayAuth<RouteContext>(async (request, ctx) => {
  const { pluginId } = await ctx.params;
  // sanitizePluginId validates and strips unsafe chars (throws on empty)
  const safeId = sanitizePluginId(pluginId);

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

  // Rate limit — LAN-permitted plugins get the higher budget
  const rateLimitMax = manifest.permissions?.includes('localNetwork')
    ? RATE_LIMIT_MAX_LAN
    : RATE_LIMIT_MAX;
  if (!checkRateLimit(safeId, rateLimitMax)) {
    return NextResponse.json(
      { error: `Rate limit exceeded (${rateLimitMax} requests/minute)` },
      { status: 429 },
    );
  }

  // Parse request body
  const body = await parseJsonBody<ProxyRequestBody>(request);
  if (body instanceof NextResponse) return body;
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
  const allowLan = manifest.permissions?.includes('localNetwork') ?? false;
  // Wildcard "*" is only meaningful with localNetwork (otherwise SSRF defense
  // would block the realistic targets anyway). Pair the two explicitly.
  if (allowedDomains.includes('*') && !allowLan) {
    return NextResponse.json(
      { error: 'Wildcard allowedDomains requires the "localNetwork" permission' },
      { status: 403 },
    );
  }
  if (!isAllowedDomain(body.url, allowedDomains, allowLan)) {
    return NextResponse.json(
      { error: 'Upstream domain not in plugin allowedDomains' },
      { status: 403 },
    );
  }
  // SSRF defense-in-depth: always DNS-resolve and re-check. With localNetwork,
  // allow RFC1918 / mDNS but still block loopback + cloud-metadata IPs.
  const safeCheck = allowLan ? isSafeLocalOrExternalUrl : isSafeExternalUrl;
  if (!(await safeCheck(body.url))) {
    return NextResponse.json(
      { error: 'Upstream URL resolves to a blocked address' },
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
    const cached = proxyCache.get(cacheKey);
    if (cached) {
      return new NextResponse(cached.body, {
        headers: { 'Content-Type': cached.contentType },
      });
    }
  }

  // Auth-adapter token injection. The cache key was computed above from the
  // pre-auth URL + headers, so rotating tokens never fragment the cache (a GET
  // to the same resource returns the same data regardless of which valid token
  // authorized it). Injection targets only the adapter's token domains.
  //
  // Trust model: the proxy is keyed by pluginId, not bound to a calling
  // plugin identity — all plugin bundles share the display page, so any
  // installed plugin can call any other's proxy route and receive its
  // authenticated response. This is an accepted property of the install
  // trust boundary (the user vets each plugin before installing it; the same
  // sharing already applied to secretInjections). Do NOT treat installed
  // plugins as mutually isolated principals.
  const auth = manifest.auth;
  const injectSpec = auth ? tokenInjectionSpec(auth, allowedDomains) : null;
  const injectAuth = Boolean(
    injectSpec && !body.skipAuth && isAllowedDomain(upstreamUrl, injectSpec.targetDomains, allowLan),
  );

  // Resolve the token once for the whole request (this hits the token store +
  // refresh path, so a second resolution would be redundant I/O on the hottest
  // route). The single 401-retry re-resolves with force to bypass the expiry
  // check, since that is the only case where a fresh read matters.
  let accessToken = injectAuth ? await getValidAccessToken(safeId) : null;
  if (injectAuth && !accessToken) {
    // Distinguish "never connected" (proceed unauthenticated — plugin may be
    // hitting a public endpoint) from "connected but refresh failed" (surface
    // a reconnect prompt instead of a confusing upstream 401).
    const stored = await loadPluginTokens(safeId);
    if (stored) {
      return NextResponse.json(
        { error: 'auth_expired', message: 'Plugin authentication expired. Reconnect in the module settings.' },
        { status: 401 },
      );
    }
  }

  // Make the upstream request, following redirects with per-hop SSRF
  // re-validation (see followRedirectsWithValidation for the full rationale).
  //
  // On a 401 that names an invalid token, and only when we actually injected
  // one, force-refresh once and retry — a token can go stale between our expiry
  // check and the upstream's clock. A 401 that survives the refresh is not a
  // staleness problem (usually insufficient scope), so it starts a cooldown and
  // the upstream's own 401 is passed through to the plugin rather than being
  // relabelled `auth_expired`: telling the user to reconnect would not fix a
  // scope error.
  const payload = body.payload;
  async function makeRequest(force: boolean) {
    const headers = { ...upstreamHeaders };
    let url = upstreamUrl;
    let injected = false;
    if (injectAuth && injectSpec) {
      if (force) accessToken = await getValidAccessToken(safeId, { force: true });
      if (accessToken) {
        url = injectToken(injectSpec, url, headers, accessToken);
        injected = true;
      }
    }
    const followed = await followRedirectsWithValidation({
      url, method, payload, headers, allowedDomains, allowLan, safeCheck,
    });
    return { followed, injected };
  }

  let { followed, injected } = await makeRequest(false);
  // Only retry when we actually sent a token and the upstream says that token
  // is bad. Retrying a request that carried no token cannot help — there is
  // nothing stale to refresh — and it used to burn a refresh grant anyway.
  if (
    followed.ok &&
    followed.response.status === 401 &&
    injectAuth &&
    injected &&
    looksLikeExpiredToken(followed.response) &&
    !inRefreshCooldown(safeId)
  ) {
    ({ followed, injected } = await makeRequest(true));
    // Still 401 after a real refresh: refreshing is not the fix. Back off so a
    // polling display cannot grind the provider's token endpoint.
    if (followed.ok && followed.response.status === 401) {
      startRefreshCooldown(safeId);
    }
  }
  if (!followed.ok) return followed.error;
  const upstreamRes = followed.response;

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
      proxyCache.set(cacheKey, { body: new TextDecoder().decode(rawBuffer), contentType }, cacheTtl);
    }
  }

  const domain = new URL(body.url).hostname;
  audit({ action: 'plugin_proxy', pluginId: safeId, domain, method, status: upstreamRes.status });

  return new NextResponse(rawBuffer, {
    status: upstreamRes.status,
    headers: { 'Content-Type': contentType },
  });
}, 'Plugin proxy request failed');
