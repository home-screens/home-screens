/**
 * Route-level tests for `GET /api/system/version`.
 *
 * Mocks `@/lib/version` (info + tags) and `isUpgradeRunning`. Covers the
 * assembled response shape, the tags-slice cap, the `check=true` force
 * plumbing, and the 500 the real `withAuth` wrapper produces when version
 * lookup throws. Auth stubbed at `requireSession`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

vi.mock('@/lib/version', () => ({
  getVersionInfo: vi.fn(),
  getVersionTags: vi.fn(),
}));

vi.mock('@/lib/upgrade', () => ({
  isUpgradeRunning: vi.fn(() => false),
}));

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getVersionInfo, getVersionTags } from '@/lib/version';
import { isUpgradeRunning } from '@/lib/upgrade';

const mockInfo = vi.mocked(getVersionInfo);
const mockTags = vi.mocked(getVersionTags);
const mockRunning = vi.mocked(isUpgradeRunning);

function getRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/system/version${query}`, { method: 'GET' });
}

const INFO = {
  current: '1.0.0',
  currentCommit: 'abc1234',
  latest: '1.1.0',
  latestCommit: 'def5678',
  updateAvailable: true,
  installedVia: 'git',
  channel: 'main',
} as never;

describe('GET /api/system/version', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInfo.mockResolvedValue(INFO);
    mockTags.mockResolvedValue([]);
    mockRunning.mockReturnValue(false);
  });

  it('returns version info with tags and the upgrade-running flag', async () => {
    mockTags.mockResolvedValue([{ version: '1.1.0', commit: 'def5678' }] as never);
    mockRunning.mockReturnValue(true);
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.current).toBe('1.0.0');
    expect(body.updateAvailable).toBe(true);
    expect(body.tags).toHaveLength(1);
    expect(body.upgradeRunning).toBe(true);
  });

  it('caps the returned tag list at 20', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ version: `1.0.${i}`, commit: `c${i}` }));
    mockTags.mockResolvedValue(many as never);
    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.tags).toHaveLength(20);
  });

  it('passes force + prerelease flags through on check=true&channel=dev', async () => {
    await GET(getRequest('?check=true&channel=dev'));
    expect(mockInfo).toHaveBeenCalledWith({ force: true, includePrerelease: true });
    expect(mockTags).toHaveBeenCalledWith({ force: true, includePrerelease: true });
  });

  it('returns 500 when version lookup throws', async () => {
    mockInfo.mockRejectedValue(new Error('git not found'));
    const res = await GET(getRequest());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Failed to get version info/);
  });
});
