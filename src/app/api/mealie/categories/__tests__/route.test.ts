import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/mealie', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/mealie')>();
  return { ...real, listMealieCategories: vi.fn() };
});

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { requireDisplayAuth, requireSession } from '@/lib/auth';
import { listMealieCategories, MealieError } from '@/lib/mealie';

const req = () => new NextRequest('http://localhost/api/mealie/categories');

describe('GET /api/mealie/categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers the categories', async () => {
    vi.mocked(listMealieCategories).mockResolvedValue([{ name: 'Dessert', slug: 'dessert' }]);
    expect(await (await GET(req())).json()).toEqual({ categories: [{ name: 'Dessert', slug: 'dessert' }] });
  });

  it('says when Mealie is not connected or down', async () => {
    // The real call, with no address or key saved in the test sandbox.
    const real = await vi.importActual<typeof import('@/lib/mealie')>('@/lib/mealie');
    vi.mocked(listMealieCategories).mockImplementationOnce(real.listMealieCategories);
    const res = await GET(req());
    expect(res.status).toBe(400);
    expect((await res.json()).failure).toBe('not-set-up');
    vi.mocked(listMealieCategories).mockRejectedValue(new MealieError('unreachable', 'down'));
    expect((await GET(req())).status).toBe(502);
  });
});

describe('who may read it', () => {
  it("lets a wall read it with its display key, for the recipe book", async () => {
    await GET(new NextRequest('http://localhost/api/mealie/categories'));
    expect(requireDisplayAuth).toHaveBeenCalled();
    expect(requireSession).not.toHaveBeenCalled();
  });
});
