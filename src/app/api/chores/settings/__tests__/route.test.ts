import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

import { PUT } from '../route';
import { GET as getChoreData } from '../../data/route';

let root: string;
const put = (file: string, data: unknown) => fs.writeFile(path.join(root, 'data', file), JSON.stringify(data, null, 2));
const read = async (file: string) => JSON.parse(await fs.readFile(path.join(root, 'data', file), 'utf8'));
const request = (body: unknown) => new NextRequest('http://localhost/api/chores/settings', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-chore-settings-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  await put('family.json', { members: [], migrated: true });
  await put('chores.json', { chores: [{ id: 'bed', name: 'Bed', assigneeIds: [] }] });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('PUT /api/chores/settings', () => {
  it('saves the settings beside the chores without touching them, and the chore data serves them', async () => {
    const before = await (await getChoreData(new NextRequest('http://localhost/api/chores/data'), undefined)).json();
    expect(before.settings).toEqual({ grabLimit: 1, grabHold: 'day' });

    const res = await PUT(request({ grabLimit: 0, grabHold: 'until-back' }), undefined);
    expect(res.status).toBe(200);
    expect(await read('chores.json')).toEqual({ chores: [{ id: 'bed', name: 'Bed', assigneeIds: [] }], settings: { grabLimit: 0, grabHold: 'until-back' } });

    const after = await (await getChoreData(new NextRequest('http://localhost/api/chores/data'), undefined)).json();
    expect(after.settings).toEqual({ grabLimit: 0, grabHold: 'until-back' });
    // The chore list did not change, so neither did the revision a chore save quotes.
    expect(after.revision).toBe(before.revision);
  });

  it('refuses a choice the settings do not offer', async () => {
    expect((await PUT(request({ grabLimit: 9, grabHold: 'day' }), undefined)).status).toBe(400);
  });
});
