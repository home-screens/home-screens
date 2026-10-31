import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/mealie', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/mealie')>();
  return { ...real, getMealieConfig: vi.fn(), listMealieCookbooks: vi.fn() };
});

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getMealieConfig, listMealieCookbooks, MealieError } from '@/lib/mealie';

const req = () => new NextRequest('http://localhost/api/mealie/cookbooks');

describe('GET /api/mealie/cookbooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMealieConfig).mockResolvedValue({ url: 'http://mealie.local', apiKey: 'k' });
  });

  it('answers the cookbooks', async () => {
    vi.mocked(listMealieCookbooks).mockResolvedValue([{ name: 'Weeknight dinners', slug: 'weeknight-dinners' }]);
    expect(await (await GET(req())).json()).toEqual({ cookbooks: [{ name: 'Weeknight dinners', slug: 'weeknight-dinners' }] });
  });

  it('says when Mealie is not connected or down', async () => {
    vi.mocked(getMealieConfig).mockResolvedValueOnce(null);
    expect((await (await GET(req())).json()).failure).toBe('not-set-up');
    vi.mocked(listMealieCookbooks).mockRejectedValue(new MealieError('unreachable', 'down'));
    expect((await GET(req())).status).toBe(502);
  });
});
