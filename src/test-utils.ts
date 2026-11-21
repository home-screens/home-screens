/**
 * Shared test utilities for common mocking patterns.
 *
 * Usage:
 *   import { mockFetch, mockFetchError, silenceConsole } from '@/test-utils';
 *   import { makeTestConfig, makeTestSettings, jsonRequest } from '@/test-utils';
 */
import { vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type {
  GlobalSettings,
  ModuleInstance,
  ModuleType,
  Screen,
  ScreenConfiguration,
} from '@/types/config';

// Read past any `vi.mock('@/lib/migrations')` in the importing test, so a
// built config carries the real latest schema and not the mock's answer.
const { getLatestSchemaVersion } =
  await vi.importActual<typeof import('@/lib/migrations')>('@/lib/migrations');

// ---------------------------------------------------------------------------
// Config builders
// ---------------------------------------------------------------------------

/**
 * A complete settings object, the same values a fresh install starts with.
 * The defaults are written out here and not read from `@/lib/config`: many
 * tests mock that module, and it pulls the server's file stores into browser
 * tests. A unit test holds this to the real defaults.
 *
 * Optional fields are left out, so a test that depends on one being unset
 * still sees it unset.
 */
export function makeTestSettings(overrides: Partial<GlobalSettings> = {}): GlobalSettings {
  return {
    rotationIntervalMs: 30000,
    displayWidth: 1080,
    displayHeight: 1920,
    displayTransform: '90',
    latitude: 0,
    longitude: 0,
    weather: { provider: 'open-meteo', units: 'imperial' },
    calendar: { googleCalendarIds: [], icalSources: [], daysAhead: 7 },
    ...overrides,
  };
}

let nextModuleId = 1;

/** A module of the given type with a plain box and the default style. */
export function makeTestModule(type: ModuleType, overrides: Partial<ModuleInstance> = {}): ModuleInstance {
  return {
    id: overrides.id ?? `mod-${nextModuleId++}`,
    type,
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 0,
    config: {},
    style: { ...DEFAULT_MODULE_STYLE },
    ...overrides,
  };
}

/** A screen named after its id, with no background picture. */
export function makeTestScreen(id: string, modules: ModuleInstance[] = [], extra: Partial<Screen> = {}): Screen {
  return { id, name: id, backgroundImage: '', modules, ...extra };
}

/**
 * A whole config on the latest schema with one empty screen. Pass `version`
 * to build an older one for a migration test.
 */
export function makeTestConfig(overrides: Partial<ScreenConfiguration> = {}): ScreenConfiguration {
  return {
    version: getLatestSchemaVersion(),
    settings: makeTestSettings(),
    screens: [{ id: 'default', name: 'Screen 1', backgroundImage: '', modules: [] }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/**
 * Build the request a route handler receives. A `body` is sent as JSON with
 * the JSON content type, and the method defaults to POST when there is a body
 * and GET when there is none. A path without a host is read against
 * `http://localhost`.
 */
export function jsonRequest(
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): NextRequest {
  const hasBody = init.body !== undefined;
  return new NextRequest(url.startsWith('/') ? `http://localhost${url}` : url, {
    method: init.method ?? (hasBody ? 'POST' : 'GET'),
    headers: { ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
  });
}

// ---------------------------------------------------------------------------
// Browser storage
// ---------------------------------------------------------------------------

/** An in-memory `localStorage`, for `vi.stubGlobal('localStorage', ...)`. */
export function makeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  };
}

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
