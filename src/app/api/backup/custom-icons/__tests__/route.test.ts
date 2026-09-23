import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
  getMediaTokenSecret: vi.fn(async () => null),
}));

import { GET } from '../route';
import { POST as restore } from '@/app/api/backup/route';
import { CUSTOM_ICON_DIR, addCustomIcon, readCustomIcons, updateCustomIcon } from '@/lib/custom-icon-data';

beforeEach(async () => {
  await fs.rm(path.join(process.cwd(), CUSTOM_ICON_DIR), { recursive: true, force: true });
});

async function seed(name: string, colour: string) {
  const { icon } = await addCustomIcon(await sharp({ create: { width: 48, height: 48, channels: 3, background: colour } }).png().toBuffer(), name);
  return updateCustomIcon(icon.id, { keep: true });
}

function restoreRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/backup/custom-icons', () => {
  it('summarises the library for the backup switch without sending pictures', async () => {
    const icon = await seed('Taco', '#fbbf24');
    const body = await (await GET(new NextRequest('http://localhost/api/backup/custom-icons?summary=1'))).json();
    expect(body).toEqual({ count: 1, bytes: icon.bytes });
  });

  it('exports every icon with its picture', async () => {
    const icon = await seed('Taco', '#fbbf24');
    const body = await (await GET(new NextRequest('http://localhost/api/backup/custom-icons'))).json();
    expect(body.icons.map((i: { id: string }) => i.id)).toEqual([icon.id]);
    expect(Object.keys(body.files)).toEqual([icon.hash]);
  });
});

describe('restoring icons with a backup', () => {
  it('replaces the library when the backup carries it', async () => {
    const kept = await seed('Kept', '#22c55e');
    const section = await (await GET(new NextRequest('http://localhost/api/backup/custom-icons'))).json();
    await seed('Added later', '#ef4444');

    const res = await restore(restoreRequest({ _type: 'home-screens-backup', _version: 2, customIcons: section }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.restored.customIcons).toBe(true);
    expect((await readCustomIcons()).map((i) => i.id)).toEqual([kept.id]);
    // The later icon's picture is swept once nothing names it.
    const files = (await fs.readdir(path.join(process.cwd(), CUSTOM_ICON_DIR))).filter((n) => n.endsWith('.webp'));
    expect(files).toEqual([`${kept.hash}.webp`]);
  });

  it('leaves the library alone when the backup has no icons, and counts what is missing', async () => {
    const here = await seed('Here', '#22c55e');
    const meals = {
      savedMeals: [
        { id: 'm1', name: 'Uses one we have', emoji: `custom:${here.id}` },
        { id: 'm2', name: 'Uses one we lack', emoji: 'custom:zzzzzzzzzzzz' },
      ],
      plan: [],
    };
    const res = await restore(restoreRequest({ _type: 'home-screens-backup', _version: 2, meals }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.restored.customIcons).toBe(false);
    expect(json.missingIcons).toBe(1);
    expect((await readCustomIcons()).map((i) => i.id)).toEqual([here.id]);
  });

  it('refuses a damaged icon section before writing anything', async () => {
    await seed('Here', '#22c55e');
    const res = await restore(restoreRequest({
      _type: 'home-screens-backup',
      _version: 2,
      customIcons: { icons: [{ id: 'abcdefghijkl', name: 'Bad', hash: 'f'.repeat(32) }], files: { ['f'.repeat(32)]: 'AAAA' } },
    }));
    expect(res.status).toBe(400);
    expect((await readCustomIcons()).map((i) => i.name)).toEqual(['Here']);
  });
});
