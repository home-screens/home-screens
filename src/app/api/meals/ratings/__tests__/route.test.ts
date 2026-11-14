import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/family-data', () => ({
  readFamilyData: vi.fn().mockResolvedValue({ members: [
    { id: 'one', name: 'Member One', emoji: 'lucide:heart', color: '#60a5fa' },
    { id: 'two', name: 'Member Two', emoji: 'lucide:crown', color: '#fbbf24' },
  ] }),
}));
vi.mock('@/lib/mealie', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/mealie')>(), getMealieRecipe: vi.fn(),
}));

import { POST } from '../route';
import { readMealData, updateMealData, writeMealData } from '@/lib/meal-data';
import { requireDisplayAuth, requireSession } from '@/lib/auth';
import { getMealieRecipe, MealieError } from '@/lib/mealie';

const RECIPE = '0f1e2d3c-4b5a-4968-8776-655443322110';
const request = (body: unknown) => new NextRequest('http://localhost/api/meals/ratings', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const vote = (rating: unknown, memberId = 'one', mealId = 'soup') => POST(request({ mealId, memberId, rating }));

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(getMealieRecipe).mockReset();
  const data = await readMealData();
  await writeMealData({ ...data, familyRatings: undefined,
    savedMeals: [{ id: 'soup', name: 'Soup', isFavorite: true }],
    plan: [{ date: '2099-01-01', slot: 'dinner', mealId: 'soup', courses: [
      { kind: 'side', customText: 'Bread' }, { kind: 'drink', customText: 'Water' },
    ] }],
  });
});

describe('/api/meals/ratings', () => {
  it('takes a vote from a wall and answers with every vote', async () => {
    const res = await vote(4);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ratings: [expect.objectContaining({ mealId: 'soup', memberId: 'one', rating: 4 })] });
    expect(requireDisplayAuth).toHaveBeenCalled();
    expect(requireSession).not.toHaveBeenCalled();
  });

  it('reads meals whose stored votes hold a bad row, and repairs the file', async () => {
    const data = await readMealData();
    const good = { mealId: 'soup', memberId: 'one', rating: 4, updatedAt: '2026-01-01T00:00:00.000Z' };
    await writeMealData({ ...data, familyRatings: [
      good,
      { mealId: 'soup', memberId: 'two', rating: 9, updatedAt: 'never' },
      { ...good, rating: 2, updatedAt: '2025-12-01T00:00:00.000Z' },
    ] as never });
    // The plan and the recipes still load, with the one real vote.
    const read = await readMealData();
    expect(read.savedMeals).toHaveLength(1);
    expect(read.familyRatings).toEqual([good]);
    // And a vote can still be saved on top of it.
    expect((await vote(5, 'two')).status).toBe(200);
    expect((await readMealData()).familyRatings).toEqual([good, expect.objectContaining({ memberId: 'two', rating: 5 })]);
  });

  it('takes a deleted recipe\'s votes along and keeps a Mealie recipe\'s', async () => {
    await vote(4);
    await vote(3, 'two', `mealie:${RECIPE}`);
    await updateMealData((current) => ({ ...current, savedMeals: [] }));
    expect((await readMealData()).familyRatings).toEqual([expect.objectContaining({ mealId: `mealie:${RECIPE}`, memberId: 'two' })]);
  });

  it('updates and clears one vote without changing the meals or the plan', async () => {
    const before = await readMealData();
    await vote(2);
    await vote(5);
    expect((await readMealData()).familyRatings).toEqual([
      expect.objectContaining({ mealId: 'soup', memberId: 'one', rating: 5 }),
    ]);
    await vote(null);
    expect(await readMealData()).toEqual({ ...before, familyRatings: [] });
  });

  it('merges concurrent votes by different members', async () => {
    const responses = await Promise.all([vote(2), vote(4, 'two')]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect((await readMealData()).familyRatings).toHaveLength(2);
  });

  it('refuses unauthenticated writes before changing data', async () => {
    vi.mocked(requireDisplayAuth).mockRejectedValueOnce(new Response(null, { status: 401 }));
    expect((await vote(4)).status).toBe(401);
    expect((await readMealData()).familyRatings).toBeUndefined();
  });

  it('does not duplicate a repeated vote', async () => {
    await vote(4);
    const first = (await readMealData()).familyRatings;
    await vote(4);
    expect((await readMealData()).familyRatings).toEqual(first);
  });

  it.each([0, 6, 2.5, '5', true, undefined])('rejects an invalid rating: %s', async (rating) => {
    expect((await vote(rating)).status).toBe(400);
    expect((await readMealData()).familyRatings).toBeUndefined();
  });

  it('rejects unknown members, missing meals and malformed bodies', async () => {
    expect((await vote(4, 'missing')).status).toBe(404);
    expect((await vote(4, 'one', 'missing')).status).toBe(404);
    expect((await POST(request([]))).status).toBe(400);
    expect((await POST(request(null))).status).toBe(400);
    expect((await vote(4, 'one', 'mealie:../../users')).status).toBe(400);
  });

  it('verifies Mealie recipes when voting but allows clearing while offline', async () => {
    expect((await vote(4, 'one', `mealie:${RECIPE}`)).status).toBe(200);
    expect(getMealieRecipe).toHaveBeenCalledWith(RECIPE);
    vi.mocked(getMealieRecipe).mockRejectedValue(new MealieError('key-rejected', 'offline'));
    expect((await vote(5, 'one', `mealie:${RECIPE}`)).status).toBeGreaterThanOrEqual(400);
    vi.mocked(getMealieRecipe).mockClear();
    expect((await vote(null, 'one', `mealie:${RECIPE}`)).status).toBe(200);
    expect(getMealieRecipe).not.toHaveBeenCalled();
    expect((await readMealData()).familyRatings).toEqual([]);
  });
});
