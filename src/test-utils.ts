/**
 * Shared test utilities for common mocking patterns.
 *
 * Usage:
 *   import { mockFetch, mockFetchError, silenceConsole } from '@/test-utils';
 */
import { vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Data seeding
// ---------------------------------------------------------------------------

/**
 * Put a JSON document under the sandboxed `data/` exactly as the app would
 * find it on disk, bypassing every store rule. For arranging a test's
 * starting state only: production code has no whole-file writer, because a
 * restore goes through the data transaction and everything else through a
 * store's own update function.
 */
export async function seedDataFile(relPath: string, value: unknown): Promise<void> {
  const full = path.join(process.cwd(), relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, JSON.stringify(value, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/**
 * Stub `globalThis.fetch` for the current test and return the spy.
 * Automatically cleaned up by `vi.restoreAllMocks()`.
 */
export function mockFetch(data: unknown = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spy = vi.fn((..._args: any[]) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
      status: 200,
    }),
  );
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
