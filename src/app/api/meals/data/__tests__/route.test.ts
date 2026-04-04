import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/meal-data', () => ({
  readMealData: vi.fn(),
  writeMealData: vi.fn(),
}));

import { GET, PUT } from '@/app/api/meals/data/route';
import { readMealData, writeMealData } from '@/lib/meal-data';

const emptyData = { savedMeals: [], plan: [], previousPlan: [], groceryChecked: [] };
const populatedData = {
  savedMeals: [{ id: 'm1', name: 'Tacos', emoji: '🌮' }],
  plan: [{ day: 0, slot: 'dinner', mealId: 'm1' }],
  previousPlan: [{ day: 1, slot: 'lunch', mealId: 'm1' }],
  groceryChecked: ['tortillas'],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readMealData).mockResolvedValue(emptyData as never);
  vi.mocked(writeMealData).mockResolvedValue(undefined);
});

// ------- GET tests -------

describe('GET /api/meals/data', () => {
  it('returns meal data', async () => {
    vi.mocked(readMealData).mockResolvedValue(populatedData as never);

    const req = new NextRequest('http://localhost/api/meals/data');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.savedMeals).toHaveLength(1);
    expect(json.plan).toHaveLength(1);
  });

  it('returns 500 when readMealData throws', async () => {
    vi.mocked(readMealData).mockRejectedValue(new Error('disk error'));

    const req = new NextRequest('http://localhost/api/meals/data');
    const res = await GET(req);

    expect(res.status).toBe(500);
  });
});

// ------- PUT tests -------

describe('PUT /api/meals/data', () => {
  function makePutRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/meals/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('saves valid meal data', async () => {
    const payload = { savedMeals: populatedData.savedMeals, plan: populatedData.plan };
    const res = await PUT(makePutRequest(payload));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(writeMealData).toHaveBeenCalled();
    expect(json.savedMeals).toHaveLength(1);
    expect(json.plan).toHaveLength(1);
  });

  it('returns 400 when savedMeals is not an array', async () => {
    const res = await PUT(makePutRequest({ savedMeals: 'not-array', plan: [] }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('arrays');
  });

  it('returns 400 when plan is not an array', async () => {
    const res = await PUT(makePutRequest({ savedMeals: [], plan: 'not-array' }));

    expect(res.status).toBe(400);
  });

  // ------- Empty overwrite protection -------

  describe('empty overwrite protection', () => {
    it('returns 409 when overwriting non-empty data with empty payload', async () => {
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({ savedMeals: [], plan: [] }));

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain('empty payload');
      expect(writeMealData).not.toHaveBeenCalled();
    });

    it('allows empty payload when existing data is also empty', async () => {
      vi.mocked(readMealData).mockResolvedValue(emptyData as never);

      const res = await PUT(makePutRequest({ savedMeals: [], plan: [] }));

      expect(res.status).toBe(200);
      expect(writeMealData).toHaveBeenCalled();
    });

    it('allows empty payload when force flag is true', async () => {
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({ savedMeals: [], plan: [], force: true }));

      expect(res.status).toBe(200);
      expect(writeMealData).toHaveBeenCalled();
    });

    it('allows empty payload when readMealData fails (cannot verify existing)', async () => {
      vi.mocked(readMealData).mockRejectedValue(new Error('file not found'));

      const res = await PUT(makePutRequest({ savedMeals: [], plan: [] }));

      expect(res.status).toBe(200);
      expect(writeMealData).toHaveBeenCalled();
    });
  });

  // ------- Field preservation -------

  describe('field preservation', () => {
    it('preserves existing previousPlan when not provided', async () => {
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({ savedMeals: [{ id: 'm2' }], plan: [] }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.previousPlan).toEqual(populatedData.previousPlan);
    });

    it('preserves existing groceryChecked when not provided', async () => {
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({ savedMeals: [{ id: 'm2' }], plan: [] }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.groceryChecked).toEqual(populatedData.groceryChecked);
    });

    it('uses provided previousPlan when given', async () => {
      const newPrevious = [{ day: 3, slot: 'breakfast', mealId: 'm1' }];
      const res = await PUT(makePutRequest({
        savedMeals: [{ id: 'm2' }],
        plan: [],
        previousPlan: newPrevious,
      }));
      const json = await res.json();

      expect(json.previousPlan).toEqual(newPrevious);
    });

    it('uses provided groceryChecked when given', async () => {
      const newChecked = ['flour', 'sugar'];
      const res = await PUT(makePutRequest({
        savedMeals: [{ id: 'm2' }],
        plan: [],
        groceryChecked: newChecked,
      }));
      const json = await res.json();

      expect(json.groceryChecked).toEqual(newChecked);
    });

    it('falls back gracefully when readMealData fails during field preservation', async () => {
      // First call (guard) passes because incoming is non-empty,
      // second call (field preservation) fails
      vi.mocked(readMealData).mockRejectedValue(new Error('disk error'));

      const res = await PUT(makePutRequest({ savedMeals: [{ id: 'm2' }], plan: [] }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.previousPlan).toEqual([]);
      expect(json.groceryChecked).toEqual([]);
    });
  });

  it('allows non-empty payload without force flag', async () => {
    vi.mocked(readMealData).mockResolvedValue(populatedData as never);

    const res = await PUT(makePutRequest({
      savedMeals: [{ id: 'm2', name: 'Pasta' }],
      plan: [],
    }));

    expect(res.status).toBe(200);
    expect(writeMealData).toHaveBeenCalled();
  });
});
