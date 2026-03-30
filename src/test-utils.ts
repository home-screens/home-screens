/**
 * Shared test utilities for common mocking patterns.
 *
 * Usage:
 *   import { mockFetch, mockConsole, mockReadConfig } from '@/test-utils';
 */
import { vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/** Create a mock fetch that resolves with `{ ok: true, json: () => data }`. */
export function createMockFetch(data: unknown = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return vi.fn((..._args: any[]) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
      status: 200,
    }),
  );
}

/**
 * Stub `globalThis.fetch` for the current test and return the spy.
 * Automatically cleaned up by `vi.restoreAllMocks()`.
 */
export function mockFetch(data: unknown = {}) {
  const spy = createMockFetch(data);
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** Stub fetch to return an error response. */
export function mockFetchError(status = 500, body = 'Internal Server Error') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spy = vi.fn((..._args: any[]) =>
    Promise.resolve({
      ok: false,
      status,
      json: () => Promise.resolve({ error: body }),
      text: () => Promise.resolve(body),
    }),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

// ---------------------------------------------------------------------------
// Console suppression
// ---------------------------------------------------------------------------

/**
 * Suppress console.error (and optionally .warn / .log) for the current
 * describe block. Returns the spies for assertion if needed.
 */
export function silenceConsole(
  methods: Array<'error' | 'warn' | 'log'> = ['error'],
) {
  const spies: Record<string, ReturnType<typeof vi.spyOn>> = {};

  beforeEach(() => {
    for (const m of methods) {
      spies[m] = vi.spyOn(console, m).mockImplementation(() => {});
    }
  });

  return spies;
}

// ---------------------------------------------------------------------------
// Fake timers
// ---------------------------------------------------------------------------

/** Enable fake timers for the enclosing describe block and restore after. */
export function useFakeTimers() {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

// ---------------------------------------------------------------------------
// Next.js request helpers (for API route tests)
// ---------------------------------------------------------------------------

/** Build a minimal Request object for API route testing. */
export function createRequest(
  url: string,
  init?: RequestInit,
): Request {
  return new Request(url.startsWith('http') ? url : `http://localhost${url}`, init);
}

/** Shorthand for a GET Request. */
export function createGetRequest(url: string) {
  return createRequest(url, { method: 'GET' });
}

/** Shorthand for a PUT/POST Request with JSON body. */
export function createJsonRequest(
  url: string,
  body: unknown,
  method: 'PUT' | 'POST' = 'PUT',
) {
  return createRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
