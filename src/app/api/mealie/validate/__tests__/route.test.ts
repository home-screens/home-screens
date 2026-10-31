import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/mealie', () => ({ validateMealieConnection: vi.fn() }));

import { GET } from '../route';
import { requireSession } from '@/lib/auth';
import { validateMealieConnection } from '@/lib/mealie';

const req = () => new NextRequest('http://localhost/api/mealie/validate');

describe('GET /api/mealie/validate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('answers with what the check found', async () => {
    vi.mocked(validateMealieConnection).mockResolvedValue({ ok: true, version: '3.29.0', household: 'Family', user: 'Taylor', url: 'http://mealie.local' });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: '3.29.0', household: 'Family', user: 'Taylor', url: 'http://mealie.local' });
  });

  it('passes a failure through as a plain answer', async () => {
    vi.mocked(validateMealieConnection).mockResolvedValue({ ok: false, failure: 'too-old', version: '1.12.0' });
    expect(await (await GET(req())).json()).toEqual({ ok: false, failure: 'too-old', version: '1.12.0' });
  });

  it('needs a signed-in session', async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(new Response(null, { status: 401 }));
    expect((await GET(req())).status).toBe(401);
    expect(validateMealieConnection).not.toHaveBeenCalled();
  });
});
