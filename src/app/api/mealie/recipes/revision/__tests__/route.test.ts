import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/mealie', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/mealie')>();
  return { ...real, getMealieRecipesRevision: vi.fn() };
});

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { requireDisplayAuth } from '@/lib/auth';
import { getMealieRecipesRevision, MealieError } from '@/lib/mealie';

const req = () => new NextRequest('http://localhost/api/mealie/recipes/revision');

describe('GET /api/mealie/recipes/revision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers the revision to a wall', async () => {
    vi.mocked(getMealieRecipesRevision).mockResolvedValue('0123456789abcdef');
    expect(await (await GET(req())).json()).toEqual({ revision: '0123456789abcdef' });
    // Display access: a wall with its display token can ask.
    expect(requireDisplayAuth).toHaveBeenCalled();
  });

  it('says when Mealie is not connected or down', async () => {
    const real = await vi.importActual<typeof import('@/lib/mealie')>('@/lib/mealie');
    vi.mocked(getMealieRecipesRevision).mockImplementationOnce(real.getMealieRecipesRevision);
    const res = await GET(req());
    expect(res.status).toBe(400);
    expect((await res.json()).failure).toBe('not-set-up');
    vi.mocked(getMealieRecipesRevision).mockRejectedValue(new MealieError('unreachable', 'down'));
    expect((await GET(req())).status).toBe(502);
  });
});
