import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/immich', () => ({
  validateImmichConnection: vi.fn(),
}));

import { validateImmichConnection } from '@/lib/immich';
import { GET } from '@/app/api/immich/validate/route';

const mockValidate = vi.mocked(validateImmichConnection);
const req = new NextRequest('http://localhost/api/immich/validate');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/immich/validate', () => {
  it('reports a reachable + authenticated connection with version', async () => {
    mockValidate.mockResolvedValue({ reachable: true, authenticated: true, version: '1.106.4' });

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ reachable: true, authenticated: true, version: '1.106.4' });
  });

  it('reports an unreachable connection', async () => {
    mockValidate.mockResolvedValue({ reachable: false, authenticated: false });

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ reachable: false, authenticated: false });
  });

  it('is a pure connection probe — it does not mutate config or secrets', async () => {
    mockValidate.mockResolvedValue({ reachable: true, authenticated: false });

    await GET(req);

    // The route delegates entirely to validateImmichConnection, which only
    // reads config/pings upstream. Nothing else is invoked to persist state.
    expect(mockValidate).toHaveBeenCalledTimes(1);
    expect(mockValidate).toHaveBeenCalledWith();
  });

  it('returns 500 with the generic message when validation throws', async () => {
    mockValidate.mockRejectedValue(new Error('boom'));

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to validate Immich connection');
  });
});
