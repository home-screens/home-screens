import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  hasEditorSession: vi.fn(),
  hasSignedInSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/config', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/config')>()),
  readConfig: vi.fn(),
}));
// Wednesday 18 November 2026: this week runs to Saturday the 21st, next week to Saturday the 28th.
vi.mock('@/lib/household-day', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/household-day')>()),
  householdToday: vi.fn(async () => '2026-11-18'),
}));
// Mealie is only asked in Mealie mode; its plan and its save are stubbed there.
vi.mock('@/lib/mealie-plan', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mealie-plan')>()),
  buildDefaultMealieBlock: vi.fn(),
  saveMealieCells: vi.fn(),
}));

import { hasEditorSession, hasSignedInSession } from '@/lib/auth';
import { readConfig } from '@/lib/config';
import { __resetConfigReadCacheForTests } from '@/lib/config-cache';
import { GROWN_UP_HEADER } from '@/lib/grown-up-code';
import { checkGrownUpCode, removeGrownUpCode, setGrownUpCode, updateGrownUpPrefs } from '@/lib/grown-up-code-data';
import { readMealData, updateMealData, writeMealData, type MealData } from '@/lib/meal-data';
import { mealieMealId } from '@/lib/mealie-map';
import { buildDefaultMealieBlock, saveMealieCells } from '@/lib/mealie-plan';
import { resetWallPlanUndo } from '@/lib/wall-plan-undo';
import type { MealSettings, PlannedMeal, SavedMeal, ScreenConfiguration } from '@/types/config';
const { POST } = await import('../route');

const THURSDAY = '2026-11-19';

const TACOS: SavedMeal = { id: 'tacos', name: 'Tacos', emoji: '🌮', ingredients: [{ name: 'Tortillas' }, { name: 'Ground beef' }] };
const STIR_FRY: SavedMeal = { id: 'stir-fry', name: 'Veggie stir fry', ingredients: [{ name: 'Broccoli' }] };
const GARLIC_BREAD: SavedMeal = { id: 'garlic-bread', name: 'Garlic bread', category: 'side', notes: 'Butter, garlic, bake 10 minutes.' };
// A name only: nothing to cook from, so it is not a recipe the wall can plan.
const LEFTOVERS: SavedMeal = { id: 'leftovers', name: 'Leftovers' };

const SETTINGS: MealSettings = { enabledSlots: ['breakfast', 'lunch', 'dinner'], weekStartDay: 'sunday', defaultSlotTimes: {} };

function configWith(...modules: Array<{ type: string; config: Record<string, unknown>; enabled?: boolean }>): ScreenConfiguration {
  return {
    version: 21,
    settings: {},
    screens: [{ id: 's', name: 'S', modules: modules.map((m, i) => ({ id: `m${i}`, position: { x: 0, y: 0 }, size: { w: 1, h: 1 }, style: {}, ...m })) }],
  } as unknown as ScreenConfiguration;
}
const mealCard = (extra: Record<string, unknown> = {}) => ({ type: 'meal-planner', config: { view: 'week', wallPlan: true, ...extra } });

async function seed(plan: PlannedMeal[] = [], settings: Partial<MealSettings> = {}): Promise<void> {
  await writeMealData({
    savedMeals: [TACOS, STIR_FRY, GARLIC_BREAD, LEFTOVERS],
    plan,
    groceryChecked: {},
    settings: { ...SETTINGS, ...settings },
    timeFormatLegacyStripped: true,
  } as MealData);
}

function send(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(new NextRequest('http://localhost/api/meals/plan/wall', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  }));
}
const put = (mealId: string, extra: Record<string, unknown> = {}) => send({ action: 'put', date: THURSDAY, slot: 'dinner', mealId, kind: 'main', ...extra });
const thursdayDinner = async () => (await readMealData()).plan.find((p) => p.date === THURSDAY && p.slot === 'dinner');

beforeEach(async () => {
  vi.clearAllMocks();
  resetWallPlanUndo();
  __resetConfigReadCacheForTests();
  vi.mocked(hasEditorSession).mockResolvedValue(false);
  vi.mocked(hasSignedInSession).mockResolvedValue(false);
  vi.mocked(readConfig).mockResolvedValue(configWith(mealCard()));
  await seed();
});

describe('POST /api/meals/plan/wall from a wall', () => {
  it('refuses while no meal card lets the wall plan', async () => {
    vi.mocked(readConfig).mockResolvedValue(configWith(mealCard({ wallPlan: false })));
    const res = await put('tacos');
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'meals.wallPlanOff' });
    expect(await thursdayDinner()).toBeUndefined();
  });

  it('refuses a planning card that is switched off or has taps off', async () => {
    vi.mocked(readConfig).mockResolvedValue(configWith({ ...mealCard(), enabled: false }));
    expect((await put('tacos')).status).toBe(403);
    vi.mocked(readConfig).mockResolvedValue(configWith(mealCard({ interactive: false })));
    expect((await put('tacos')).status).toBe(403);
    expect(await thursdayDinner()).toBeUndefined();
  });

  it('counts the full-screen meal planner the same as the small card', async () => {
    vi.mocked(readConfig).mockResolvedValue(configWith({ type: 'fullscreen-meal-planner', config: { wallPlan: true } }));
    expect((await put('tacos')).status).toBe(200);
  });

  it('puts a recipe on a free day, writes it, and hands back an Undo ticket', async () => {
    const res = await put('tacos');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wall).toEqual({ outcome: 'planned', changed: true, undo: expect.stringMatching(/^[0-9a-f]{24}$/) });
    // The rest is the meals answer, read after the change, which the wall draws at once.
    expect(body.plan).toEqual([{ date: THURSDAY, slot: 'dinner', mealId: 'tacos' }]);
    expect(body.savedMeals.map((m: SavedMeal) => m.name)).toEqual(['Tacos', 'Veggie stir fry', 'Garlic bread', 'Leftovers']);
    expect(typeof body.revision).toBe('string');
    expect(await thursdayDinner()).toEqual({ date: THURSDAY, slot: 'dinner', mealId: 'tacos' });
  });

  it('answers a second put of the same recipe as done, writing nothing and offering no Undo', async () => {
    await put('tacos');
    const res = await put('tacos');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wall).toEqual({ outcome: 'planned', changed: false });
    expect(body.plan).toHaveLength(1);
  });

  it('refuses a day that got a different main dish, and answers with the menu as it is', async () => {
    await seed([{ date: THURSDAY, slot: 'dinner', mealId: 'stir-fry' }]);
    const res = await put('tacos');
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe('taken');
    expect(body.plan).toEqual([{ date: THURSDAY, slot: 'dinner', mealId: 'stir-fry' }]);
    expect(body.wall).toBeUndefined();
    expect((await thursdayDinner())?.mealId).toBe('stir-fry');
  });

  it('lets a side join a day that already has a meal', async () => {
    await seed([{ date: THURSDAY, slot: 'dinner', mealId: 'stir-fry', time: '17:30' }]);
    const res = await put('garlic-bread', { kind: 'side' });
    expect(res.status).toBe(200);
    expect((await res.json()).wall).toMatchObject({ outcome: 'joined', changed: true });
    expect(await thursdayDinner()).toEqual({
      date: THURSDAY, slot: 'dinner', mealId: 'stir-fry', time: '17:30', courses: [{ kind: 'side', mealId: 'garlic-bread' }],
    });
  });

  it('swaps the main dish while it is still the one the wall asked about', async () => {
    await seed([{ date: THURSDAY, slot: 'dinner', mealId: 'stir-fry' }]);
    const res = await put('tacos', { action: 'swap', expect: 'm:stir-fry' });
    expect(res.status).toBe(200);
    expect((await res.json()).wall).toMatchObject({ outcome: 'swapped', changed: true });
    expect((await thursdayDinner())?.mealId).toBe('tacos');
  });

  it('refuses a swap once the dish there is not the one the wall asked about', async () => {
    await seed([{ date: THURSDAY, slot: 'dinner', customText: 'Pizza night' }]);
    const res = await put('tacos', { action: 'swap', expect: 'm:stir-fry' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe('changed');
    expect(body.plan).toEqual([{ date: THURSDAY, slot: 'dinner', customText: 'Pizza night' }]);
    expect((await thursdayDinner())?.customText).toBe('Pizza night');
  });

  it('takes a recipe off even when the recipe was deleted since', async () => {
    await seed([{ date: THURSDAY, slot: 'dinner', mealId: 'old-chili' }]);
    const res = await send({ action: 'off', date: THURSDAY, slot: 'dinner', mealId: 'old-chili', kind: 'main' });
    expect(res.status).toBe(200);
    expect((await res.json()).wall).toMatchObject({ outcome: 'off', changed: true });
    expect(await thursdayDinner()).toBeUndefined();
  });
});

describe('POST /api/meals/plan/wall with { undo }', () => {
  it('puts the meal back as it was, and a ticket works once', async () => {
    await seed([{ date: THURSDAY, slot: 'dinner', mealId: 'stir-fry' }]);
    const { wall } = await (await put('tacos', { action: 'swap', expect: 'm:stir-fry' })).json();

    const res = await send({ undo: wall.undo });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wall).toEqual({ changed: true });
    expect(body.plan).toEqual([{ date: THURSDAY, slot: 'dinner', mealId: 'stir-fry' }]);
    expect((await thursdayDinner())?.mealId).toBe('stir-fry');

    const again = await send({ undo: wall.undo });
    expect(again.status).toBe(409);
    expect((await again.json()).reason).toBe('moved');
    expect((await thursdayDinner())?.mealId).toBe('stir-fry');
  });

  it('leaves a free day free again', async () => {
    const { wall } = await (await put('tacos')).json();
    expect((await send({ undo: wall.undo })).status).toBe(200);
    expect(await thursdayDinner()).toBeUndefined();
  });

  it('leaves the day alone once somebody else changed it', async () => {
    const { wall } = await (await put('tacos')).json();
    // The phone changes Thursday's dinner before the wall's Undo arrives.
    await updateMealData((data) => ({
      ...data,
      plan: data.plan.map((p) => (p.date === THURSDAY && p.slot === 'dinner' ? { date: THURSDAY, slot: 'dinner', customText: 'Pizza night' } : p)),
    }));

    const res = await send({ undo: wall.undo });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe('moved');
    expect(body.plan).toEqual([{ date: THURSDAY, slot: 'dinner', customText: 'Pizza night' }]);
    expect((await thursdayDinner())?.customText).toBe('Pizza night');
    // The ticket is spent: putting the phone's change back later would undo the wrong thing.
    expect((await (await send({ undo: wall.undo })).json()).reason).toBe('moved');
  });

  it('refuses a ticket the hub never handed out', async () => {
    for (const undo of ['0123456789abcdef01234567', '', 7]) {
      const res = await send({ undo });
      expect(res.status).toBe(409);
      expect((await res.json()).reason).toBe('moved');
    }
  });
});

describe('POST /api/meals/plan/wall: what the wall may send', () => {
  it('refuses a body that is not an object', async () => {
    for (const body of [null, [], 'tacos', 7]) expect((await send(body)).status).toBe(400);
  });

  it('refuses an action, a date, a slot or a kind it does not know', async () => {
    expect((await put('tacos', { action: 'replace' })).status).toBe(400);
    expect((await put('tacos', { date: '2026-11-31' })).status).toBe(400);
    expect((await put('tacos', { date: 'Thursday' })).status).toBe(400);
    expect((await put('tacos', { slot: 'brunch' })).status).toBe(400);
    expect((await put('tacos', { kind: 'appetizer' })).status).toBe(400);
    expect((await put('', {})).status).toBe(400);
    expect((await put('tacos', { expect: 7 })).status).toBe(400);
    expect(await thursdayDinner()).toBeUndefined();
  });

  it('refuses a meal the household does not plan', async () => {
    // Snack is a real slot, but this household has it off.
    const res = await put('tacos', { slot: 'snack' });
    expect(res.status).toBe(400);
    expect((await readMealData()).plan).toEqual([]);
  });

  it('plans today to the end of next week, and no day outside that', async () => {
    const yesterday = await put('tacos', { date: '2026-11-17' });
    expect(yesterday.status).toBe(400);
    expect((await yesterday.json()).code).toBe('meals.wallPlanDay');
    expect((await put('tacos', { date: '2026-11-29' })).status).toBe(400);
    expect((await put('tacos', { date: '2026-11-18' })).status).toBe(200);
    expect((await put('tacos', { date: '2026-11-28' })).status).toBe(200);
  });

  it('counts next week from the day the household starts its week', async () => {
    await seed([], { weekStartDay: 'monday' });
    expect((await put('tacos', { date: '2026-11-29' })).status).toBe(200);
    expect((await put('tacos', { date: '2026-11-30' })).status).toBe(400);
  });

  it('refuses a meal with no recipe, one it has never heard of, and a Mealie recipe on a plan kept here', async () => {
    const mealieTacos = mealieMealId('7b1c2a4e-5d3f-4e8a-9b6c-1f2e3d4c5b6a');
    for (const mealId of ['leftovers', 'meatloaf', mealieTacos]) {
      const res = await put(mealId);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('meals.wallPlanRecipe');
    }
    expect(await thursdayDinner()).toBeUndefined();
  });
});

describe('POST /api/meals/plan/wall with a session', () => {
  beforeEach(() => {
    vi.mocked(hasEditorSession).mockResolvedValue(true);
    vi.mocked(readConfig).mockResolvedValue(configWith({ type: 'meal-planner', config: { view: 'week' } }));
  });

  it('plans without any card letting the wall plan', async () => {
    const res = await put('tacos');
    expect(res.status).toBe(200);
    expect((await thursdayDinner())?.mealId).toBe('tacos');
  });

  it('still keeps to the days the wall plans', async () => {
    expect((await put('tacos', { date: '2026-11-17' })).status).toBe(400);
  });
});

describe('POST /api/meals/plan/wall and the grown-up code', () => {
  afterEach(async () => {
    await removeGrownUpCode();
  });

  it('asks for the code when changing the menu is ticked, for an Undo too', async () => {
    const { wall } = await (await put('tacos')).json();
    await setGrownUpCode('2468');
    await updateGrownUpPrefs({ actions: ['menu-change'] });

    const res = await put('garlic-bread', { kind: 'side' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ needsGrownUpCode: true, action: 'menu-change' });
    expect((await send({ undo: wall.undo })).status).toBe(403);
    expect(await thursdayDinner()).toEqual({ date: THURSDAY, slot: 'dinner', mealId: 'tacos' });
  });

  it('goes ahead with a fresh unlock', async () => {
    await setGrownUpCode('2468');
    await updateGrownUpPrefs({ actions: ['menu-change'] });
    const unlock = await checkGrownUpCode('2468');
    if (!unlock.ok) throw new Error('expected the code to unlock');
    expect((await put('tacos')).status).toBe(403);
    const res = await send({ action: 'put', date: THURSDAY, slot: 'dinner', mealId: 'tacos', kind: 'main' }, { [GROWN_UP_HEADER]: unlock.token });
    expect(res.status).toBe(200);
  });

  it('does not ask while only other jobs are ticked', async () => {
    // A first code guards spending tickets only.
    await setGrownUpCode('2468');
    expect((await put('tacos')).status).toBe(200);
  });
});

describe('POST /api/meals/plan/wall with the plan in Mealie', () => {
  const STIR_FRY_ID = mealieMealId('3f9a1c2e-8b4d-4e6f-a1b2-c3d4e5f6a7b8');
  const TACOS_ID = mealieMealId('7b1c2a4e-5d3f-4e8a-9b6c-1f2e3d4c5b6a');

  beforeEach(async () => {
    await seed([], { planSource: 'mealie' });
    vi.mocked(buildDefaultMealieBlock).mockResolvedValue({
      status: 'ok',
      plan: [{ date: THURSDAY, slot: 'dinner', mealId: STIR_FRY_ID, sourceId: '101' }],
      meals: [],
      range: { start: '2026-11-15', end: '2026-11-28' },
      fetchedAt: 1,
    });
  });

  it('swaps the dish in Mealie, naming the entry it replaces', async () => {
    vi.mocked(saveMealieCells).mockResolvedValue({ ok: true });
    const res = await put(TACOS_ID, { action: 'swap', expect: `m:${STIR_FRY_ID}` });
    expect(res.status).toBe(200);
    expect((await res.json()).wall).toMatchObject({ outcome: 'swapped', changed: true });
    expect(saveMealieCells).toHaveBeenCalledWith([
      { date: THURSDAY, slot: 'dinner', before: ['101'], after: expect.objectContaining({ mealId: TACOS_ID }) },
    ]);
  });

  it('answers a meal somebody changed in Mealie since the read as changed', async () => {
    vi.mocked(saveMealieCells).mockResolvedValue({ ok: false, reason: 'conflict' });
    const res = await put(TACOS_ID, { action: 'swap', expect: `m:${STIR_FRY_ID}` });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe('changed');
    expect(body.mealie.plan).toEqual([{ date: THURSDAY, slot: 'dinner', mealId: STIR_FRY_ID, sourceId: '101' }]);
  });

  it('refuses a recipe from the Home Screens library', async () => {
    const res = await put('tacos');
    expect(res.status).toBe(400);
    expect(saveMealieCells).not.toHaveBeenCalled();
  });
});
