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
  return { ...real, suggestMealieMeals: vi.fn() };
});

import { POST } from '../route';
import { readMealData } from '@/lib/meal-data';
import { suggestMealieMeals } from '@/lib/mealie-plan';

const settings = { enabledSlots: ['dinner'], weekStartDay: 'sunday', defaultSlotTimes: {}, planSource: 'mealie' };
const post = (body: unknown) => new NextRequest('http://localhost/api/mealie/plan/suggest', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('POST /api/mealie/plan/suggest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readMealData).mockResolvedValue({ savedMeals: [], plan: [], groceryChecked: {}, settings } as never);
    vi.mocked(suggestMealieMeals).mockResolvedValue({ ok: true, created: 2, skipped: 1, entries: [{ date: '2026-11-02', slot: 'dinner', sourceId: 'mealie:9' }, { date: '2026-11-03', slot: 'dinner', sourceId: 'mealie:10' }] });
  });

  it('fills the empty meals and says how many', async () => {
    const res = await POST(post({ cells: [{ date: '2026-11-02', slot: 'dinner' }, { date: '2026-11-03', slot: 'dinner' }] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ suggested: { created: 2, skipped: 1, entries: [{ sourceId: 'mealie:9' }, { sourceId: 'mealie:10' }] }, mealie: { status: 'ok' } });
    expect(suggestMealieMeals).toHaveBeenCalledWith([{ date: '2026-11-02', slot: 'dinner' }, { date: '2026-11-03', slot: 'dinner' }]);
  });

  it('refuses a malformed request and a plan that lives in Home Screens', async () => {
    expect((await POST(post({ cells: [{ date: 'soon', slot: 'dinner' }] }))).status).toBe(400);
    vi.mocked(readMealData).mockResolvedValue({ savedMeals: [], plan: [], groceryChecked: {}, settings: { ...settings, planSource: undefined } } as never);
    expect((await POST(post({ cells: [{ date: '2026-11-02', slot: 'dinner' }] }))).status).toBe(409);
    expect(suggestMealieMeals).not.toHaveBeenCalled();
  });

  it('passes Mealie being down on', async () => {
    vi.mocked(suggestMealieMeals).mockResolvedValue({ ok: false, failure: 'unreachable' });
    expect((await POST(post({ cells: [{ date: '2026-11-02', slot: 'dinner' }] }))).status).toBe(502);
  });
});
