import { NextRequest, NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { requireSession, requireDisplayAuth } from '@/lib/auth';
import { getSecret, type SecretKey } from '@/lib/secrets';
/**
 * Standardized error response for API routes.
 *
 * Returns `{ error: fallbackMessage, detail: error.message }`. `detail` is
 * deliberately surfaced to clients — the Plugin Store and other admin UIs
 * render it as diagnostic text so operators can see what actually failed
 * (e.g. "flat tarball", "invalid manifest", upstream HTTP status). The full
 * error is also logged server-side.
 *
 * Threat model: every route using this helper is behind admin auth
 * (`withAuth` / `withDisplayAuth`) except `/api/auth/login`, which only
 * throws on infra failures (e.g. config read errors) — not on bad
 * credentials. `error.message` from Node builtins can include file paths,
 * upstream URLs, or command stderr, which is acceptable for authenticated
 * admin-only surfaces. Do NOT use this helper on unauthenticated public
 * endpoints; return a bare `{ error }` there instead.
 */
export function errorResponse(
  error: unknown,
  fallbackMessage: string,
  status = 500,
): NextResponse {
  const detail = error instanceof Error ? error.message : undefined;
  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage, detail }, { status });
}

/**
 * Fetch wrapper that enforces a timeout and retries transient failures.
 * All external HTTP calls in the codebase flow through this function,
 * so adding retry here gives automatic resilience to every API route.
 *
 * Backwards-compatible: existing callers that only pass `timeout` keep working.
 * New callers can pass `retries`, `baseDelayMs`, `maxDelayMs` to customize.
 */
export function fetchWithTimeout(
  url: string | URL | Request,
  init?: FetchRetryOptions,
): Promise<Response> {
  return fetchWithRetry(url, init);
}

/**
 * Returns true for HTTP status codes that indicate a transient failure
 * worth retrying: 429 (rate-limited) and 5xx (server errors).
 */
export function isTransientError(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Parses a `Retry-After` header value (delay-seconds only, not HTTP-date).
 * Returns the delay in milliseconds, clamped to 60s to prevent an upstream
 * from stalling us indefinitely. Returns null if the header is absent or unparseable.
 */
const MAX_RETRY_AFTER_MS = 60_000;

export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

export interface FetchRetryOptions extends RequestInit {
  /** Per-attempt timeout in ms (passed to AbortSignal.timeout). Default: 10_000. */
  timeout?: number;
  /** Number of retries after the initial attempt. 0 = no retries. Default: 2. */
  retries?: number;
  /** Initial backoff delay in ms. Doubles each retry. Default: 500. */
  baseDelayMs?: number;
  /** Maximum backoff delay in ms. Default: 5_000. */
  maxDelayMs?: number;
}

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 5_000;

/**
 * Fetch with timeout + automatic retry on transient failures.
 *
 * Retries on 5xx, 429, network errors (TypeError), and timeouts.
 * Does NOT retry on 4xx (client errors) or caller-initiated aborts.
 * Respects the `Retry-After` response header when present.
 * Uses exponential backoff: baseDelayMs * 2^attempt, capped at maxDelayMs.
 */
export async function fetchWithRetry(
  url: string | URL | Request,
  init?: FetchRetryOptions,
): Promise<Response> {
  const {
    timeout = DEFAULT_FETCH_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    ...rest
  } = init ?? {};

  let lastResponse: Response | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const timeoutSignal = AbortSignal.timeout(timeout);
      const signal = rest.signal
        ? AbortSignal.any([rest.signal, timeoutSignal])
        : timeoutSignal;

      const response = await fetch(url, { ...rest, signal });

      if (!isTransientError(response.status) || attempt === retries) {
        return response;
      }

      // Transient error — schedule a retry
      lastResponse = response;
      const retryAfterMs = parseRetryAfter(response.headers?.get('Retry-After') ?? null);
      const backoffMs = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const delayMs = retryAfterMs ?? backoffMs;

      await delay(delayMs, rest.signal);
    } catch (error) {
      // Caller-initiated abort — don't retry
      if (rest.signal?.aborted) throw error;

      // Network errors (TypeError) and timeouts are retryable
      const isRetryable =
        error instanceof TypeError ||
        (error instanceof DOMException && error.name === 'TimeoutError');

      if (!isRetryable || attempt === retries) {
        throw error;
      }

      lastError = error;
      const backoffMs = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      await delay(backoffMs, rest.signal);
    }
  }

  // Should be unreachable, but satisfy TypeScript
  if (lastResponse) return lastResponse;
  throw lastError;
}

/** Promise-based delay that rejects early if the signal is aborted. */
function delay(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Reads lat/lon from config (with weather settings fallback),
 * allowing override from searchParams. Returns null if missing.
 */
export async function getLocationFromConfig(
  searchParams?: URLSearchParams,
  existingConfig?: Awaited<ReturnType<typeof readConfig>>,
): Promise<{ lat: string; lon: string } | null> {
  let config = existingConfig;
  if (!config) {
    try {
      config = await readConfig();
    } catch {
      // config not available
    }
  }
  const s = config?.settings;
  const ws = s?.weather;
  const lat =
    searchParams?.get('lat') ?? s?.latitude?.toString() ?? ws?.latitude?.toString();
  const lon =
    searchParams?.get('lon') ?? s?.longitude?.toString() ?? ws?.longitude?.toString();
  if (!lat || !lon) return null;
  return { lat, lon };
}

/**
 * Creates a simple in-memory cache with TTL expiration.
 * Expired entries are cleaned up on access and when at capacity.
 */
const SERVER_CACHE_MAX_ENTRIES = 50;

export function createTTLCache<T>(ttlMs: number) {
  const cache = new Map<string, { data: T; timestamp: number }>();
  return {
    get(key: string): T | null {
      const entry = cache.get(key);
      if (!entry) return null;
      if (Date.now() - entry.timestamp > ttlMs) {
        cache.delete(key);
        return null;
      }
      return entry.data;
    },
    set(key: string, data: T) {
      if (!cache.has(key) && cache.size >= SERVER_CACHE_MAX_ENTRIES) {
        // Evict expired entries first
        const now = Date.now();
        for (const [k, v] of cache) {
          if (now - v.timestamp > ttlMs) cache.delete(k);
        }
        // If still full, drop the oldest entry (Map insertion order)
        if (cache.size >= SERVER_CACHE_MAX_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
      }
      cache.set(key, { data, timestamp: Date.now() });
    },
    clear() {
      cache.clear();
    },
  };
}

/**
 * Validates a Todoist API token by making a lightweight request to the
 * Todoist projects endpoint. Returns `true` if the token is valid, or an
 * object with the HTTP status code if it is not.
 */
export async function validateTodoistToken(
  token: string,
): Promise<{ valid: true } | { valid: false; status: number }> {
  const res = await fetchWithTimeout('https://api.todoist.com/api/v1/projects', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { valid: false, status: res.status };
  return { valid: true };
}

/* ─── Rate limiting ──────────────────────────── */

/**
 * Creates an in-memory per-IP rate limiter.
 * After `maxAttempts` failures within `windowMs`, subsequent calls to
 * `isLimited()` return true until the window expires.
 */
export function createRateLimiter(maxAttempts: number, windowMs: number) {
  const attempts = new Map<string, { count: number; resetAt: number }>();
  return {
    isLimited(ip: string): boolean {
      const entry = attempts.get(ip);
      if (!entry) return false;
      if (Date.now() > entry.resetAt) {
        attempts.delete(ip);
        return false;
      }
      return entry.count >= maxAttempts;
    },
    recordFailure(ip: string): void {
      const entry = attempts.get(ip);
      if (!entry || Date.now() > entry.resetAt) {
        attempts.set(ip, { count: 1, resetAt: Date.now() + windowMs });
      } else {
        entry.count++;
      }
    },
    clear(ip: string): void {
      attempts.delete(ip);
    },
  };
}

/** Extract the client IP from standard proxy headers. */
export function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Wraps an authenticated API route handler with the standard
 * requireSession + error-handling boilerplate.
 *
 * Before:
 *   export async function GET(request: NextRequest) {
 *     try {
 *       await requireSession(request);
 *       // …handler logic…
 *     } catch (error) {
 *       if (error instanceof Response) return error;
 *       return errorResponse(error, 'Failed to …');
 *     }
 *   }
 *
 * After:
 *   export const GET = withAuth(async (request) => {
 *     // …handler logic…
 *   }, 'Failed to …');
 */
export function withAuth<C = unknown>(
  handler: (request: NextRequest, context: C) => Promise<Response>,
  errorMsg: string,
) {
  return async (request: NextRequest, context?: C): Promise<Response> => {
    try {
      await requireSession(request);
      return await handler(request, context as C);
    } catch (error) {
      if (error instanceof Response) return error;
      return errorResponse(error, errorMsg);
    }
  };
}

/**
 * Like `withAuth`, but accepts either a session cookie OR a display Bearer token.
 * Use this for endpoints the display polls (config, weather, commands, etc.).
 */
export function withDisplayAuth<C = unknown>(
  handler: (request: NextRequest, context: C) => Promise<Response>,
  errorMsg: string,
) {
  return async (request: NextRequest, context?: C): Promise<Response> => {
    try {
      await requireDisplayAuth(request, getClientIP(request));
      return await handler(request, context as C);
    } catch (error) {
      if (error instanceof Response) return error;
      return errorResponse(error, errorMsg);
    }
  };
}

interface CachedProxyRouteBase {
  ttlMs: number;
  errorMessage: string;
  /** Auth tier for this route. 'display' accepts session or display token; 'session' requires session only. */
  auth?: 'display' | 'session';
}

interface CachedProxyRouteOptions<T> extends CachedProxyRouteBase {
  cacheKey?: (request: NextRequest) => string | Promise<string>;
  url: string | ((request: NextRequest) => string);
  fetchInit?: RequestInit;
  transform: (data: unknown, request: NextRequest) => T;
}

interface CachedProxyRouteCustomOptions<T> extends CachedProxyRouteBase {
  cacheKey?: (request: NextRequest) => string | Promise<string>;
  execute: (request: NextRequest) => Promise<T | NextResponse>;
}

/**
 * Custom config with a `prepare` step that runs once per request.
 * The prepared data is passed to both `cacheKey` and `execute`,
 * avoiding redundant work like double `readConfig()` calls.
 */
interface CachedProxyRoutePreparedOptions<T, P> extends CachedProxyRouteBase {
  prepare: (request: NextRequest) => Promise<P>;
  cacheKey: (prepared: P) => string;
  execute: (prepared: P, request: NextRequest) => Promise<T | NextResponse>;
}

type CachedProxyRouteConfig<T, P = never> =
  | CachedProxyRouteOptions<T>
  | CachedProxyRouteCustomOptions<T>
  | CachedProxyRoutePreparedOptions<T, P>;

function isPreparedConfig<T, P>(config: CachedProxyRouteConfig<T, P>): config is CachedProxyRoutePreparedOptions<T, P> {
  return 'prepare' in config;
}

function isCustomConfig<T>(config: CachedProxyRouteOptions<T> | CachedProxyRouteCustomOptions<T>): config is CachedProxyRouteCustomOptions<T> {
  return 'execute' in config;
}

export function cachedProxyRoute<T>(config: CachedProxyRouteOptions<T>): { GET: (request: NextRequest) => Promise<NextResponse>; cache: ReturnType<typeof createTTLCache<T>> };
export function cachedProxyRoute<T>(config: CachedProxyRouteCustomOptions<T>): { GET: (request: NextRequest) => Promise<NextResponse>; cache: ReturnType<typeof createTTLCache<T>> };
export function cachedProxyRoute<T, P>(config: CachedProxyRoutePreparedOptions<T, P>): { GET: (request: NextRequest) => Promise<NextResponse>; cache: ReturnType<typeof createTTLCache<T>> };
export function cachedProxyRoute<T, P = never>(config: CachedProxyRouteConfig<T, P>) {
  const cache = createTTLCache<T>(config.ttlMs);

  const GET = async (request: NextRequest) => {
    try {
      if (config.auth === 'display') await requireDisplayAuth(request, getClientIP(request));
      else if (config.auth === 'session') await requireSession(request);

      let result: T | NextResponse;

      if (isPreparedConfig(config)) {
        const prepared = await config.prepare(request);
        const key = config.cacheKey(prepared);
        const cached = cache.get(key);
        if (cached) return NextResponse.json(cached);

        result = await config.execute(prepared, request);
        if (result instanceof NextResponse) return result;
        cache.set(key, result);
        return NextResponse.json(result);
      }

      const keyFn = config.cacheKey ?? (() => '_');
      const key = await keyFn(request);
      const cached = cache.get(key);
      if (cached) return NextResponse.json(cached);

      if (isCustomConfig(config)) {
        result = await config.execute(request);
      } else {
        const resolvedUrl = typeof config.url === 'function' ? config.url(request) : config.url;
        const res = await fetchWithTimeout(resolvedUrl, config.fetchInit);
        if (!res.ok) {
          return NextResponse.json({ error: config.errorMessage }, { status: 502 });
        }
        const data = await res.json();
        result = config.transform(data, request);
      }

      if (result instanceof NextResponse) return result;
      cache.set(key, result);
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof Response) return error;
      return errorResponse(error, config.errorMessage);
    }
  };

  return { GET, cache };
}

/**
 * Reads a secret and returns it, or returns a 400 NextResponse if not configured.
 * Usage: `const key = await requireSecret('openweathermap_key', 'OpenWeatherMap'); if (key instanceof NextResponse) return key;`
 */
export async function requireSecret(
  key: SecretKey,
  serviceName: string,
): Promise<string | NextResponse> {
  const value = await getSecret(key);
  if (!value) {
    return NextResponse.json(
      { error: `No ${serviceName} API key configured. Add it in Settings > Integrations.` },
      { status: 400 },
    );
  }
  return value;
}

/**
 * Validate that each named field on a JSON body is either absent or an array.
 * Returns a 400 NextResponse on the first failure, or null when all checks pass.
 *
 * Use this in PUT handlers where every field is individually optional but the
 * ones that ARE present must be arrays — for example `meals/data` and any other
 * partial-update route. Callers that require a field to be present should add
 * their own `field === undefined` check afterwards.
 */
export function assertOptionalArrays(
  body: Record<string, unknown>,
  keys: string[],
): NextResponse | null {
  for (const key of keys) {
    const value = body[key];
    if (value !== undefined && !Array.isArray(value)) {
      return NextResponse.json({ error: `${key} must be an array` }, { status: 400 });
    }
  }
  return null;
}

/**
 * Guard against accidentally overwriting non-empty data with an empty payload.
 * Returns a 409 response if all `incoming` arrays are empty but existing data has content.
 * Returns null if the write should proceed.
 */
export async function guardEmptyOverwrite(
  incoming: unknown[][],
  loadExisting: () => Promise<unknown[][]>,
  dataName: string,
  force?: boolean,
): Promise<NextResponse | null> {
  if (force || incoming.some((a) => a.length > 0)) return null;
  try {
    const existing = await loadExisting();
    if (existing.some((a) => a.length > 0)) {
      return NextResponse.json(
        { error: `Refusing to overwrite non-empty ${dataName} data with empty payload. Send { force: true } to confirm.` },
        { status: 409 },
      );
    }
  } catch {
    // Can't read existing — allow the write
  }
  return null;
}

/** Split a comma-separated query parameter into a trimmed, non-empty array of strings. */
export function parseCommaList(param: string | null): string[] {
  if (!param) return [];
  return param.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Parse and validate a version tag from a JSON request body.
 * Returns the tag string on success, or a NextResponse error on failure.
 */
export async function parseTagParam(
  request: NextRequest,
): Promise<string | NextResponse> {
  let body: { tag?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const tag = body.tag;
  if (!tag || typeof tag !== 'string') {
    return NextResponse.json({ error: 'Missing "tag" in request body' }, { status: 400 });
  }
  if (!/^v?\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(tag)) {
    return NextResponse.json({ error: 'Invalid tag format' }, { status: 400 });
  }
  return tag;
}

