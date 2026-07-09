/**
 * Route-level tests for `GET /api/system/build-id`.
 *
 * The handler memoizes the build id in module scope, so each test resets the
 * module registry and re-imports the route to get a fresh cache. `fs` is
 * mocked so we control whether `.next/BUILD_ID` exists.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const readFileMock = vi.fn();

vi.mock('fs', () => ({ promises: { readFile: readFileMock } }));

async function loadRoute() {
  vi.resetModules();
  return import('../route');
}

describe('GET /api/system/build-id', () => {
  beforeEach(() => {
    readFileMock.mockReset();
  });

  it('returns the trimmed build id as text/plain with no-store caching', async () => {
    readFileMock.mockResolvedValue('abc123def\n');
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('abc123def');
    expect(res.headers.get('Content-Type')).toBe('text/plain');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('falls back to "unknown" when the BUILD_ID file cannot be read', async () => {
    readFileMock.mockRejectedValue(new Error('ENOENT'));
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('unknown');
  });

  it('caches the build id after the first read', async () => {
    readFileMock.mockResolvedValue('cached-id\n');
    const { GET } = await loadRoute();
    await GET();
    await GET();
    expect(readFileMock).toHaveBeenCalledTimes(1);
  });
});
