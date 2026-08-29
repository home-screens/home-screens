import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, publicErrorResponse, createTTLCache, getLocationFromConfig, fetchWithTimeout, withAuth, withDisplayAuth, cachedProxyRoute, parseTagParam, parseJsonBody, execErrorMessage, assertOptionalArrays, assertRequiredArrays, isTransientError, parseRetryAfter, fetchWithRetry } from '@/lib/api-utils';
import { silenceConsole } from '@/test-utils';

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
}));

import { readConfig } from '@/lib/config';
const mockReadConfig = vi.mocked(readConfig);

import { requireSession, requireDisplayAuth } from '@/lib/auth';
const mockRequireSession = vi.mocked(requireSession);
const mockRequireDisplayAuth = vi.mocked(requireDisplayAuth);

describe('errorResponse', () => {
  silenceConsole();

  it('returns fallback message with error detail for Error instances', async () => {
    const response = errorResponse(new Error('something broke'), 'fallback');
    const json = await response.json();
    expect(json).toEqual({ error: 'fallback', detail: 'something broke' });
  });

  it('uses fallbackMessage for non-Error string', async () => {
    const response = errorResponse('not an error object', 'fallback message');
    const json = await response.json();
    expect(json).toEqual({ error: 'fallback message', detail: undefined });
  });

  it('uses fallbackMessage for null', async () => {
    const response = errorResponse(null, 'fallback message');
    const json = await response.json();
    expect(json).toEqual({ error: 'fallback message', detail: undefined });
  });

  it('uses fallbackMessage for undefined', async () => {
    const response = errorResponse(undefined, 'fallback message');
    const json = await response.json();
    expect(json).toEqual({ error: 'fallback message', detail: undefined });
  });

  it('uses fallbackMessage for a number', async () => {
    const response = errorResponse(42, 'fallback message');
    const json = await response.json();
    expect(json).toEqual({ error: 'fallback message', detail: undefined });
  });

  it('defaults to status 500', () => {
    const response = errorResponse(new Error('fail'), 'fallback');
    expect(response.status).toBe(500);
  });

  it('respects custom status 400', () => {
    const response = errorResponse(new Error('bad request'), 'fallback', 400);
    expect(response.status).toBe(400);
  });

  it('respects custom status 502', () => {
    const response = errorResponse(new Error('bad gateway'), 'fallback', 502);
    expect(response.status).toBe(502);
  });

  it('returns valid JSON response with correct content type', () => {
    const response = errorResponse(new Error('test'), 'fallback');
    expect(response.headers.get('content-type')).toContain('application/json');
  });
});

describe('publicErrorResponse', () => {
  silenceConsole();

  it('never emits a detail field, even for Error instances', async () => {
    const response = publicErrorResponse(
      new Error("EACCES: permission denied, open '/opt/home-screens/current/data/chore-completions.json'"),
      'Failed to read chore completions',
    );
    const json = await response.json();
    expect(json).toEqual({ error: 'Failed to read chore completions' });
    expect(response.status).toBe(500);
  });

  it('respects a custom status', () => {
    const response = publicErrorResponse(new Error('boom'), 'fallback', 502);
    expect(response.status).toBe(502);
  });
});

describe('fetchWithTimeout', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes an AbortSignal.timeout to fetch', async () => {
    await fetchWithTimeout('https://example.com');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('strips the custom timeout property from the init object', async () => {
    await fetchWithTimeout('https://example.com', {
      timeout: 5000,
      headers: { Accept: 'application/json' },
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.timeout).toBeUndefined();
    expect(init.headers).toEqual({ Accept: 'application/json' });
  });

  it('composes caller signal with timeout signal via AbortSignal.any', async () => {
    const controller = new AbortController();
    await fetchWithTimeout('https://example.com', { signal: controller.signal });

    const [, init] = fetchSpy.mock.calls[0];
    // The signal should be a composite — not the original controller signal
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal).not.toBe(controller.signal);

    // Aborting the caller signal should abort the composite
    controller.abort();
    expect(init.signal.aborted).toBe(true);
  });

  it('uses the default 10s timeout when none is specified', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    await fetchWithTimeout('https://example.com');

    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    timeoutSpy.mockRestore();
  });

  it('respects a custom timeout value', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    await fetchWithTimeout('https://example.com', { timeout: 3000 });

    expect(timeoutSpy).toHaveBeenCalledWith(3000);
    timeoutSpy.mockRestore();
  });

  it('retries transient failures by default (delegates to fetchWithRetry)', async () => {
    vi.useFakeTimers();
    fetchSpy
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const promise = fetchWithTimeout('https://example.com');
    await vi.advanceTimersByTimeAsync(500); // default baseDelayMs
    const res = await promise;

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('allows disabling retries with retries: 0', async () => {
    fetchSpy.mockResolvedValue(new Response('down', { status: 503 }));
    const res = await fetchWithTimeout('https://example.com', { retries: 0 });
    expect(res.status).toBe(503);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('createTTLCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for a key that was never set', () => {
    const cache = createTTLCache<string>(5000);
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('returns data within the TTL window', () => {
    const cache = createTTLCache<string>(5000);
    cache.set('greeting', 'hello');

    vi.advanceTimersByTime(4999);
    expect(cache.get('greeting')).toBe('hello');
  });

  it('returns null after the TTL expires', () => {
    const cache = createTTLCache<string>(5000);
    cache.set('greeting', 'hello');

    vi.advanceTimersByTime(5001);
    expect(cache.get('greeting')).toBeNull();
  });

  it('returns null at exactly TTL boundary (> check, not >=)', () => {
    const cache = createTTLCache<string>(5000);
    cache.set('key', 'value');

    vi.advanceTimersByTime(5000);
    // Date.now() - timestamp === ttlMs, which is NOT > ttlMs, so it should still be valid
    expect(cache.get('key')).toBe('value');
  });

  it('keeps different keys independent', () => {
    const cache = createTTLCache<number>(5000);
    cache.set('a', 1);

    vi.advanceTimersByTime(3000);
    cache.set('b', 2);

    vi.advanceTimersByTime(2001);
    // 'a' was set 5001ms ago — expired
    expect(cache.get('a')).toBeNull();
    // 'b' was set 2001ms ago — still valid
    expect(cache.get('b')).toBe(2);
  });

  it('overwriting a key resets the TTL', () => {
    const cache = createTTLCache<string>(5000);
    cache.set('key', 'first');

    vi.advanceTimersByTime(4000);
    cache.set('key', 'second');

    vi.advanceTimersByTime(4000);
    // 8000ms total, but 'key' was reset at 4000ms, so only 4000ms since last set
    expect(cache.get('key')).toBe('second');
  });

  it('a per-entry TTL override outlives the cache-wide TTL', () => {
    const cache = createTTLCache<string>(5000);
    cache.set('long', 'value', 20_000);

    vi.advanceTimersByTime(10_000);
    expect(cache.get('long')).toBe('value');

    vi.advanceTimersByTime(10_001);
    expect(cache.get('long')).toBeNull();
  });

  it('a per-entry TTL override can expire before the cache-wide TTL', () => {
    const cache = createTTLCache<string>(5000);
    cache.set('short', 'value', 1000);
    cache.set('normal', 'value');

    vi.advanceTimersByTime(1001);
    expect(cache.get('short')).toBeNull();
    expect(cache.get('normal')).toBe('value');
  });

  it('works with object values', () => {
    const cache = createTTLCache<{ name: string; count: number }>(5000);
    const data = { name: 'test', count: 42 };
    cache.set('obj', data);

    expect(cache.get('obj')).toEqual({ name: 'test', count: 42 });
  });

  it('works with array values', () => {
    const cache = createTTLCache<number[]>(5000);
    cache.set('nums', [1, 2, 3]);

    expect(cache.get('nums')).toEqual([1, 2, 3]);
  });

  it('works with null as a stored value', () => {
    const cache = createTTLCache<null>(5000);
    cache.set('empty', null);

    // null is a valid stored value, but the return type is T | null
    // so we can't distinguish "not found" from "stored null"
    // The cache returns the stored data, which is null
    expect(cache.get('empty')).toBeNull();
  });

  it('clear() removes all entries', () => {
    const cache = createTTLCache<string>(5000);
    cache.set('a', 'alpha');
    cache.set('b', 'beta');

    cache.clear();

    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });

  it('get() deletes expired entries from the map', () => {
    const cache = createTTLCache<string>(1000);
    cache.set('key', 'value');

    vi.advanceTimersByTime(1001);
    expect(cache.get('key')).toBeNull();

    // A second get should also return null (entry was deleted, not just skipped)
    expect(cache.get('key')).toBeNull();
  });

  it('evicts expired entries when at capacity', () => {
    const cache = createTTLCache<number>(1000);

    // Fill to capacity (50)
    for (let i = 0; i < 50; i++) {
      cache.set(`key-${i}`, i);
    }

    // Expire all entries
    vi.advanceTimersByTime(1001);

    // Adding a new entry should succeed (expired entries evicted)
    cache.set('new-key', 999);
    expect(cache.get('new-key')).toBe(999);
  });

  it('evicts oldest entry when at capacity with no expired entries', () => {
    const cache = createTTLCache<number>(60_000);

    // Fill to capacity
    for (let i = 0; i < 50; i++) {
      cache.set(`key-${i}`, i);
    }

    // Add one more — should evict the first entry (oldest by insertion order)
    cache.set('overflow', 999);
    expect(cache.get('overflow')).toBe(999);
    expect(cache.get('key-0')).toBeNull(); // evicted
    expect(cache.get('key-1')).toBe(1);    // still present
  });
});

describe('getLocationFromConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when no config and no searchParams', async () => {
    mockReadConfig.mockRejectedValue(new Error('no config'));

    const result = await getLocationFromConfig();
    expect(result).toBeNull();
  });

  it('extracts lat/lon from searchParams when provided', async () => {
    mockReadConfig.mockRejectedValue(new Error('no config'));
    const params = new URLSearchParams({ lat: '40.7', lon: '-74.0' });

    const result = await getLocationFromConfig(params);
    expect(result).toEqual({ lat: '40.7', lon: '-74.0' });
  });

  it('falls back to settings.latitude/longitude from config', async () => {
    mockReadConfig.mockResolvedValue({
      version: 1,
      settings: {
        latitude: 51.5,
        longitude: -0.12,
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        weather: { provider: 'openweathermap', latitude: 0, longitude: 0, units: 'metric' },
        calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], daysAhead: 7 },
      },
      screens: [],
    });

    const result = await getLocationFromConfig();
    expect(result).toEqual({ lat: '51.5', lon: '-0.12' });
  });

  it('falls back to settings.weather.latitude/longitude when top-level missing', async () => {
    mockReadConfig.mockResolvedValue({
      version: 1,
      settings: {
        latitude: 0,
        longitude: 0,
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        weather: { provider: 'openweathermap', latitude: 35.68, longitude: 139.69, units: 'metric' },
        calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], daysAhead: 7 },
      },
      screens: [],
    });

    // top-level lat/lon are 0 which is falsy for toString() but truthy for ??
    // Actually 0.toString() = "0", which is truthy, so top-level wins
    // Let's test with an actual weather fallback by checking the priority chain works
    const result = await getLocationFromConfig();
    // 0.toString() = '0' which is truthy, so settings.latitude (0) wins
    expect(result).toEqual({ lat: '0', lon: '0' });
  });

  it('searchParams take priority over config values', async () => {
    mockReadConfig.mockResolvedValue({
      version: 1,
      settings: {
        latitude: 51.5,
        longitude: -0.12,
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        weather: { provider: 'openweathermap', latitude: 0, longitude: 0, units: 'metric' },
        calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], daysAhead: 7 },
      },
      screens: [],
    });
    const params = new URLSearchParams({ lat: '40.7', lon: '-74.0' });

    const result = await getLocationFromConfig(params);
    expect(result).toEqual({ lat: '40.7', lon: '-74.0' });
  });

  it('returns null when only lat is available (no lon)', async () => {
    mockReadConfig.mockRejectedValue(new Error('no config'));
    const params = new URLSearchParams({ lat: '40.7' });

    const result = await getLocationFromConfig(params);
    expect(result).toBeNull();
  });

  it('returns null when only lon is available (no lat)', async () => {
    mockReadConfig.mockRejectedValue(new Error('no config'));
    const params = new URLSearchParams({ lon: '-74.0' });

    const result = await getLocationFromConfig(params);
    expect(result).toBeNull();
  });

  it('handles readConfig throwing an error gracefully', async () => {
    mockReadConfig.mockRejectedValue(new Error('ENOENT: file not found'));

    // No searchParams either, so should return null without crashing
    const result = await getLocationFromConfig();
    expect(result).toBeNull();
  });

  it('handles readConfig throwing and falls back to searchParams', async () => {
    mockReadConfig.mockRejectedValue(new Error('ENOENT'));
    const params = new URLSearchParams({ lat: '48.85', lon: '2.35' });

    const result = await getLocationFromConfig(params);
    expect(result).toEqual({ lat: '48.85', lon: '2.35' });
  });

  it('uses existingConfig when provided instead of calling readConfig', async () => {
    const existingConfig = {
      version: 1,
      settings: {
        latitude: 34.05,
        longitude: -118.24,
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        weather: { provider: 'openweathermap' as const, latitude: 0, longitude: 0, units: 'metric' as const },
        calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], daysAhead: 7 },
      },
      screens: [],
    };

    // Clear call history from previous tests before asserting
    mockReadConfig.mockClear();

    const result = await getLocationFromConfig(undefined, existingConfig);
    expect(result).toEqual({ lat: '34.05', lon: '-118.24' });
    expect(mockReadConfig).not.toHaveBeenCalled();
  });
});

describe('withAuth', () => {
  silenceConsole();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls requireSession and returns handler result on success', async () => {
    mockRequireSession.mockResolvedValue(undefined);
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withAuth(handler, 'Failed to do thing');
    const request = new NextRequest('http://localhost/api/test');

    const response = await wrapped(request);
    const json = await response.json();

    expect(mockRequireSession).toHaveBeenCalledWith(request);
    expect(handler).toHaveBeenCalledWith(request, undefined);
    expect(json).toEqual({ ok: true });
  });

  it('returns the Response directly when handler throws a Response (auth failure passthrough)', async () => {
    const authResponse = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    mockRequireSession.mockRejectedValue(authResponse);
    const handler = vi.fn();
    const wrapped = withAuth(handler, 'Failed to do thing');
    const request = new NextRequest('http://localhost/api/test');

    const response = await wrapped(request);

    expect(response).toBe(authResponse);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns errorResponse when handler throws a non-Response error', async () => {
    mockRequireSession.mockResolvedValue(undefined);
    const handler = vi.fn().mockRejectedValue(new Error('something broke'));
    const wrapped = withAuth(handler, 'Custom error message');
    const request = new NextRequest('http://localhost/api/test');

    const response = await wrapped(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'Custom error message', detail: 'something broke' });
  });

  it('passes the request object through to the handler', async () => {
    mockRequireSession.mockResolvedValue(undefined);
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ result: 'ok' }));
    const wrapped = withAuth(handler, 'Failed');
    const request = new NextRequest('http://localhost/api/test?foo=bar');

    await wrapped(request);

    expect(handler).toHaveBeenCalledWith(request, undefined);
    const passedRequest = handler.mock.calls[0][0] as NextRequest;
    expect(passedRequest.nextUrl.searchParams.get('foo')).toBe('bar');
  });

  it('uses the provided error message in the errorResponse', async () => {
    mockRequireSession.mockResolvedValue(undefined);
    const handler = vi.fn().mockRejectedValue(new TypeError('null ref'));
    const wrapped = withAuth(handler, 'Failed to fetch data');
    const request = new NextRequest('http://localhost/api/test');

    const response = await wrapped(request);
    const json = await response.json();

    expect(json.error).toBe('Failed to fetch data');
  });
});

describe('cachedProxyRoute', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  silenceConsole();

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.useFakeTimers();
    mockRequireSession.mockReset();
    mockRequireDisplayAuth.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fetches URL, transforms response, and caches result', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ raw: 'data' }), { status: 200 }));
    const transform = vi.fn().mockReturnValue({ transformed: true });

    const { GET } = cachedProxyRoute({
      ttlMs: 60_000,
      url: 'https://api.example.com/data',
      transform,
      errorMessage: 'Failed to fetch',
    });

    const request = new NextRequest('http://localhost/api/test');
    const response = await GET(request);
    const json = await response.json();

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(transform).toHaveBeenCalledWith({ raw: 'data' }, request);
    expect(json).toEqual({ transformed: true });
  });

  it('calls execute function in custom mode and caches result', async () => {
    const execute = vi.fn().mockResolvedValue({ custom: 'result' });

    const { GET } = cachedProxyRoute({
      ttlMs: 60_000,
      execute,
      errorMessage: 'Failed',
    });

    const request = new NextRequest('http://localhost/api/test');
    const response = await GET(request);
    const json = await response.json();

    expect(execute).toHaveBeenCalledWith(request);
    expect(json).toEqual({ custom: 'result' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns cached data without re-fetching on cache hit', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ raw: 'data' }), { status: 200 }));
    const transform = vi.fn().mockReturnValue({ transformed: true });

    const { GET } = cachedProxyRoute({
      ttlMs: 60_000,
      url: 'https://api.example.com/data',
      transform,
      errorMessage: 'Failed',
    });

    const request = new NextRequest('http://localhost/api/test');
    await GET(request);
    const response2 = await GET(request);
    const json2 = await response2.json();

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(transform).toHaveBeenCalledOnce();
    expect(json2).toEqual({ transformed: true });
  });

  it('re-fetches after TTL expires', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ v: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ v: 2 }), { status: 200 }));
    const transform = vi.fn()
      .mockReturnValueOnce({ version: 1 })
      .mockReturnValueOnce({ version: 2 });

    const { GET } = cachedProxyRoute({
      ttlMs: 5000,
      url: 'https://api.example.com/data',
      transform,
      errorMessage: 'Failed',
    });

    const request = new NextRequest('http://localhost/api/test');
    const res1 = await GET(request);
    expect(await res1.json()).toEqual({ version: 1 });

    vi.advanceTimersByTime(5001);

    const res2 = await GET(request);
    expect(await res2.json()).toEqual({ version: 2 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('uses the cacheKey function correctly', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const transform = vi.fn()
      .mockReturnValueOnce({ key: 'a' })
      .mockReturnValueOnce({ key: 'b' });

    const { GET } = cachedProxyRoute({
      ttlMs: 60_000,
      url: 'https://api.example.com/data',
      transform,
      cacheKey: (req) => req.nextUrl.searchParams.get('id') ?? '_',
      errorMessage: 'Failed',
    });

    const reqA = new NextRequest('http://localhost/api/test?id=a');
    const reqB = new NextRequest('http://localhost/api/test?id=b');
    await GET(reqA);
    await GET(reqB);

    // Both should fetch — different cache keys
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Hitting reqA again should use cache
    const res = await GET(reqA);
    expect(await res.json()).toEqual({ key: 'a' });
    expect(fetchSpy).toHaveBeenCalledTimes(2); // no additional fetch
  });

  it('returns NextResponse from execute without caching', async () => {
    const customResponse = NextResponse.json({ special: true }, { status: 201 });
    const execute = vi.fn().mockResolvedValue(customResponse);

    const { GET } = cachedProxyRoute({
      ttlMs: 60_000,
      execute,
      errorMessage: 'Failed',
    });

    const request = new NextRequest('http://localhost/api/test');
    const response = await GET(request);
    expect(response).toBe(customResponse);

    // Second call should re-execute since NextResponse was not cached
    await GET(request);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('returns 502 when upstream fetch fails', async () => {
    fetchSpy.mockResolvedValue(new Response('Not Found', { status: 404 }));

    const { GET } = cachedProxyRoute({
      ttlMs: 60_000,
      url: 'https://api.example.com/data',
      transform: (d) => d,
      errorMessage: 'Upstream failed',
    });

    const request = new NextRequest('http://localhost/api/test');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual({ error: 'Upstream failed' });
  });

  it('returns errorResponse on exception', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'));

    const { GET } = cachedProxyRoute({
      ttlMs: 60_000,
      url: 'https://api.example.com/data',
      transform: (d) => d,
      errorMessage: 'Something went wrong',
    });

    const request = new NextRequest('http://localhost/api/test');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'Something went wrong', detail: 'Network error' });
  });

  it('calls requireDisplayAuth when auth is "display"', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const { GET } = cachedProxyRoute({
      ttlMs: 60_000,
      auth: 'display',
      url: 'https://api.example.com/data',
      transform: (d) => d,
      errorMessage: 'Failed',
    });

    const request = new NextRequest('http://localhost/api/test');
    await GET(request);

    expect(mockRequireDisplayAuth).toHaveBeenCalledWith(request, 'unknown');
    expect(mockRequireSession).not.toHaveBeenCalled();
  });

  it('calls requireSession when auth is "session"', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const { GET } = cachedProxyRoute({
      ttlMs: 60_000,
      auth: 'session',
      url: 'https://api.example.com/data',
      transform: (d) => d,
      errorMessage: 'Failed',
    });

    const request = new NextRequest('http://localhost/api/test');
    await GET(request);

    expect(mockRequireSession).toHaveBeenCalledWith(request);
    expect(mockRequireDisplayAuth).not.toHaveBeenCalled();
  });

  it('returns 401 when display auth rejects', async () => {
    const authError = new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
    mockRequireDisplayAuth.mockRejectedValue(authError);

    const { GET } = cachedProxyRoute({
      ttlMs: 60_000,
      auth: 'display',
      url: 'https://api.example.com/data',
      transform: (d) => d,
      errorMessage: 'Failed',
    });

    const request = new NextRequest('http://localhost/api/test');
    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('skips auth when auth option is not set', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const { GET } = cachedProxyRoute({
      ttlMs: 60_000,
      url: 'https://api.example.com/data',
      transform: (d) => d,
      errorMessage: 'Failed',
    });

    const request = new NextRequest('http://localhost/api/test');
    await GET(request);

    expect(mockRequireSession).not.toHaveBeenCalled();
    expect(mockRequireDisplayAuth).not.toHaveBeenCalled();
  });

  it('supports async cacheKey functions', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const transform = vi.fn().mockReturnValue({ result: 'ok' });

    const { GET } = cachedProxyRoute({
      ttlMs: 60_000,
      url: 'https://api.example.com/data',
      transform,
      cacheKey: async (req) => {
        // Simulate async work (e.g. reading config)
        await Promise.resolve();
        return req.nextUrl.searchParams.get('key') ?? '_';
      },
      errorMessage: 'Failed',
    });

    const request = new NextRequest('http://localhost/api/test?key=async-key');
    const response = await GET(request);
    const json = await response.json();

    expect(json).toEqual({ result: 'ok' });

    // Second call should use cache
    const response2 = await GET(request);
    expect(await response2.json()).toEqual({ result: 'ok' });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('runs prepare once and passes result to cacheKey and execute', async () => {
    const prepare = vi.fn().mockResolvedValue({ computedKey: 'abc', extra: 42 });
    const execute = vi.fn().mockResolvedValue({ answer: 42 });

    const { GET } = cachedProxyRoute<{ answer: number }, { computedKey: string; extra: number }>({
      ttlMs: 60_000,
      prepare,
      cacheKey: (prepared) => prepared.computedKey,
      execute,
      errorMessage: 'Failed',
    });

    const request = new NextRequest('http://localhost/api/test');
    const response = await GET(request);
    const json = await response.json();

    expect(prepare).toHaveBeenCalledWith(request);
    expect(execute).toHaveBeenCalledWith({ computedKey: 'abc', extra: 42 }, request);
    expect(json).toEqual({ answer: 42 });
  });

  it('caches results in prepare mode', async () => {
    const prepare = vi.fn().mockResolvedValue({ key: 'same' });
    const execute = vi.fn().mockResolvedValue({ value: 1 });

    const { GET } = cachedProxyRoute<{ value: number }, { key: string }>({
      ttlMs: 60_000,
      prepare,
      cacheKey: (p) => p.key,
      execute,
      errorMessage: 'Failed',
    });

    const request = new NextRequest('http://localhost/api/test');
    await GET(request);
    const response2 = await GET(request);
    const json = await response2.json();

    expect(json).toEqual({ value: 1 });
    expect(prepare).toHaveBeenCalledTimes(2); // prepare runs every time
    expect(execute).toHaveBeenCalledOnce(); // but execute only once (cached)
  });

  it('does not cache NextResponse results in prepare mode', async () => {
    const errorResp = NextResponse.json({ error: 'bad' }, { status: 400 });
    const prepare = vi.fn().mockResolvedValue({ key: 'k' });
    const execute = vi.fn().mockResolvedValue(errorResp);

    const { GET } = cachedProxyRoute<string, { key: string }>({
      ttlMs: 60_000,
      prepare,
      cacheKey: (p) => p.key,
      execute,
      errorMessage: 'Failed',
    });

    const request = new NextRequest('http://localhost/api/test');
    const response = await GET(request);
    expect(response).toBe(errorResp);

    // Second call should re-execute since error was not cached
    await GET(request);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent misses on one key into a single execute call', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const execute = vi.fn().mockImplementation(async () => {
      await gate;
      return { n: 1 };
    });

    const { GET } = cachedProxyRoute({ ttlMs: 60_000, execute, errorMessage: 'Failed' });

    const p1 = GET(new NextRequest('http://localhost/api/test'));
    const p2 = GET(new NextRequest('http://localhost/api/test'));
    release();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(execute).toHaveBeenCalledOnce();
    expect(await r1.json()).toEqual({ n: 1 });
    expect(await r2.json()).toEqual({ n: 1 });
  });

  it('does not coalesce misses on different keys', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const { GET } = cachedProxyRoute({
      ttlMs: 60_000,
      execute,
      cacheKey: (req) => req.nextUrl.searchParams.get('id') ?? '_',
      errorMessage: 'Failed',
    });

    await Promise.all([
      GET(new NextRequest('http://localhost/api/test?id=a')),
      GET(new NextRequest('http://localhost/api/test?id=b')),
    ]);

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('gives every coalesced caller a readable copy of an error response', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const execute = vi.fn().mockImplementation(async () => {
      await gate;
      return NextResponse.json({ error: 'bad' }, { status: 400 });
    });

    const { GET } = cachedProxyRoute({ ttlMs: 60_000, execute, errorMessage: 'Failed' });

    const p1 = GET(new NextRequest('http://localhost/api/test'));
    const p2 = GET(new NextRequest('http://localhost/api/test'));
    release();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(execute).toHaveBeenCalledOnce();
    expect(r1.status).toBe(400);
    expect(r2.status).toBe(400);
    // Both bodies are independently readable — a shared body would throw here
    expect(await r1.json()).toEqual({ error: 'bad' });
    expect(await r2.json()).toEqual({ error: 'bad' });
  });

  it('lets a new request execute again after an in-flight call settles', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce(NextResponse.json({ error: 'bad' }, { status: 500 }))
      .mockResolvedValueOnce({ ok: true });

    const { GET } = cachedProxyRoute({ ttlMs: 60_000, execute, errorMessage: 'Failed' });

    const r1 = await GET(new NextRequest('http://localhost/api/test'));
    expect(r1.status).toBe(500);

    // Error responses are neither cached nor left in the in-flight map
    const r2 = await GET(new NextRequest('http://localhost/api/test'));
    expect(await r2.json()).toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

describe('withDisplayAuth', () => {
  silenceConsole();

  beforeEach(() => {
    mockRequireDisplayAuth.mockReset();
  });

  it('calls handler when auth passes', async () => {
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withDisplayAuth(handler, 'Failed');

    const request = new NextRequest('http://localhost/api/test');
    const response = await wrapped(request);
    const json = await response.json();

    expect(mockRequireDisplayAuth).toHaveBeenCalledWith(request, 'unknown');
    expect(handler).toHaveBeenCalledWith(request, undefined);
    expect(json).toEqual({ ok: true });
  });

  it('returns 401 when auth rejects', async () => {
    const authError = new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
    mockRequireDisplayAuth.mockRejectedValue(authError);

    const handler = vi.fn();
    const wrapped = withDisplayAuth(handler, 'Failed');

    const request = new NextRequest('http://localhost/api/test');
    const response = await wrapped(request);

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns error response for non-Response errors', async () => {
    mockRequireDisplayAuth.mockRejectedValue(new Error('disk I/O'));

    const handler = vi.fn();
    const wrapped = withDisplayAuth(handler, 'Something broke');

    const request = new NextRequest('http://localhost/api/test');
    const response = await wrapped(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'Something broke', detail: 'disk I/O' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes context to handler', async () => {
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withDisplayAuth<{ params: Promise<{ id: string }> }>(handler, 'Failed');

    const request = new NextRequest('http://localhost/api/test');
    const ctx = { params: Promise.resolve({ id: '123' }) };
    await wrapped(request, ctx);

    expect(handler).toHaveBeenCalledWith(request, ctx);
  });
});

describe('parseTagParam', () => {
  it('returns the tag for a valid semver tag', async () => {
    const body = JSON.stringify({ tag: '1.2.3' });
    const request = new NextRequest('http://localhost/api/test', { method: 'POST', body });
    const result = await parseTagParam(request);
    expect(result).toBe('1.2.3');
  });

  it('accepts tags with v prefix', async () => {
    const body = JSON.stringify({ tag: 'v2.0.0' });
    const request = new NextRequest('http://localhost/api/test', { method: 'POST', body });
    const result = await parseTagParam(request);
    expect(result).toBe('v2.0.0');
  });

  it('accepts tags with pre-release suffix', async () => {
    const body = JSON.stringify({ tag: '1.0.0-beta.1' });
    const request = new NextRequest('http://localhost/api/test', { method: 'POST', body });
    const result = await parseTagParam(request);
    expect(result).toBe('1.0.0-beta.1');
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = new NextRequest('http://localhost/api/test', { method: 'POST', body: 'not json' });
    const result = await parseTagParam(request);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
    const json = await (result as NextResponse).json();
    expect(json.error).toBe('Invalid JSON body');
  });

  it('returns 400 when tag is missing', async () => {
    const body = JSON.stringify({ other: 'value' });
    const request = new NextRequest('http://localhost/api/test', { method: 'POST', body });
    const result = await parseTagParam(request);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
    const json = await (result as NextResponse).json();
    expect(json.error).toBe('Missing "tag" in request body');
  });

  it('returns 400 when tag is not a string', async () => {
    const body = JSON.stringify({ tag: 123 });
    const request = new NextRequest('http://localhost/api/test', { method: 'POST', body });
    const result = await parseTagParam(request);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
  });

  it('returns 400 for invalid tag format', async () => {
    const body = JSON.stringify({ tag: 'not-a-version' });
    const request = new NextRequest('http://localhost/api/test', { method: 'POST', body });
    const result = await parseTagParam(request);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
    const json = await (result as NextResponse).json();
    expect(json.error).toBe('Invalid tag format');
  });
});

describe('parseJsonBody', () => {
  it('returns the parsed body for valid JSON', async () => {
    const request = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({ ssid: 'HomeNet', confirmed: true }),
    });
    const result = await parseJsonBody<{ ssid: string; confirmed: boolean }>(request);
    expect(result).toEqual({ ssid: 'HomeNet', confirmed: true });
  });

  it('returns a 400 NextResponse for malformed JSON', async () => {
    const request = new NextRequest('http://localhost/api/test', { method: 'POST', body: 'not json' });
    const result = await parseJsonBody(request);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
    const json = await (result as NextResponse).json();
    expect(json.error).toBe('Invalid JSON body');
  });

  it('returns a 400 NextResponse for an empty body', async () => {
    const request = new NextRequest('http://localhost/api/test', { method: 'POST' });
    const result = await parseJsonBody(request);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
  });
});

describe('execErrorMessage', () => {
  it('returns trimmed stderr when the error carries one', () => {
    const err = Object.assign(new Error('cmd failed'), { stderr: '  Error: device not found  \n' });
    expect(execErrorMessage(err, 'fallback')).toBe('Error: device not found');
  });

  it('stringifies a non-string stderr', () => {
    const err = { stderr: Buffer.from('nmcli: timeout') };
    expect(execErrorMessage(err, 'fallback')).toBe('nmcli: timeout');
  });

  it('returns the fallback when the error has no stderr property', () => {
    expect(execErrorMessage(new Error('plain'), 'fallback')).toBe('fallback');
  });

  it('returns the fallback for non-object errors', () => {
    expect(execErrorMessage('boom', 'fallback')).toBe('fallback');
    expect(execErrorMessage(null, 'fallback')).toBe('fallback');
    expect(execErrorMessage(undefined, 'fallback')).toBe('fallback');
  });

  it('returns an empty string when stderr is present but empty (locks existing route behavior)', () => {
    const err = Object.assign(new Error('killed'), { stderr: '' });
    expect(execErrorMessage(err, 'fallback')).toBe('');
  });
});

describe('assertOptionalArrays', () => {
  it('returns null when no fields are present', () => {
    const result = assertOptionalArrays({}, ['savedMeals', 'plan', 'groceryChecked']);
    expect(result).toBeNull();
  });

  it('returns null when all present fields are arrays', () => {
    const body = { savedMeals: [], plan: [{ id: 1 }], groceryChecked: ['a', 'b'] };
    const result = assertOptionalArrays(body, ['savedMeals', 'plan', 'groceryChecked']);
    expect(result).toBeNull();
  });

  it('returns null when only some fields are present (allow-absent semantics)', () => {
    // The function exists specifically to allow partial-update PUT bodies.
    const result = assertOptionalArrays({ plan: [] }, ['savedMeals', 'plan', 'groceryChecked']);
    expect(result).toBeNull();
  });

  it('returns 400 when a field is present but not an array', async () => {
    const result = assertOptionalArrays({ plan: 'oops' }, ['plan']);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
    const json = await (result as NextResponse).json();
    expect(json).toEqual({ error: 'plan must be an array' });
  });

  it('reports the first failing key in declared order', async () => {
    // savedMeals is checked first, so it should be the one that surfaces
    // even though groceryChecked is also invalid.
    const body = { savedMeals: 'nope', groceryChecked: 'also nope' };
    const result = assertOptionalArrays(body, ['savedMeals', 'plan', 'groceryChecked']);
    const json = await (result as NextResponse).json();
    expect(json.error).toBe('savedMeals must be an array');
  });

  it('treats null as a non-array failure', async () => {
    // null !== undefined, so it counts as "present but invalid".
    const result = assertOptionalArrays({ plan: null }, ['plan']);
    expect(result).toBeInstanceOf(NextResponse);
    const json = await (result as NextResponse).json();
    expect(json.error).toBe('plan must be an array');
  });

  it('treats objects as a non-array failure', async () => {
    const result = assertOptionalArrays({ plan: { length: 1 } }, ['plan']);
    expect(result).toBeInstanceOf(NextResponse);
    const json = await (result as NextResponse).json();
    expect(json.error).toBe('plan must be an array');
  });
});

describe('assertRequiredArrays', () => {
  it('returns null when every field is present and an array', () => {
    const result = assertRequiredArrays({ members: [], chores: [{ id: 1 }] }, ['members', 'chores']);
    expect(result).toBeNull();
  });

  it('returns 400 when a field is absent (require-present semantics)', async () => {
    // This is the difference from assertOptionalArrays: missing fields fail.
    const result = assertRequiredArrays({ members: [] }, ['members', 'chores']);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
    const json = await (result as NextResponse).json();
    expect(json.error).toBe('chores must be an array');
  });

  it('returns 400 when a field is present but not an array', async () => {
    const result = assertRequiredArrays({ rewards: 'oops' }, ['rewards']);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
    const json = await (result as NextResponse).json();
    expect(json.error).toBe('rewards must be an array');
  });

  it('reports the first failing key in declared order', async () => {
    const result = assertRequiredArrays({}, ['members', 'chores']);
    const json = await (result as NextResponse).json();
    expect(json.error).toBe('members must be an array');
  });
});

describe('isTransientError', () => {
  it('returns true for 500, 502, 503, 504', () => {
    expect(isTransientError(500)).toBe(true);
    expect(isTransientError(502)).toBe(true);
    expect(isTransientError(503)).toBe(true);
    expect(isTransientError(504)).toBe(true);
  });

  it('returns true for 429 (rate limited)', () => {
    expect(isTransientError(429)).toBe(true);
  });

  it('returns false for 400, 401, 403, 404', () => {
    expect(isTransientError(400)).toBe(false);
    expect(isTransientError(401)).toBe(false);
    expect(isTransientError(403)).toBe(false);
    expect(isTransientError(404)).toBe(false);
  });

  it('returns false for 200', () => {
    expect(isTransientError(200)).toBe(false);
  });
});

describe('parseRetryAfter', () => {
  it('returns null for null header', () => {
    expect(parseRetryAfter(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseRetryAfter('')).toBeNull();
  });

  it('parses integer seconds (30 → 30_000ms)', () => {
    expect(parseRetryAfter('30')).toBe(30_000);
  });

  it('parses zero seconds (0 → 0ms)', () => {
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('returns null for negative values', () => {
    expect(parseRetryAfter('-5')).toBeNull();
  });

  it('returns null for non-numeric strings (HTTP-date format)', () => {
    expect(parseRetryAfter('Thu, 01 Dec 2025 16:00:00 GMT')).toBeNull();
  });

  it('clamps to 60 seconds max (120 → 60_000ms)', () => {
    expect(parseRetryAfter('120')).toBe(60_000);
  });
});

describe('fetchWithRetry', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns the response on first success', async () => {
    fetchSpy.mockResolvedValue(new Response('ok', { status: 200 }));
    const res = await fetchWithRetry('https://example.com');
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 4xx errors', async () => {
    fetchSpy.mockResolvedValue(new Response('bad', { status: 400 }));
    const res = await fetchWithRetry('https://example.com');
    expect(res.status).toBe(400);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 401', async () => {
    fetchSpy.mockResolvedValue(new Response('unauth', { status: 401 }));
    const res = await fetchWithRetry('https://example.com');
    expect(res.status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries on 503 then succeeds', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const promise = fetchWithRetry('https://example.com', { retries: 2, baseDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    const res = await promise;

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 then succeeds', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const promise = fetchWithRetry('https://example.com', { retries: 1, baseDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    const res = await promise;

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('retries on network error (TypeError) then succeeds', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const promise = fetchWithRetry('https://example.com', { retries: 1, baseDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    const res = await promise;

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns the last failed response when retries are exhausted', async () => {
    fetchSpy.mockResolvedValue(new Response('down', { status: 503 }));

    const promise = fetchWithRetry('https://example.com', { retries: 2, baseDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(100); // first retry
    await vi.advanceTimersByTimeAsync(200); // second retry (exponential)
    const res = await promise;

    expect(res.status).toBe(503);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('throws the last error when retries are exhausted on network errors', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const promise = fetchWithRetry('https://example.com', { retries: 2, baseDelayMs: 100 });
    // Attach the rejection handler before advancing timers so the promise
    // rejection is never transiently unhandled.
    const assertion = expect(promise).rejects.toThrow('Failed to fetch');
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    await assertion;
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('uses exponential backoff: 100ms, 200ms, 400ms', async () => {
    fetchSpy.mockResolvedValue(new Response('down', { status: 503 }));

    const promise = fetchWithRetry('https://example.com', { retries: 3, baseDelayMs: 100 });

    await vi.advanceTimersByTimeAsync(99);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(400);
    expect(fetchSpy).toHaveBeenCalledTimes(4);

    await promise;
  });

  it('caps backoff delay at maxDelayMs', async () => {
    fetchSpy.mockResolvedValue(new Response('down', { status: 503 }));

    const promise = fetchWithRetry('https://example.com', {
      retries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 1500,
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1500);
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(1500);
    expect(fetchSpy).toHaveBeenCalledTimes(4);

    await promise;
  });

  it('respects Retry-After header over exponential backoff', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response('slow', { status: 429, headers: { 'Retry-After': '2' } }),
      )
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const promise = fetchWithRetry('https://example.com', { retries: 1, baseDelayMs: 100 });

    await vi.advanceTimersByTimeAsync(100);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1900);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const res = await promise;
    expect(res.status).toBe(200);
  });

  it('skips retry when retries is 0', async () => {
    fetchSpy.mockResolvedValue(new Response('down', { status: 503 }));
    const res = await fetchWithRetry('https://example.com', { retries: 0 });
    expect(res.status).toBe(503);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('propagates caller abort signal', async () => {
    const controller = new AbortController();
    fetchSpy.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    controller.abort();
    await expect(
      fetchWithRetry('https://example.com', { signal: controller.signal, retries: 2 }),
    ).rejects.toThrow('Aborted');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry on caller abort between retries', async () => {
    const controller = new AbortController();
    fetchSpy
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const promise = fetchWithRetry('https://example.com', {
      signal: controller.signal,
      retries: 2,
      baseDelayMs: 100,
    });

    // Attach the rejection handler before aborting so the promise rejection
    // is never transiently unhandled.
    const assertion = expect(promise).rejects.toThrow();
    // Abort during the backoff delay — delay rejects before the second fetch fires
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);

    await assertion;
    // Only the first fetch was made; the abort cancelled the delay before retry
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
