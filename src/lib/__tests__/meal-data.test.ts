import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { MealData } from '../meal-data';
import { readMealData, writeMealData, prunePlan } from '../meal-data';

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
    expect(data).toEqual({
      savedMeals: [],
      plan: [],
      groceryChecked: [],
    });
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
      plan: [{ date: '2026-04-01', slot: 'dinner', mealId: 'm1' }],
      groceryChecked: ['beef'],
    };

    await writeMealData(data);
    const result = await readMealData();
    expect(result.savedMeals[0].name).toBe('Tacos');
    expect(result.plan[0].mealId).toBe('m1');
    expect(result.plan[0].date).toBe('2026-04-01');
    expect(result.groceryChecked).toEqual(['beef']);
  });

  it('creates data directory if it does not exist', async () => {
    await writeMealData({ savedMeals: [], plan: [], groceryChecked: [] });
    const stat = await fs.stat(path.join(tmpDir, 'data'));
    expect(stat.isDirectory()).toBe(true);
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
