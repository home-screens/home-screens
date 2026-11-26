import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasHubScreen, leavesOutHubScreen } from '../hub-screen-allowlist';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('hasHubScreen', () => {
  it('is a wall let in from the hub itself, over either loopback address', () => {
    expect(hasHubScreen([{ status: 'in', address: '127.0.0.1' }])).toBe(true);
    expect(hasHubScreen([{ status: 'in', address: '::1' }])).toBe(true);
    expect(hasHubScreen([{ status: 'waiting', address: '127.0.0.1' }, { status: 'in', address: '192.168.1.60' }])).toBe(false);
    expect(hasHubScreen([])).toBe(false);
  });

  it('is never true where the install has no screen of its own', () => {
    vi.stubEnv('HS_NO_HUB_SCREEN', '1');
    expect(hasHubScreen([{ status: 'in', address: '127.0.0.1' }])).toBe(false);
  });
});

describe('leavesOutHubScreen', () => {
  const home = { allowlist: ['192.168.1.0/24'], restrictAccess: true };

  it('is a restricting list that does not cover 127.0.0.1 on a hub with a screen', () => {
    expect(leavesOutHubScreen(home, true)).toBe(true);
    expect(leavesOutHubScreen({ ...home, allowlist: ['192.168.1.0/24', '127.0.0.1'] }, true)).toBe(false);
    expect(leavesOutHubScreen({ ...home, allowlist: ['127.0.0.0/8'] }, true)).toBe(false);
  });

  it('is false with no screen, no restriction, or an empty list', () => {
    expect(leavesOutHubScreen(home, false)).toBe(false);
    expect(leavesOutHubScreen({ ...home, restrictAccess: false }, true)).toBe(false);
    expect(leavesOutHubScreen({ allowlist: [], restrictAccess: true }, true)).toBe(false);
  });
});
