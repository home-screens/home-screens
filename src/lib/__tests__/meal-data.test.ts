import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { readMealData, writeMealData } from '../meal-data';

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
      previousPlan: [],
      groceryChecked: [],
    });
  });

  it('reads a valid meals file', async () => {
    const mealsDir = path.join(tmpDir, 'data');
    await fs.mkdir(mealsDir, { recursive: true });
    const saved = {
      savedMeals: [{ id: 'm1', name: 'Pasta', ingredients: [], tags: [], prepTime: 30 }],
      plan: [{ day: 0, slot: 'dinner', mealId: 'm1' }],
      previousPlan: [],
      groceryChecked: ['tomatoes'],
    };
    await fs.writeFile(path.join(mealsDir, 'meals.json'), JSON.stringify(saved));

    const data = await readMealData();
    expect(data.savedMeals).toHaveLength(1);
    expect(data.savedMeals[0].name).toBe('Pasta');
    expect(data.plan).toHaveLength(1);
    expect(data.groceryChecked).toEqual(['tomatoes']);
  });

  it('normalizes missing fields to empty arrays (backward compat)', async () => {
    const mealsDir = path.join(tmpDir, 'data');
    await fs.mkdir(mealsDir, { recursive: true });
    // Old file format missing some fields
    await fs.writeFile(path.join(mealsDir, 'meals.json'), JSON.stringify({
      savedMeals: [{ id: 'm1', name: 'Soup' }],
      // plan, previousPlan, groceryChecked are missing
    }));

    const data = await readMealData();
    expect(data.savedMeals).toHaveLength(1);
    expect(data.plan).toEqual([]);
    expect(data.previousPlan).toEqual([]);
    expect(data.groceryChecked).toEqual([]);
  });

  it('handles non-array fields gracefully', async () => {
    const mealsDir = path.join(tmpDir, 'data');
    await fs.mkdir(mealsDir, { recursive: true });
    // Corrupt data where fields are wrong types
    await fs.writeFile(path.join(mealsDir, 'meals.json'), JSON.stringify({
      savedMeals: 'not-an-array',
      plan: 42,
      previousPlan: null,
      groceryChecked: { bad: true },
    }));

    const data = await readMealData();
    expect(data.savedMeals).toEqual([]);
    expect(data.plan).toEqual([]);
    expect(data.previousPlan).toEqual([]);
    expect(data.groceryChecked).toEqual([]);
  });

  it('throws on non-ENOENT errors (e.g., invalid JSON)', async () => {
    const mealsDir = path.join(tmpDir, 'data');
    await fs.mkdir(mealsDir, { recursive: true });
    await fs.writeFile(path.join(mealsDir, 'meals.json'), '{ invalid json !!!');

    await expect(readMealData()).rejects.toThrow();
  });
});

describe('writeMealData', () => {
  it('writes and round-trips meal data', async () => {
    const data = {
      savedMeals: [{ id: 'm1', name: 'Tacos', ingredients: ['beef', 'shells'], tags: ['mexican'], prepTime: 20 }],
      plan: [{ day: 1, slot: 'dinner' as const, mealId: 'm1' }],
      previousPlan: [],
      groceryChecked: ['beef'],
    };

    await writeMealData(data);
    const result = await readMealData();
    expect(result.savedMeals[0].name).toBe('Tacos');
    expect(result.plan[0].mealId).toBe('m1');
    expect(result.groceryChecked).toEqual(['beef']);
  });

  it('creates data directory if it does not exist', async () => {
    await writeMealData({ savedMeals: [], plan: [], previousPlan: [], groceryChecked: [] });
    const stat = await fs.stat(path.join(tmpDir, 'data'));
    expect(stat.isDirectory()).toBe(true);
  });
});
