import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { MealData } from '../meal-data';
import { readMealData, writeMealData, updateMealData, prunePlan } from '../meal-data';
import { getLatestSchemaVersion } from '../migrations';

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-meal-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('readMealData', () => {
  it('returns empty defaults when file does not exist', async () => {
    const data = await readMealData();
    expect(data.savedMeals).toEqual([]);
    expect(data.plan).toEqual([]);
    expect(data.groceryChecked).toEqual([]);
    expect(data.settings.enabledSlots).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(data.settings.weekStartDay).toBe('sunday');
  });

  it('reads a valid meals file', async () => {
    const mealsDir = path.join(tmpDir, 'data');
    await fs.mkdir(mealsDir, { recursive: true });
    const saved = {
      savedMeals: [{ id: 'm1', name: 'Pasta', ingredients: [], tags: [], prepTime: 30 }],
      plan: [{ date: '2026-04-04', slot: 'dinner', mealId: 'm1' }],
      groceryChecked: ['tomatoes'],
    };
    await fs.writeFile(path.join(mealsDir, 'meals.json'), JSON.stringify(saved));

    const data = await readMealData();
    expect(data.savedMeals).toHaveLength(1);
    expect(data.savedMeals[0].name).toBe('Pasta');
    expect(data.plan).toHaveLength(1);
    expect(data.plan[0].date).toBe('2026-04-04');
    expect(data.groceryChecked).toEqual(['tomatoes']);
  });

  it('normalizes missing fields to empty arrays (backward compat)', async () => {
    const mealsDir = path.join(tmpDir, 'data');
    await fs.mkdir(mealsDir, { recursive: true });
    await fs.writeFile(path.join(mealsDir, 'meals.json'), JSON.stringify({
      savedMeals: [{ id: 'm1', name: 'Soup' }],
    }));

    const data = await readMealData();
    expect(data.savedMeals).toHaveLength(1);
    expect(data.plan).toEqual([]);
    expect(data.groceryChecked).toEqual([]);
  });

  it('handles non-array fields gracefully', async () => {
    const mealsDir = path.join(tmpDir, 'data');
    await fs.mkdir(mealsDir, { recursive: true });
    await fs.writeFile(path.join(mealsDir, 'meals.json'), JSON.stringify({
      savedMeals: 'not-an-array',
      plan: 42,
      groceryChecked: { bad: true },
    }));

    const data = await readMealData();
    expect(data.savedMeals).toEqual([]);
    expect(data.plan).toEqual([]);
    expect(data.groceryChecked).toEqual([]);
  });

  it('throws on non-ENOENT errors (e.g., invalid JSON)', async () => {
    const mealsDir = path.join(tmpDir, 'data');
    await fs.mkdir(mealsDir, { recursive: true });
    await fs.writeFile(path.join(mealsDir, 'meals.json'), '{ invalid json !!!');

    await expect(readMealData()).rejects.toThrow();
  });

  it('migrates legacy day-based plan entries in memory', async () => {
    const mealsDir = path.join(tmpDir, 'data');
    await fs.mkdir(mealsDir, { recursive: true });
    await fs.writeFile(path.join(mealsDir, 'meals.json'), JSON.stringify({
      savedMeals: [{ id: 'm1', name: 'Tacos' }],
      plan: [{ day: 0, slot: 'dinner', mealId: 'm1' }],
      previousPlan: [{ day: 1, slot: 'lunch', mealId: 'm1' }],
      groceryChecked: [],
    }));

    const data = await readMealData();
    // Should have migrated: plan entries should have `date` not `day`
    expect(data.plan).toHaveLength(1);
    expect(data.plan[0].date).toBeDefined();
    expect(typeof data.plan[0].date).toBe('string');
    expect(data.plan[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // previousPlan should be gone from the returned data
    expect((data as unknown as Record<string, unknown>).previousPlan).toBeUndefined();
  });

  it('best-effort write-through persists migration to disk', async () => {
    const mealsDir = path.join(tmpDir, 'data');
    await fs.mkdir(mealsDir, { recursive: true });
    await fs.writeFile(path.join(mealsDir, 'meals.json'), JSON.stringify({
      savedMeals: [{ id: 'm1', name: 'Tacos' }],
      plan: [{ day: 0, slot: 'dinner', mealId: 'm1' }],
      previousPlan: [{ day: 1, slot: 'lunch', mealId: 'm1' }],
      groceryChecked: [],
    }));

    await readMealData();
    // Give the fire-and-forget write a moment to complete
    await new Promise((r) => setTimeout(r, 200));

    const raw = JSON.parse(await fs.readFile(path.join(mealsDir, 'meals.json'), 'utf-8'));
    expect(raw.plan[0].date).toBeDefined();
    expect(raw.plan[0].day).toBeUndefined();
    expect(raw.previousPlan).toBeUndefined();
  });
});

describe('writeMealData', () => {
  it('writes and round-trips meal data', async () => {
    const data: MealData = {
      savedMeals: [{ id: 'm1', name: 'Tacos', ingredients: [{ name: 'beef' }, { name: 'shells' }], tags: ['mexican'], prepTime: 20 }],
      plan: [{ date: '2026-04-01', slot: 'dinner', mealId: 'm1', time: '18:30' }],
      groceryChecked: ['beef'],
      settings: { enabledSlots: ['breakfast', 'lunch', 'dinner'], weekStartDay: 'monday', defaultSlotTimes: { dinner: '18:00' }, timeFormat: '12h' },
    };

    await writeMealData(data);
    const result = await readMealData();
    expect(result.savedMeals[0].name).toBe('Tacos');
    expect(result.plan[0].mealId).toBe('m1');
    expect(result.plan[0].date).toBe('2026-04-01');
    expect(result.plan[0].time).toBe('18:30');
    expect(result.groceryChecked).toEqual(['beef']);
    expect(result.settings.weekStartDay).toBe('monday');
    expect(result.settings.defaultSlotTimes.dinner).toBe('18:00');
  });

  it('creates data directory if it does not exist', async () => {
    await writeMealData({
      savedMeals: [],
      plan: [],
      groceryChecked: [],
      settings: { enabledSlots: ['breakfast', 'lunch', 'dinner'], weekStartDay: 'sunday', defaultSlotTimes: {}, timeFormat: '12h' },
    });
    const stat = await fs.stat(path.join(tmpDir, 'data'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('backfills settings on a legacy meals.json that has no settings field', async () => {
    const mealsDir = path.join(tmpDir, 'data');
    await fs.mkdir(mealsDir, { recursive: true });
    // Pre-existing file with no settings (the shape before this feature shipped)
    await fs.writeFile(path.join(mealsDir, 'meals.json'), JSON.stringify({
      savedMeals: [{ id: 'm1', name: 'Soup' }],
      plan: [{ date: '2026-04-01', slot: 'lunch', mealId: 'm1' }],
      groceryChecked: [],
    }));

    const data = await readMealData();
    expect(data.settings).toBeDefined();
    expect(data.settings.enabledSlots).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(data.settings.weekStartDay).toBe('sunday');
  });
});

describe('legacy meal-settings migration from data/config.json', () => {
  /**
   * On first read after upgrading, users who had customized `slots` or
   * `weekStartDay` on individual meal-planner module instances should have
   * those preferences pulled into the new shared MealSettings — instead of
   * silently reverting to defaults.
   */

  // Every config write in this block stamps the current schema version.
  // A version-less config makes readConfig kick off its fire-and-forget
  // migrate-on-boot persist, and that background write can land AFTER the
  // next test's writeFile below, resurrecting the previous test's config
  // (seen as a CI-only flake in the multi-display harvest test).
  async function writeLegacyConfig(modules: { type: string; config: Record<string, unknown> }[]) {
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'config.json'), JSON.stringify({
      version: getLatestSchemaVersion(),
      screens: [{
        id: 'screen1',
        name: 'Default',
        modules,
      }],
    }));
    // Create a meals.json without a settings block to trigger backfill
    await fs.writeFile(path.join(dataDir, 'meals.json'), JSON.stringify({
      savedMeals: [],
      plan: [],
      groceryChecked: [],
    }));
  }

  it('pulls weekStartDay from a single meal-planner module', async () => {
    await writeLegacyConfig([{
      type: 'meal-planner',
      config: { weekStartDay: 'monday', view: 'week' },
    }]);

    const data = await readMealData();
    expect(data.settings.weekStartDay).toBe('monday');
  });

  it('pulls slots from a single meal-planner module', async () => {
    await writeLegacyConfig([{
      type: 'meal-planner',
      config: { slots: ['breakfast', 'lunch', 'snack', 'dinner'], view: 'week' },
    }]);

    const data = await readMealData();
    expect(data.settings.enabledSlots).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
  });

  it('pulls both slots and weekStartDay together', async () => {
    await writeLegacyConfig([{
      type: 'meal-planner',
      config: {
        slots: ['breakfast', 'dinner'],
        weekStartDay: 'monday',
        view: 'week',
      },
    }]);

    const data = await readMealData();
    expect(data.settings.enabledSlots).toEqual(['breakfast', 'dinner']);
    expect(data.settings.weekStartDay).toBe('monday');
  });

  it('also reads from fullscreen-meal-planner modules', async () => {
    await writeLegacyConfig([{
      type: 'fullscreen-meal-planner',
      config: { weekStartDay: 'monday', slots: ['lunch', 'dinner'] },
    }]);

    const data = await readMealData();
    expect(data.settings.weekStartDay).toBe('monday');
    expect(data.settings.enabledSlots).toEqual(['lunch', 'dinner']);
  });

  /**
   * In multi-display mode `config.screens` is a frozen snapshot and every later
   * edit lands on `displays[*].screens`, so a meal-planner module can exist only
   * there. Missing it here loses the data outright — the client strips the legacy
   * embedded fields from the module config on mount regardless of whether the
   * server harvested them first.
   */
  it('harvests from a display-owned screen in multi-display mode', async () => {
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'config.json'), JSON.stringify({
      version: getLatestSchemaVersion(),
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [{
          id: 'screen1',
          name: 'Default',
          modules: [{
            type: 'meal-planner',
            config: {
              weekStartDay: 'monday',
              slots: ['breakfast', 'dinner'],
              savedMeals: [{ id: 'm1', name: 'Tacos' }],
            },
          }],
        }],
      }],
    }));
    await fs.writeFile(path.join(dataDir, 'meals.json'), JSON.stringify({
      savedMeals: [],
      plan: [],
      groceryChecked: [],
    }));

    const data = await readMealData();
    expect(data.settings.weekStartDay).toBe('monday');
    expect(data.settings.enabledSlots).toEqual(['breakfast', 'dinner']);
    expect(data.savedMeals.map((m) => m.name)).toEqual(['Tacos']);
  });

  it('takes the largest slot set when multiple modules disagree', async () => {
    await writeLegacyConfig([
      { type: 'meal-planner', config: { slots: ['breakfast', 'dinner'] } },
      { type: 'meal-planner', config: { slots: ['breakfast', 'lunch', 'snack', 'dinner'] } },
      { type: 'fullscreen-meal-planner', config: { slots: ['lunch', 'dinner'] } },
    ]);

    const data = await readMealData();
    // Largest set wins — most permissive, so we don't accidentally hide a slot
    expect(data.settings.enabledSlots).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
  });

  it('takes the first non-default weekStartDay when modules disagree', async () => {
    await writeLegacyConfig([
      { type: 'meal-planner', config: { weekStartDay: 'sunday' } },
      { type: 'meal-planner', config: { weekStartDay: 'monday' } },
    ]);

    const data = await readMealData();
    expect(data.settings.weekStartDay).toBe('monday');
  });

  it('falls back to defaults when meal-planner modules have no legacy fields', async () => {
    await writeLegacyConfig([{
      type: 'meal-planner',
      config: { view: 'week', accentColor: '#f59e0b' }, // no slots/weekStartDay
    }]);

    const data = await readMealData();
    expect(data.settings.enabledSlots).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(data.settings.weekStartDay).toBe('sunday');
  });

  it('falls back to defaults when there are no meal-planner modules at all', async () => {
    await writeLegacyConfig([{
      type: 'clock',
      config: { view: 'analog' },
    }]);

    const data = await readMealData();
    expect(data.settings.enabledSlots).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(data.settings.weekStartDay).toBe('sunday');
  });

  it('falls back to defaults when config.json is missing entirely', async () => {
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    // Only write meals.json — no config.json at all
    await fs.writeFile(path.join(dataDir, 'meals.json'), JSON.stringify({
      savedMeals: [],
      plan: [],
      groceryChecked: [],
    }));

    const data = await readMealData();
    expect(data.settings.enabledSlots).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(data.settings.weekStartDay).toBe('sunday');
  });

  it('does NOT re-run migration on subsequent reads', async () => {
    await writeLegacyConfig([{
      type: 'meal-planner',
      config: { weekStartDay: 'monday', slots: ['breakfast', 'dinner'] },
    }]);

    // First read — backfill happens
    const first = await readMealData();
    expect(first.settings.weekStartDay).toBe('monday');
    // Give the fire-and-forget write a moment to complete
    await new Promise((r) => setTimeout(r, 200));

    // Now mutate config.json — if migration ran again it would pick up the new value
    const dataDir = path.join(tmpDir, 'data');
    await fs.writeFile(path.join(dataDir, 'config.json'), JSON.stringify({
      version: getLatestSchemaVersion(),
      screens: [{
        id: 'screen1',
        modules: [{
          type: 'meal-planner',
          config: { weekStartDay: 'sunday', slots: ['breakfast'] },
        }],
      }],
    }));

    // Second read should still return the original migrated values, not re-pull from config.json
    const second = await readMealData();
    expect(second.settings.weekStartDay).toBe('monday');
    expect(second.settings.enabledSlots).toEqual(['breakfast', 'dinner']);
  });

  it('filters out invalid slot strings from legacy config', async () => {
    await writeLegacyConfig([{
      type: 'meal-planner',
      config: { slots: ['breakfast', 'brunch', 42, 'dinner'] },
    }]);

    const data = await readMealData();
    // Invalid entries dropped, valid ones preserved
    expect(data.settings.enabledSlots).toEqual(['breakfast', 'dinner']);
  });

  // ── Embedded savedMeals / plan harvesting ──
  //
  // Previously this migration lived client-side in MealPlannerConfigSection's
  // mount effect, which raced when multiple meal-planner modules mounted at
  // once — both would fetch existing, both would merge, and the second PUT
  // would clobber the first's contribution. Running the harvesting here,
  // inside the atomic read-modify-write path, makes the migration
  // single-shot and deterministic even with multiple modules.

  it('harvests embedded savedMeals from a single meal-planner module', async () => {
    await writeLegacyConfig([{
      type: 'meal-planner',
      config: {
        savedMeals: [
          { id: 'm1', name: 'Tacos', emoji: '🌮' },
          { id: 'm2', name: 'Pizza' },
        ],
      },
    }]);

    const data = await readMealData();
    expect(data.savedMeals).toHaveLength(2);
    expect(data.savedMeals.find((m) => m.id === 'm1')?.name).toBe('Tacos');
    expect(data.savedMeals.find((m) => m.id === 'm2')?.name).toBe('Pizza');
  });

  it('deduplicates embedded savedMeals by id across multiple modules', async () => {
    // Regression test for the concurrent-migration race: two modules with
    // overlapping embedded meal libraries used to fight over the merged
    // shape and one would lose. The server-side migration now dedupes by
    // id once, deterministically.
    await writeLegacyConfig([
      { type: 'meal-planner', config: { savedMeals: [{ id: 'm1', name: 'Tacos' }, { id: 'm2', name: 'Pizza' }] } },
      { type: 'fullscreen-meal-planner', config: { savedMeals: [{ id: 'm2', name: 'Pizza (duplicate)' }, { id: 'm3', name: 'Salad' }] } },
    ]);

    const data = await readMealData();
    expect(data.savedMeals.map((m) => m.id).sort()).toEqual(['m1', 'm2', 'm3']);
    // The first module wins on conflict (simpler than last-write-wins and
    // matches the "largest slot set" / "first non-default" conflict policy
    // used elsewhere in this migration).
    expect(data.savedMeals.find((m) => m.id === 'm2')?.name).toBe('Pizza');
  });

  it('harvests embedded plan entries and appends them to meals.json', async () => {
    await writeLegacyConfig([{
      type: 'meal-planner',
      config: {
        savedMeals: [{ id: 'm1', name: 'Tacos' }],
        plan: [
          { date: '2026-04-01', slot: 'dinner', mealId: 'm1' },
          { date: '2026-04-02', slot: 'lunch', customText: 'Leftovers' },
        ],
      },
    }]);

    const data = await readMealData();
    expect(data.plan).toHaveLength(2);
    expect(data.plan[0].mealId).toBe('m1');
    expect(data.plan[1].customText).toBe('Leftovers');
  });

  it('migrates day-based legacy plan entries to ISO dates during harvest', async () => {
    // Legacy per-module configs had `day: 0..6` instead of `date: 'YYYY-MM-DD'`.
    // The harvest must run these through migrateLegacyPlan so downstream code
    // never sees the day-based shape.
    await writeLegacyConfig([{
      type: 'meal-planner',
      config: {
        savedMeals: [{ id: 'm1', name: 'Tacos' }],
        plan: [
          { day: 1, slot: 'dinner', mealId: 'm1' },
        ],
      },
    }]);

    const data = await readMealData();
    expect(data.plan).toHaveLength(1);
    // `date` is set, `day` is gone
    expect(typeof data.plan[0].date).toBe('string');
    expect(data.plan[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect('day' in data.plan[0]).toBe(false);
  });

  it('skips embedded-meals harvest on subsequent reads (one-shot)', async () => {
    await writeLegacyConfig([{
      type: 'meal-planner',
      config: {
        savedMeals: [{ id: 'm1', name: 'Tacos' }],
        plan: [{ date: '2026-04-01', slot: 'dinner', mealId: 'm1' }],
      },
    }]);

    // First read triggers harvest + write-through
    const first = await readMealData();
    expect(first.savedMeals).toHaveLength(1);
    // Give the fire-and-forget migration write a moment to land
    await new Promise((r) => setTimeout(r, 200));

    // Now bolt new embedded meals onto config.json — if migration re-ran,
    // these would get pulled in. They must NOT appear on the next read.
    const dataDir = path.join(tmpDir, 'data');
    await fs.writeFile(path.join(dataDir, 'config.json'), JSON.stringify({
      version: getLatestSchemaVersion(),
      screens: [{
        id: 'screen1',
        modules: [{
          type: 'meal-planner',
          config: {
            savedMeals: [{ id: 'm2', name: 'Should not appear' }],
          },
        }],
      }],
    }));

    const second = await readMealData();
    expect(second.savedMeals.map((m) => m.id)).toEqual(['m1']); // only the originally migrated one
  });
});

/** Raw on-disk meals.json contents, for asserting what a migration persisted. */
async function readMealFileRaw(): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(path.join(tmpDir, 'data', 'meals.json'), 'utf-8');
  return JSON.parse(raw);
}

describe('legacy timeFormat strip migration', () => {
  it('strips a stored 12h and persists the marker', async () => {
    const mealsDir = path.join(tmpDir, 'data');
    await fs.mkdir(mealsDir, { recursive: true });
    await fs.writeFile(path.join(mealsDir, 'meals.json'), JSON.stringify({
      savedMeals: [], plan: [], groceryChecked: [], settings: { timeFormat: '12h' },
    }));

    const data = await readMealData();
    expect(data.settings.timeFormat).toBeUndefined();
    // The write-through is fire-and-forget; give it a moment to land before
    // reading the raw file (same pattern as the migration tests above).
    await new Promise((r) => setTimeout(r, 200));
    const onDisk = await readMealFileRaw();
    expect((onDisk.settings as Record<string, unknown>).timeFormat).toBeUndefined();
    expect(onDisk.timeFormatLegacyStripped).toBe(true);
  });

  it('keeps a stored 24h as an explicit override', async () => {
    const mealsDir = path.join(tmpDir, 'data');
    await fs.mkdir(mealsDir, { recursive: true });
    await fs.writeFile(path.join(mealsDir, 'meals.json'), JSON.stringify({
      savedMeals: [], plan: [], groceryChecked: [], settings: { timeFormat: '24h' },
    }));

    const data = await readMealData();
    expect(data.settings.timeFormat).toBe('24h');
    await new Promise((r) => setTimeout(r, 200));
    expect((await readMealFileRaw()).timeFormatLegacyStripped).toBe(true);
  });

  it('never strips a fresh explicit 12h once the marker is set', async () => {
    const mealsDir = path.join(tmpDir, 'data');
    await fs.mkdir(mealsDir, { recursive: true });
    await fs.writeFile(path.join(mealsDir, 'meals.json'), JSON.stringify({
      savedMeals: [], plan: [], groceryChecked: [], settings: { timeFormat: '12h' },
      timeFormatLegacyStripped: true,
    }));

    const data = await readMealData();
    expect(data.settings.timeFormat).toBe('12h');
  });

  it('re-stamps the marker on a fresh-literal write, so a deliberate 12h survives the next read', async () => {
    // Regression guard for updateMealData's marker stamp: mutators that build
    // a fresh object (the PUT route's field-level literal shape) don't carry
    // timeFormatLegacyStripped. Without the stamp the file would land
    // marker-less, and the NEXT read would treat this explicit '12h' as the
    // legacy default and strip it.
    const mealsDir = path.join(tmpDir, 'data');
    await fs.mkdir(mealsDir, { recursive: true });
    await fs.writeFile(path.join(mealsDir, 'meals.json'), JSON.stringify({
      savedMeals: [], plan: [], groceryChecked: [], settings: { timeFormat: '12h' },
      timeFormatLegacyStripped: true,
    }));

    await updateMealData(() => ({
      savedMeals: [],
      plan: [],
      groceryChecked: [],
      settings: {
        enabledSlots: ['breakfast', 'lunch', 'dinner'],
        weekStartDay: 'sunday',
        defaultSlotTimes: {},
        timeFormat: '12h',
      },
    }));

    // updateMealData resolves only after its write lands, so the follow-up
    // read (and the raw-file check) are deterministic — no settle wait needed.
    const data = await readMealData();
    expect(data.settings.timeFormat).toBe('12h');
    expect((await readMealFileRaw()).timeFormatLegacyStripped).toBe(true);
  });
});

describe('prunePlan', () => {
  it('removes entries older than 12 weeks', () => {
    const old = new Date();
    old.setDate(old.getDate() - 13 * 7); // 13 weeks ago
    const oldDate = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, '0')}-${String(old.getDate()).padStart(2, '0')}`;
    const recent = new Date();
    const recentDate = `${recent.getFullYear()}-${String(recent.getMonth() + 1).padStart(2, '0')}-${String(recent.getDate()).padStart(2, '0')}`;

    const plan = [
      { date: oldDate, slot: 'breakfast' as const, mealId: 'old' },
      { date: recentDate, slot: 'dinner' as const, mealId: 'new' },
    ];

    const pruned = prunePlan(plan);
    expect(pruned).toHaveLength(1);
    expect(pruned[0].mealId).toBe('new');
  });

  it('preserves the per-meal time field on planned entries', () => {
    const recent = new Date();
    const recentDate = `${recent.getFullYear()}-${String(recent.getMonth() + 1).padStart(2, '0')}-${String(recent.getDate()).padStart(2, '0')}`;
    const plan = [
      { date: recentDate, slot: 'dinner' as const, mealId: 'a', time: '18:30' },
    ];
    const pruned = prunePlan(plan);
    expect(pruned[0].time).toBe('18:30');
  });

  it('keeps all entries within 12 weeks', () => {
    const recent = new Date();
    const recentDate = `${recent.getFullYear()}-${String(recent.getMonth() + 1).padStart(2, '0')}-${String(recent.getDate()).padStart(2, '0')}`;

    const plan = [
      { date: recentDate, slot: 'breakfast' as const, mealId: 'a' },
      { date: recentDate, slot: 'dinner' as const, mealId: 'b' },
    ];

    expect(prunePlan(plan)).toHaveLength(2);
  });
});
