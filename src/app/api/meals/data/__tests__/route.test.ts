import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getLatestSchemaVersion } from '@/lib/migrations';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

// Mock the data layer (meals.json reader/writer). The route imports
// `normalizeMealSettings` directly from `meal-constants`, so we don't need
// to re-export it from this mock — the real helper runs unmocked, exercising
// the actual validation logic in the settings-handling tests.
//
// `updateMealData` is emulated as a thin wrapper over the mocked read/write
// pair so existing tests (which assert against `readMealData` / `writeMealData`
// directly) keep working. The wrapper mirrors the real atomic-update contract:
// a read failure falls through to empty defaults (matching json-store's
// default error handling), and a mutator throw propagates to the caller.
vi.mock('@/lib/meal-data', () => {
  const readMealData = vi.fn();
  const writeMealData = vi.fn();
  const DEFAULT_FALLBACK = {
    savedMeals: [],
    plan: [],
    groceryChecked: [],
    settings: {
      enabledSlots: ['breakfast', 'lunch', 'dinner'],
      weekStartDay: 'sunday',
      defaultSlotTimes: {},
      timeFormat: '12h',
    },
  };
  return {
    readMealData,
    writeMealData,
    prunePlan: vi.fn((plan: unknown[]) => plan), // pass-through for tests
    updateMealData: vi.fn(async (mutator: (current: unknown) => unknown) => {
      let current: unknown;
      try {
        current = await readMealData();
      } catch {
        // Emulates json-store's default error handling: ENOENT or any read
        // failure yields the empty default, so the mutator still runs.
        current = DEFAULT_FALLBACK;
      }
      // Mutator throws (including Response throws for guards) propagate.
      const mutated = await mutator(current);
      await writeMealData(mutated);
      return mutated;
    }),
  };
});

import { GET, PUT } from '@/app/api/meals/data/route';
import { readMealData, writeMealData } from '@/lib/meal-data';
import { __resetConfigReadCacheForTests } from '@/lib/config-cache';

const defaultSettings = {
  enabledSlots: ['breakfast', 'lunch', 'dinner'],
  weekStartDay: 'sunday',
  defaultSlotTimes: {},
  timeFormat: '12h',
};
const emptyData = { savedMeals: [], plan: [], groceryChecked: [], settings: defaultSettings };
const populatedData = {
  savedMeals: [{ id: 'm1', name: 'Tacos', emoji: '🌮' }],
  plan: [{ date: '2026-04-04', slot: 'dinner', mealId: 'm1' }],
  groceryChecked: ['tortillas'],
  settings: { ...defaultSettings, weekStartDay: 'monday', defaultSlotTimes: { dinner: '18:30' } },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readMealData).mockResolvedValue(emptyData as never);
  vi.mocked(writeMealData).mockResolvedValue(undefined);
  // The GET reads config through the shared 1.5s read cache; without a reset,
  // a config.json seeded mid-suite would be shadowed by a prior test's read.
  __resetConfigReadCacheForTests();
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
    // The vitest sandbox's data/ has no config.json, so the global falls
    // through to the default rather than a configured preference.
    expect(json.globalTimeFormat).toBe('12h');
  });

  it('reports the household global timeFormat from config.json', async () => {
    vi.mocked(readMealData).mockResolvedValue(populatedData as never);
    // The cached config read runs for real against the sandbox cwd; seed it
    // with a versioned config (a version-less one kicks off readConfig's
    // fire-and-forget migrate-on-boot persist, which can outlive the test).
    const dataDir = path.join(process.cwd(), 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'config.json'), JSON.stringify({
      version: getLatestSchemaVersion(),
      settings: { timeFormat: '24h' },
    }));

    try {
      const req = new NextRequest('http://localhost/api/meals/data');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.globalTimeFormat).toBe('24h');
    } finally {
      // Leave the sandbox config-less for any test that runs after this one.
      await fs.rm(path.join(dataDir, 'config.json'), { force: true });
    }
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

  it('returns 400 when savedMeals is present but not an array', async () => {
    const res = await PUT(makePutRequest({ savedMeals: 'not-array', plan: [] }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('savedMeals');
  });

  it('returns 400 when plan is present but not an array', async () => {
    const res = await PUT(makePutRequest({ savedMeals: [], plan: 'not-array' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('plan');
  });

  it('returns 400 when groceryChecked is present but not an array', async () => {
    const res = await PUT(makePutRequest({ groceryChecked: 'not-array' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('groceryChecked');
  });

  it('returns 400 when no writable fields are present', async () => {
    const res = await PUT(makePutRequest({ force: true }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('at least one');
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

    // Regression tests for asymmetric-empty-payload data loss. Previously the
    // guard only fired when BOTH savedMeals AND plan were empty in the body,
    // so `{savedMeals: []}` alone could silently wipe the meal library while
    // leaving orphaned mealId references in plan (or vice versa).
    it('returns 409 when wiping savedMeals alone without force', async () => {
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({ savedMeals: [] }));

      expect(res.status).toBe(409);
      expect(writeMealData).not.toHaveBeenCalled();
    });

    it('returns 409 when wiping plan alone without force', async () => {
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({ plan: [] }));

      expect(res.status).toBe(409);
      expect(writeMealData).not.toHaveBeenCalled();
    });

    it('allows wiping savedMeals alone with force flag', async () => {
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({ savedMeals: [], force: true }));

      expect(res.status).toBe(200);
      expect(writeMealData).toHaveBeenCalled();
    });

    it('allows non-empty savedMeals with empty plan (partial wipe is still a valid edit)', async () => {
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      // Guard only fires if ALL present fields are empty. Here savedMeals has
      // content so the user is clearly making a deliberate edit.
      const res = await PUT(makePutRequest({
        savedMeals: [{ id: 'm2', name: 'Pasta' }],
        plan: [],
      }));

      expect(res.status).toBe(200);
      expect(writeMealData).toHaveBeenCalled();
    });
  });

  // ------- Field preservation -------

  describe('field preservation', () => {
    it('preserves existing groceryChecked when not provided', async () => {
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({ savedMeals: [{ id: 'm2' }], plan: [] }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.groceryChecked).toEqual(populatedData.groceryChecked);
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
      vi.mocked(readMealData).mockRejectedValue(new Error('disk error'));

      const res = await PUT(makePutRequest({ savedMeals: [{ id: 'm2' }], plan: [] }));
      const json = await res.json();

      expect(res.status).toBe(200);
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

  // ------- Settings handling -------

  describe('settings handling', () => {
    it('preserves existing settings when body omits the settings field', async () => {
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({
        savedMeals: populatedData.savedMeals,
        plan: populatedData.plan,
      }));
      const json = await res.json();

      expect(res.status).toBe(200);
      // Should round-trip the existing settings unchanged
      expect(json.settings.weekStartDay).toBe('monday');
      expect(json.settings.defaultSlotTimes.dinner).toBe('18:30');
    });

    it('writes provided settings through normalization', async () => {
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({
        savedMeals: populatedData.savedMeals,
        plan: populatedData.plan,
        settings: {
          enabledSlots: ['breakfast', 'dinner'],
          weekStartDay: 'sunday',
          defaultSlotTimes: { dinner: '19:00' },
          timeFormat: '24h',
        },
      }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.settings.enabledSlots).toEqual(['breakfast', 'dinner']);
      expect(json.settings.weekStartDay).toBe('sunday');
      expect(json.settings.defaultSlotTimes.dinner).toBe('19:00');
      expect(json.settings.timeFormat).toBe('24h');
    });

    it('sanitizes malformed settings (drops bad fields, keeps good ones)', async () => {
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({
        savedMeals: populatedData.savedMeals,
        plan: populatedData.plan,
        settings: {
          enabledSlots: ['breakfast', 'brunch', 42, 'dinner'], // brunch + 42 should be filtered
          weekStartDay: 'tuesday', // invalid → falls back to sunday
          defaultSlotTimes: { dinner: '25:99', lunch: '12:30' }, // bad time dropped
          timeFormat: '36h', // invalid → dropped entirely (follows the global)
        },
      }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.settings.enabledSlots).toEqual(['breakfast', 'dinner']);
      expect(json.settings.weekStartDay).toBe('sunday');
      expect(json.settings.defaultSlotTimes).toEqual({ lunch: '12:30' });
      expect(json.settings.timeFormat).toBeUndefined();
    });
  });

  // ------- Partial updates (each field independently optional) -------

  describe('partial updates', () => {
    it('accepts settings-only PUT (no meals/plan in body)', async () => {
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({
        settings: { enabledSlots: ['breakfast', 'lunch'], weekStartDay: 'monday' },
      }));
      const json = await res.json();

      expect(res.status).toBe(200);
      // Settings updated
      expect(json.settings.enabledSlots).toEqual(['breakfast', 'lunch']);
      expect(json.settings.weekStartDay).toBe('monday');
      // Existing meals/plan/grocery preserved
      expect(json.savedMeals).toEqual(populatedData.savedMeals);
      expect(json.plan).toEqual(populatedData.plan);
      expect(json.groceryChecked).toEqual(populatedData.groceryChecked);
    });

    it('settings-only PUT does not trip the empty-overwrite guard', async () => {
      // Even though incoming has no meals/plan arrays, the guard should be skipped
      // because the writer isn't claiming to write meal data at all.
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({
        settings: { enabledSlots: ['breakfast', 'dinner'] },
      }));

      expect(res.status).toBe(200);
      expect(writeMealData).toHaveBeenCalled();
    });

    it('accepts grocery-only PUT', async () => {
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({
        groceryChecked: ['flour', 'sugar'],
      }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.groceryChecked).toEqual(['flour', 'sugar']);
      // All other fields preserved
      expect(json.savedMeals).toEqual(populatedData.savedMeals);
      expect(json.plan).toEqual(populatedData.plan);
      expect(json.settings.weekStartDay).toBe('monday');
    });

    it('accepts meals-only PUT (savedMeals + plan, no settings or grocery)', async () => {
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const newMeals = [{ id: 'm2', name: 'Pasta' }];
      const newPlan = [{ date: '2026-04-05', slot: 'lunch', mealId: 'm2' }];
      const res = await PUT(makePutRequest({ savedMeals: newMeals, plan: newPlan }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.savedMeals).toEqual(newMeals);
      expect(json.plan).toEqual(newPlan);
      // Settings + grocery preserved
      expect(json.settings.weekStartDay).toBe('monday');
      expect(json.groceryChecked).toEqual(populatedData.groceryChecked);
    });

    it('settings-only PUT does NOT clobber concurrent meal edits between GET and PUT', async () => {
      // The original race: editor's MealsSection.persist would GET, then PUT with the
      // round-tripped meals. If /remote saved a meal between the GET and PUT, the editor's
      // PUT would overwrite it. After this fix, settings-only PUTs only touch settings.
      vi.mocked(readMealData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({
        settings: { weekStartDay: 'sunday' },
      }));
      const json = await res.json();

      expect(res.status).toBe(200);
      // The PUT body had no savedMeals/plan, so the route reads them from existing
      // (which would reflect any concurrent /remote write that happened in between).
      expect(json.savedMeals).toEqual(populatedData.savedMeals);
      expect(json.plan).toEqual(populatedData.plan);
      expect(json.settings.weekStartDay).toBe('sunday');
    });
  });
});
