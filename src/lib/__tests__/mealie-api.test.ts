import { describe, it, expect } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { MealieError } from '../mealie';
import { MealieMapError } from '../mealie-map';
import { MealieShoppingGoneError } from '../mealie-shopping';
import {
  mealieErrorResponse,
  mealiePlanMovedResponse,
  mealieShoppingResponse,
  parsePlanCells,
  parsePlanRange,
  withMealieErrors,
} from '../mealie-api';

describe('mealieErrorResponse', () => {
  it('answers a list or item gone from Mealie as gone, so a surface reads the list again', async () => {
    const list = mealieErrorResponse(new MealieShoppingGoneError('list'));
    expect(list.status).toBe(404);
    expect(await list.json()).toEqual({ error: "Mealie doesn't have that list any more.", reason: 'gone' });
    const item = mealieErrorResponse(new MealieShoppingGoneError());
    expect(await item.json()).toEqual({ error: "That isn't on the list any more.", reason: 'gone' });
  });

  it('says which Mealie problem it was, and refuses a meal Mealie cannot hold', async () => {
    const refused = mealieErrorResponse(new MealieError('key-rejected', 'Mealie did not accept the key', 401));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ failure: 'key-rejected' });
    expect(mealieErrorResponse(new MealieError('unreachable', 'down')).status).toBe(502);
    expect(mealieErrorResponse(new MealieMapError('A meal from the Home Screens library cannot go in a Mealie plan')).status).toBe(400);
  });

  it('leaves anything else to the route', () => {
    expect(() => mealieErrorResponse(new Error('disk full'))).toThrow('disk full');
  });
});

describe('withMealieErrors', () => {
  const req = new NextRequest('http://localhost/api/mealie/categories');

  it('answers a Mealie failure thrown anywhere in the handler', async () => {
    const handler = withMealieErrors(async () => {
      throw new MealieError('not-set-up', 'Mealie is not connected');
    });
    const res = await handler(req, undefined);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ failure: 'not-set-up' });
  });

  it('passes the answer and the route context through, and rethrows anything else', async () => {
    const handler = withMealieErrors(async (_request: NextRequest, ctx: { id: string }) => NextResponse.json({ id: ctx.id }));
    expect(await (await handler(req, { id: 'r1' })).json()).toEqual({ id: 'r1' });
    const broken = withMealieErrors(async () => {
      throw new Error('disk full');
    });
    await expect(broken(req, undefined)).rejects.toThrow('disk full');
  });
});

describe('mealieShoppingResponse', () => {
  it('answers a read with what goes beside it, and no copy at all with the saved address', async () => {
    const read = { status: 'ok' as const, lists: [], list: null, fetchedAt: 1, baseUrl: 'http://mealie.local' };
    expect(await mealieShoppingResponse(read, { added: 'new-1' }).json()).toEqual({ ...read, added: 'new-1' });
    const failed = mealieShoppingResponse({ status: 'failed', failure: 'unreachable', baseUrl: 'http://mealie.local' });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ failure: 'unreachable', baseUrl: 'http://mealie.local' });
  });
});

describe('parsePlanRange', () => {
  it('takes two real days at most sixteen weeks apart', () => {
    expect(parsePlanRange({ start: '2026-11-01', end: '2027-02-20' })).toEqual({ start: '2026-11-01', end: '2027-02-20' });
    expect(parsePlanRange({ start: '2026-11-01', end: '2026-11-01' })).toEqual({ start: '2026-11-01', end: '2026-11-01' });
  });

  it.each([
    ['a century', { start: '2000-01-01', end: '2099-12-31' }],
    ['one day past sixteen weeks', { start: '2026-11-01', end: '2027-02-21' }],
    ['backwards', { start: '2026-11-07', end: '2026-11-01' }],
    ['a day that does not exist', { start: '2026-02-30', end: '2026-03-02' }],
    ['not a date', { start: 'soon', end: '2026-11-01' }],
    ['missing', null],
  ])('refuses %s', (_name, raw) => {
    const range = parsePlanRange(raw);
    expect(range).toBeInstanceOf(NextResponse);
    expect((range as NextResponse).status).toBe(400);
  });
});

describe('parsePlanCells', () => {
  it('takes each meal as a day and a slot, with the rest of what was sent', () => {
    const cells = parsePlanCells([{ date: '2026-11-02', slot: 'dinner', before: [] }], 28);
    expect(cells).toEqual([{ date: '2026-11-02', slot: 'dinner', raw: { date: '2026-11-02', slot: 'dinner', before: [] } }]);
  });

  it.each([
    ['nothing', []],
    ['too many', Array.from({ length: 29 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, slot: 'dinner' }))],
    ['a slot that is not a meal', [{ date: '2026-11-02', slot: 'brunch' }]],
    ['a day that does not exist', [{ date: '2026-13-01', slot: 'dinner' }]],
    ['the same meal twice', [{ date: '2026-11-02', slot: 'dinner' }, { date: '2026-11-02', slot: 'dinner' }]],
    ['not a list', 'dinner'],
  ])('refuses %s', (_name, raw) => {
    const cells = parsePlanCells(raw, 28);
    expect(cells).toBeInstanceOf(NextResponse);
    expect((cells as NextResponse).status).toBe(400);
  });
});

describe('mealiePlanMovedResponse', () => {
  it('lets a write through while the plan lives in Mealie, and refuses it once it lives in Home Screens', async () => {
    expect(mealiePlanMovedResponse({ planSource: 'mealie' })).toBeNull();
    const moved = mealiePlanMovedResponse({ planSource: undefined });
    expect(moved?.status).toBe(409);
    expect(await moved?.json()).toMatchObject({ error: expect.stringContaining('Home Screens') });
  });
});
