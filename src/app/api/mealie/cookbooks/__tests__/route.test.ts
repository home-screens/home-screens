import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/mealie', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/mealie')>();
  return { ...real, listMealieCookbooks: vi.fn() };
});

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { listMealieCookbooks, MealieError } from '@/lib/mealie';

const req = () => new NextRequest('http://localhost/api/mealie/cookbooks');

describe('GET /api/mealie/cookbooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers the cookbooks', async () => {
    vi.mocked(listMealieCookbooks).mockResolvedValue([{ name: 'Weeknight dinners', slug: 'weeknight-dinners' }]);
    expect(await (await GET(req())).json()).toEqual({ cookbooks: [{ name: 'Weeknight dinners', slug: 'weeknight-dinners' }] });
  });

  it('says when Mealie is not connected or down', async () => {
    // The real call, with no address or key saved in the test sandbox.
    const real = await vi.importActual<typeof import('@/lib/mealie')>('@/lib/mealie');
    vi.mocked(listMealieCookbooks).mockImplementationOnce(real.listMealieCookbooks);
    const res = await GET(req());
    expect(res.status).toBe(400);
    expect((await res.json()).failure).toBe('not-set-up');
    vi.mocked(listMealieCookbooks).mockRejectedValue(new MealieError('unreachable', 'down'));
    expect((await GET(req())).status).toBe(502);
  });
});
