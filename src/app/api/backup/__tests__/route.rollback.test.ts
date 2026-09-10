import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', async (original) => ({
  ...await original<typeof import('@/lib/auth')>(),
  requireSession: vi.fn(), requireDisplayAuth: vi.fn(), isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
import { POST } from '../route';
import { readFamilyData } from '@/lib/family-data';
import { getLatestSchemaVersion } from '@/lib/migrations';

const iso = '2026-01-01T00:00:00.000Z';
const member = { id: 'alex', name: 'Alex', color: '#60a5fa', createdAt: iso, updatedAt: iso };
const config = { version: getLatestSchemaVersion(), settings: {}, screens: [{ id: 'before', name: 'Before', modules: [] }] };
const files = ['config.json', 'family.json', 'chores.json', 'chore-completions.json', 'rewards.json', 'meals.json', 'todos.json', 'secrets.json', 'google-tokens.json'];
const write = (file: string, value: unknown) => fs.writeFile(path.join(process.cwd(), 'data', file), JSON.stringify(value, null, 2));
const read = (file: string) => fs.readFile(path.join(process.cwd(), 'data', file), 'utf8');
const body = () => ({
  _type: 'home-screens-backup', config: { ...config, screens: [{ id: 'after', name: 'After', modules: [] }] },
  family: { members: [{ ...member, name: 'Alex restored' }], migrated: true },
  chores: { chores: [] }, choreCompletions: { completions: [] },
  rewards: { rewards: [], balances: { alex: 20 }, redemptions: [] },
  meals: { savedMeals: [], plan: [], groceryChecked: [], settings: {} },
});
const request = (value: unknown) => new NextRequest('http://localhost/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
const credentialBody = () => ({ ...body(), credentials: { encrypted: false, data: { secrets: { openweathermap_key: 'new-key' }, oauthTokens: { google: { access_token: 'new-token' } } } } });
let before: string[];
beforeEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(path.join(process.cwd(), 'data'), { recursive: true, force: true });
  await fs.mkdir(path.join(process.cwd(), 'data'));
  await write('config.json', config);
  await write('family.json', { members: [member], migrated: true });
  await write('chores.json', { chores: [] });
  await write('chore-completions.json', { completions: [] });
  await write('rewards.json', { rewards: [], balances: { alex: 5 }, redemptions: [] });
  await write('meals.json', { savedMeals: [], plan: [], groceryChecked: [], settings: {} });
  await write('todos.json', { lists: [], migratedFromConfig: true });
  await write('secrets.json', { openweathermap_key: 'old-key' });
  await write('google-tokens.json', { access_token: 'old-token' });
  await readFamilyData();
  before = await Promise.all(files.map(read));
});
afterEach(() => vi.restoreAllMocks());
function failOnceAt(file: string) {
  const rename = fs.rename.bind(fs);
  let failed = false;
  const writes: string[] = [];
  vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    writes.push(path.basename(String(to)));
    if (!failed && String(to) === path.join(process.cwd(), 'data', file)) {
      failed = true; throw new Error('simulated disk failure');
    }
    return rename(from, to);
  });
  return writes;
}
async function expectRollback() {
  expect(await Promise.all(files.map(read))).toEqual(before);
  await expect(fs.access(path.join(process.cwd(), 'data/family-transaction.json'))).rejects.toThrow();
}

describe('whole restore journal', () => {
  it('rolls every landed content file back when a later write fails', async () => {
    failOnceAt('rewards.json');
    expect((await POST(request(body()))).status).toBe(500);
    await expectRollback();
  });
  it('preserves all originals when the first destination write fails', async () => {
    failOnceAt('family.json');
    expect((await POST(request(body()))).status).toBe(500);
    await expectRollback();
  });
  it('commits all content and reports the restored sections', async () => {
    const response = await POST(request(body()));
    expect(response.status).toBe(200);
    expect((await response.json()).restored.family).toBe(true);
    expect(JSON.parse(await read('config.json')).screens[0].id).toBe('after');
    expect(JSON.parse(await read('rewards.json')).balances.alex).toBe(20);
    expect(JSON.parse(await read('family.json')).members[0].name).toBe('Alex restored');
  });
  it('plans credentials and publishes them after content', async () => {
    const writes = failOnceAt('never-written.json');
    const response = await POST(request(credentialBody()));
    expect(response.status).toBe(200);
    expect(writes.indexOf('secrets.json')).toBeGreaterThan(writes.indexOf('rewards.json'));
    expect(JSON.parse(await read('secrets.json')).openweathermap_key).toBe('new-key');
    expect((await response.json()).credentials.applied).toEqual(['secrets', 'oauthTokens']);
  });
  it('rolls credentials and content back after a partial credential write', async () => {
    failOnceAt('google-tokens.json');
    expect((await POST(request(credentialBody()))).status).toBe(500);
    await expectRollback();
  });
  it('never publishes new credentials when an earlier content write fails', async () => {
    const writes = failOnceAt('rewards.json');
    expect((await POST(request(credentialBody()))).status).toBe(500);
    // Rollback may rewrite old credential images, but no new value survives.
    expect(writes.indexOf('secrets.json')).toBeGreaterThan(writes.indexOf('rewards.json'));
    await expectRollback();
  });
  it('does not touch absent credential sections', async () => {
    expect((await POST(request(body()))).status).toBe(200);
    expect(await read('secrets.json')).toBe(before[7]);
    expect(await read('google-tokens.json')).toBe(before[8]);
  });
  it('rolls config and lists back if a legacy config fold cannot publish', async () => {
    const legacy = { ...config, screens: [{ id: 'legacy', name: 'Legacy', modules: [{ id: 'todo', type: 'todo', config: { title: 'Shopping', items: [{ id: 'milk', text: 'Milk', completed: false }] } }] }] };
    failOnceAt('todos.json');
    expect((await POST(request(legacy))).status).toBe(500);
    await expectRollback();
  });
  it('rejects malformed restored family data before changing files', async () => {
    const response = await POST(request({ ...body(), family: { members: [{ id: 'bad' }] } }));
    expect(response.status).toBe(400);
    await expectRollback();
  });
});
