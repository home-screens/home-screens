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

import { DELETE, PATCH } from '../route';
import { CUSTOM_ICON_DIR, addCustomIcon, readCustomIcons, updateCustomIcon } from '@/lib/custom-icon-data';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  await fs.rm(path.join(process.cwd(), CUSTOM_ICON_DIR), { recursive: true, force: true });
});

async function seed() {
  const { icon } = await addCustomIcon(await sharp({ create: { width: 32, height: 32, channels: 3, background: '#f00' } }).png().toBuffer(), 'Pizza');
  return updateCustomIcon(icon.id, { keep: true });
}

function patch(id: string, body: unknown) {
  return PATCH(new NextRequest(`http://localhost/api/custom-icons/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), ctx(id));
}

describe('/api/custom-icons/[id]', () => {
  it('renames an icon', async () => {
    const icon = await seed();
    const req = new NextRequest(`http://localhost/api/custom-icons/${icon.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Pizza night' }),
    });
    const res = await PATCH(req, ctx(icon.id));
    expect(res.status).toBe(200);
    expect((await res.json()).icon).toMatchObject({ id: icon.id, name: 'Pizza night', url: expect.stringContaining(icon.hash) });
  });

  it('keeps a pending upload, which puts it in the list', async () => {
    const { icon } = await addCustomIcon(await sharp({ create: { width: 30, height: 30, channels: 3, background: '#0f0' } }).png().toBuffer(), 'IMG 4821');
    expect(await readCustomIcons()).toEqual([]);
    const res = await patch(icon.id, { keep: true, name: 'Lasagna' });
    expect(res.status).toBe(200);
    expect((await readCustomIcons()).map((i) => i.name)).toEqual(['Lasagna']);
  });

  it('crops a pending banner to a square', async () => {
    const { icon } = await addCustomIcon(await sharp({ create: { width: 900, height: 200, channels: 3, background: '#00f' } }).png().toBuffer(), 'Banner');
    const res = await patch(icon.id, { crop: 'square' });
    expect(res.status).toBe(200);
    const { icon: cropped } = await res.json();
    // The centre of the full-size original, not of the 512x114 icon.
    expect([cropped.width, cropped.height]).toEqual([200, 200]);
  });

  it('refuses an empty name', async () => {
    const icon = await seed();
    const req = new NextRequest(`http://localhost/api/custom-icons/${icon.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  ' }),
    });
    const res = await PATCH(req, ctx(icon.id));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'bad-name' });
  });

  it('removes an icon, and answers 404 the second time', async () => {
    const icon = await seed();
    const del = () => DELETE(new NextRequest(`http://localhost/api/custom-icons/${icon.id}`, { method: 'DELETE' }), ctx(icon.id));
    expect((await del()).status).toBe(200);
    expect(await readCustomIcons()).toEqual([]);
    const again = await del();
    expect(again.status).toBe(404);
    expect(await again.json()).toMatchObject({ code: 'not-found' });
  });

  it('hands back the new config revision when the removal rewrote the config', async () => {
    const icon = await seed();
    const { readConfig, configRevision } = await import('@/lib/config');
    const data = path.join(process.cwd(), 'data');
    const config = JSON.parse(await fs.readFile(path.join(data, 'config.json'), 'utf8').catch(() => '{"settings":{},"screens":[]}'));
    config.screens = [{ id: 's', name: 'S', modules: [{ id: 't', type: 'text', config: { icon: `custom:${icon.id}`, content: 'Hi' } }] }];
    await fs.writeFile(path.join(data, 'config.json'), JSON.stringify(config));
    const res = await DELETE(new NextRequest(`http://localhost/api/custom-icons/${icon.id}`, { method: 'DELETE' }), ctx(icon.id));
    const body = await res.json();
    expect(body.configRevision).toBe(configRevision(await readConfig()));
    expect((await readConfig()).screens[0].modules[0].config).not.toHaveProperty('icon');
  });
});
