import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
}));
vi.mock('@/lib/service-attention', () => ({
  servicesNeedingAttention: vi.fn(),
}));

import { requireSession } from '@/lib/auth';
import { servicesNeedingAttention } from '@/lib/service-attention';

const { GET } = await import('@/app/api/secrets/attention/route');

const request = () => new NextRequest('http://localhost/api/secrets/attention');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue(undefined);
});

describe('GET /api/secrets/attention', () => {
  it('lists the set-up services that are not working, for the API keys page', async () => {
    vi.mocked(servicesNeedingAttention).mockResolvedValue({ google: 'signIn', immich: 'unreachable' });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ attention: { google: 'signIn', immich: 'unreachable' } });
  });

  it('answers an empty list when everything works', async () => {
    vi.mocked(servicesNeedingAttention).mockResolvedValue({});
    expect(await (await GET(request())).json()).toEqual({ attention: {} });
  });

  it('needs a signed-in session', async () => {
    vi.mocked(requireSession).mockRejectedValue(
      new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }),
    );
    expect((await GET(request())).status).toBe(401);
    expect(servicesNeedingAttention).not.toHaveBeenCalled();
  });
});
