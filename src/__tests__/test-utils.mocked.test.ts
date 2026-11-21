import { describe, it, expect, vi } from 'vitest';

// The two mocks many route tests carry. The builders must not hand back
// what these return.
vi.mock('@/lib/config', () => ({ DEFAULT_CONFIG: { version: -1, settings: {}, screens: [] } }));
vi.mock('@/lib/migrations', () => ({ getLatestSchemaVersion: () => 7 }));

import { getLatestSchemaVersion } from '@/lib/migrations';
import { makeTestConfig } from '@/test-utils';

describe('config builders beside mocked config modules', () => {
  it('still build on the real latest schema', async () => {
    const real = await vi.importActual<typeof import('@/lib/migrations')>('@/lib/migrations');
    expect(getLatestSchemaVersion()).toBe(7);
    expect(makeTestConfig().version).toBe(real.getLatestSchemaVersion());
    expect(makeTestConfig().version).toBeGreaterThan(7);
    expect(makeTestConfig().settings.displayWidth).toBe(1080);
  });
});
