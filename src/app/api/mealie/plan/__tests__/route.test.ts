import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/meal-data', () => ({ readMealData: vi.fn() }));
vi.mock('@/lib/meal-answer', () => ({ mealsAnswer: vi.fn(async () => ({ plan: [], mealie: { status: 'ok' } })) }));
vi.mock('@/lib/mealie-plan', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/mealie-plan')>();
  return { ...real, buildMealieBlock: vi.fn(), saveMealieCells: vi.fn() };
});

import { GET, PUT } from '../route';
import { readMealData } from '@/lib/meal-data';
import { buildMealieBlock, saveMealieCells } from '@/lib/mealie-plan';
import { MealieMapError } from '@/lib/mealie-map';

const settings = { enabledSlots: ['dinner'], weekStartDay: 'sunday', defaultSlotTimes: {}, planSource: 'mealie' };

const put = (body: unknown) => new NextRequest('http://localhost/api/mealie/plan', { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

const cell = (extra: Record<string, unknown> = {}) => ({ date: '2026-10-31', slot: 'dinner', before: ['mealie:96'], after: { customText: 'Tacos', sourceId: 'mealie:96' }, ...extra });

describe('GET /api/mealie/plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readMealData).mockResolvedValue({ savedMeals: [], plan: [], groceryChecked: {}, settings, mealieExtras: { 96: { time: '18:30', date: '2026-10-31' } } } as never);
    vi.mocked(buildMealieBlock).mockResolvedValue({ status: 'ok', plan: [], meals: [], range: { start: '2026-12-01', end: '2026-12-07' }, fetchedAt: 1 });
  });

  it('reads the asked weeks with the hub notes applied', async () => {
    const res = await GET(new NextRequest('http://localhost/api/mealie/plan?start=2026-12-01&end=2026-12-07'));
    expect(res.status).toBe(200);
    expect(buildMealieBlock).toHaveBeenCalledWith({ start: '2026-12-01', end: '2026-12-07' }, { 96: { time: '18:30', date: '2026-10-31' } });
  });

  it.each([
    ['?start=2026-12-07&end=2026-12-01'],
    ['?start=2026-01-01&end=2026-06-01'],
    ['?start=2026-02-30&end=2026-03-02'],
    [''],
  ])('refuses %s', async (q) => {
    expect((await GET(new NextRequest(`http://localhost/api/mealie/plan${q}`))).status).toBe(400);
  });
});

describe('PUT /api/mealie/plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readMealData).mockResolvedValue({ savedMeals: [], plan: [], groceryChecked: {}, settings } as never);
    vi.mocked(saveMealieCells).mockResolvedValue({ ok: true });
  });

  it('saves the changed meals and answers like GET /api/meals/data', async () => {
    const res = await PUT(put({ cells: [cell({ after: { customText: ' Tacos ', time: '18:30', sourceId: 'mealie:96', courses: [{ kind: 'side', customText: 'Rice', sourceId: 'mealie:97' }, { kind: 'soup' }] } })] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plan: [], mealie: { status: 'ok' } });
    expect(saveMealieCells).toHaveBeenCalledWith([{
      date: '2026-10-31',
      slot: 'dinner',
      before: ['mealie:96'],
      after: { date: '2026-10-31', slot: 'dinner', customText: 'Tacos', time: '18:30', sourceId: 'mealie:96', courses: [{ kind: 'side', customText: 'Rice', sourceId: 'mealie:97' }] },
    }]);
  });

  it('clears a meal with a null after', async () => {
    await PUT(put({ cells: [cell({ after: null })] }));
    expect(vi.mocked(saveMealieCells).mock.calls[0][0][0].after).toBeNull();
  });

  it('answers a conflict with the fresh plan and the reason the clients already retry on', async () => {
    vi.mocked(saveMealieCells).mockResolvedValue({ ok: false, reason: 'conflict' });
    const res = await PUT(put({ cells: [cell()] }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'revision', mealie: { status: 'ok' } });
  });

  it('says when Mealie only took part of a change', async () => {
    vi.mocked(saveMealieCells).mockResolvedValue({ ok: false, reason: 'partial', failure: 'unreachable' });
    const res = await PUT(put({ cells: [cell()] }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ reason: 'partial', failure: 'unreachable', mealie: { status: 'ok' } });
  });

  it('refuses a meal from the Home Screens library', async () => {
    vi.mocked(saveMealieCells).mockRejectedValue(new MealieMapError('A meal from the Home Screens library cannot go in a Mealie plan'));
    expect((await PUT(put({ cells: [cell()] }))).status).toBe(400);
  });

  it('refuses when the plan no longer lives in Mealie', async () => {
    vi.mocked(readMealData).mockResolvedValue({ savedMeals: [], plan: [], groceryChecked: {}, settings: { ...settings, planSource: undefined } } as never);
    expect((await PUT(put({ cells: [cell()] }))).status).toBe(409);
    expect(saveMealieCells).not.toHaveBeenCalled();
  });

  it.each([
    [{ cells: [] }],
    [{ cells: [cell({ slot: 'brunch' })] }],
    [{ cells: [cell({ date: '2026-13-01' })] }],
    [{ cells: [cell({ before: 'mealie:96' })] }],
    [{ cells: [cell({ after: 'Tacos' })] }],
    [{ cells: [cell(), cell()] }],
  ])('refuses a malformed body %#', async (body) => {
    expect((await PUT(put(body))).status).toBe(400);
    expect(saveMealieCells).not.toHaveBeenCalled();
  });
});
