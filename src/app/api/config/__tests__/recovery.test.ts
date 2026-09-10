import { beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { CONFIG_REVISION_HEADER } from '@/lib/config-revision';

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => {}), requireDisplayAuth: vi.fn(async () => {}) }));
vi.mock('@/lib/kiosk', () => ({ syncKioskConf: vi.fn(async () => {}), applyDisplaySettings: vi.fn(async () => {}) }));
vi.mock('@/lib/telemetry', () => ({ maybeSendBeacon: vi.fn(async () => {}) }));

import { PUT } from '../route';

const now = '2026-09-09T12:00:00.000Z';
const member = { id: 'alex', name: 'Alex', color: '#60a5fa', createdAt: now, updatedAt: now };
const file = (name: string) => path.join(process.cwd(), 'data', name);
const read = async (name: string) => JSON.parse(await fs.readFile(file(name), 'utf8'));
const request = (body: unknown) => new NextRequest('http://localhost/api/config', {
  method: 'PUT', headers: { 'Content-Type': 'application/json', [CONFIG_REVISION_HEADER]: 'old-editor-revision' }, body: JSON.stringify(body),
});

beforeEach(async () => {
  await fs.rm(file(''), { recursive: true, force: true });
  await fs.mkdir(file(''), { recursive: true });
  await fs.writeFile(file('config.json'), '{broken');
  await fs.writeFile(file('family.json'), JSON.stringify({ members: [member], migrated: true }));
  await fs.writeFile(file('chores.json'), JSON.stringify({ chores: [{ id: 'job', assigneeIds: ['alex'] }] }));
});

describe('repairing a broken config with the editor copy', () => {
  it.each([false, true])('journals a validated replacement and preserves family assignments (legacy=%s)', async (legacy) => {
    const calendar = legacy
      ? { people: [{ id: 'alex', name: 'Alex', color: '#60a5fa', sourceIds: ['school'] }] }
      : { personSources: { alex: ['school'] } };
    const response = await PUT(request({ version: 13, screens: [], settings: { calendar } }));
    expect(response.status).toBe(200);
    expect((await read('config.json')).settings.calendar).toEqual({ personSources: { alex: ['school'] } });
    expect((await read('family.json')).members).toEqual([member]);
    expect((await read('chores.json')).chores[0].assigneeIds).toEqual(['alex']);
    await expect(fs.access(file('family-transaction.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not use repair as a way around incoming-config validation', async () => {
    const response = await PUT(request({ screens: [], settings: { calendar: { personSources: { alex: 'invalid' } } } }));
    expect(response.status).toBe(400);
    expect(await fs.readFile(file('config.json'), 'utf8')).toBe('{broken');
    expect((await read('family.json')).members).toEqual([member]);
  });

  it('does not overwrite a pending journal even with a good editor copy', async () => {
    await fs.writeFile(file('family-transaction.json'), '{unreadable-journal');
    const response = await PUT(request({ screens: [], settings: {} }));
    expect(response.status).toBe(409);
    expect(await fs.readFile(file('config.json'), 'utf8')).toBe('{broken');
    expect(await fs.readFile(file('family-transaction.json'), 'utf8')).toBe('{unreadable-journal');
  });
});
