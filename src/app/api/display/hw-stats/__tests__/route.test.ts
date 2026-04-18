import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/display-commands', () => ({
  setDisplayStatus: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(),
}));

import { POST } from '@/app/api/display/hw-stats/route';
import { setDisplayStatus } from '@/lib/display-commands';
import { readConfig } from '@/lib/config';
import { __resetAdoptedCacheForTests } from '@/lib/adopted-display-cache';

const validHwStats = {
  piModel: 'Raspberry Pi 4 Model B',
  cpuModel: 'ARMv8 Processor',
  cpuCores: 4,
  cpuTempC: 52.1,
  load1: 0.1,
  load5: 0.2,
  load15: 0.3,
  throttled: null,
  memoryTotal: 4_000_000_000,
  memoryFree: 2_000_000_000,
  diskTotal: 32_000_000_000,
  diskFree: 16_000_000_000,
  reportedAt: '2026-04-17T12:00:00.000Z',
};

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/display/hw-stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetAdoptedCacheForTests();
});

describe('POST /api/display/hw-stats', () => {
  it('accepts hwStats for an adopted display and forwards to setDisplayStatus', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [] }],
    } as never);

    const res = await POST(req({ displayId: 'kitchen', hwStats: validHwStats }));
    expect(res.status).toBe(200);

    expect(setDisplayStatus).toHaveBeenCalledTimes(1);
    const [statusArg, displayIdArg] = vi.mocked(setDisplayStatus).mock.calls[0];
    expect(displayIdArg).toBe('kitchen');
    expect((statusArg as { hwStats?: { cpuCores?: number } }).hwStats?.cpuCores).toBe(4);
  });

  it("accepts hwStats for 'main' in legacy single-display mode (no config.displays)", async () => {
    vi.mocked(readConfig).mockResolvedValue({} as never);

    const res = await POST(req({ displayId: 'main', hwStats: validHwStats }));
    expect(res.status).toBe(200);
    expect(setDisplayStatus).toHaveBeenCalled();
  });

  it("rejects non-'main' displayId with 403 in legacy mode", async () => {
    vi.mocked(readConfig).mockResolvedValue({} as never);

    const res = await POST(req({ displayId: 'kitchen', hwStats: validHwStats }));
    expect(res.status).toBe(403);
    expect(setDisplayStatus).not.toHaveBeenCalled();
  });

  it('rejects 403 when displayId is not in config.displays', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      displays: [{ id: 'living-room', name: 'Living Room', screens: [] }],
    } as never);

    const res = await POST(req({ displayId: 'kitchen', hwStats: validHwStats }));
    expect(res.status).toBe(403);
    expect(setDisplayStatus).not.toHaveBeenCalled();
  });

  it('rejects invalid displayId with 400 (validates format before adoption check)', async () => {
    const res = await POST(req({ displayId: 'Kitchen!', hwStats: validHwStats }));
    expect(res.status).toBe(400);
    expect(readConfig).not.toHaveBeenCalled();
  });

  it('rejects 400 when hwStats payload is malformed', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [] }],
    } as never);

    const res = await POST(req({ displayId: 'kitchen', hwStats: { cpuCores: 'four' } }));
    expect(res.status).toBe(400);
    expect(setDisplayStatus).not.toHaveBeenCalled();
  });

  it('rejects 400 when body is not valid JSON', async () => {
    const badReq = new NextRequest('http://localhost/api/display/hw-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });
});
