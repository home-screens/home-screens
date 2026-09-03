import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
}));

const mockPick = vi.hoisted(() => vi.fn<() => string | null>());
vi.mock('@/lib/hub-address', () => ({ pickLanIpv4: mockPick }));

import { GET } from '@/app/api/system/address/route';

describe('GET /api/system/address', () => {
  beforeEach(() => { mockPick.mockReset(); });

  it('replaces only the host of the request origin with the LAN IPv4', async () => {
    mockPick.mockReturnValue('192.168.1.20');
    const res = await GET(new NextRequest('http://localhost:3000/api/system/address'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ origin: 'http://192.168.1.20:3000' });
  });

  it('keeps a default port implicit', async () => {
    mockPick.mockReturnValue('192.168.1.20');
    const res = await GET(new NextRequest('http://localhost/api/system/address'));
    expect(await res.json()).toEqual({ origin: 'http://192.168.1.20' });
  });

  it('reports null when the hub has no LAN address', async () => {
    mockPick.mockReturnValue(null);
    const res = await GET(new NextRequest('http://localhost:3000/api/system/address'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ origin: null });
  });
});
