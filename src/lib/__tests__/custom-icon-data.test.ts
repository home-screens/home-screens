import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import {
  CUSTOM_ICON_DIR,
  addCustomIcon,
  customIconFilePath,
  deleteCustomIcon,
  normalizeIconImage,
  planCustomIconRestore,
  readCustomIconBackup,
  readCustomIcons,
  updateCustomIcon,
  cropCustomIconToSquare,
  sweepCustomIconFiles,
  verifyCustomIconBackup,
} from '@/lib/custom-icon-data';
import { commitDataTransaction, withDataTransaction } from '@/lib/data-transaction';
import { ICON_EDGE_PX, MAX_ICONS, MAX_UPLOAD_BYTES } from '@/lib/custom-icons';

const dir = () => path.join(process.cwd(), CUSTOM_ICON_DIR);

/** Upload and keep, as "Use this icon" does. */
async function addKept(input: Buffer, name: string) {
  const { icon } = await addCustomIcon(input, name);
  return updateCustomIcon(icon.id, { keep: true });
}

beforeEach(async () => {
  // The vitest sandbox's own data/ (see vitest.setup.ts), never the repo's.
  await fs.rm(dir(), { recursive: true, force: true });
});

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

/** A red square with a wide see-through margin. */
function stickerPng(size = 600, margin = 200): Promise<Buffer> {
  return sharp({ create: { width: size - margin * 2, height: size - margin * 2, channels: 4, background: '#e11d48' } })
    .extend({ top: margin, bottom: margin, left: margin, right: margin, background: transparent })
    .png()
    .toBuffer();
}

async function animatedGif(frames = 4, size = 900): Promise<Buffer> {
  const pages = await Promise.all(Array.from({ length: frames }, (_, i) =>
    sharp({ create: { width: size, height: size, channels: 4, background: { r: i * 60, g: 100, b: 200, alpha: 1 } } }).png().toBuffer()));
  return sharp(pages, { join: { animated: true } }).gif().toBuffer();
}

async function meta(data: Buffer) {
  return sharp(data, { animated: true }).metadata();
}

describe('normalizeIconImage', () => {
  it('trims a sticker margin, fits it inside the icon size and writes WebP', async () => {
    const out = await normalizeIconImage(await stickerPng(1400, 300));
    const m = await meta(out.data);
    expect(m.format).toBe('webp');
    expect(out.animated).toBe(false);
    // 800 px of colour, margin trimmed, then fit inside 512.
    expect(m.width).toBe(ICON_EDGE_PX);
    expect(m.height).toBe(ICON_EDGE_PX);
    expect(out.hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('never scales a small picture up', async () => {
    const small = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#0af' } }).jpeg().toBuffer();
    const m = await meta((await normalizeIconImage(small)).data);
    expect([m.width, m.height]).toEqual([40, 20]);
  });

  it('keeps every frame of a moving picture', async () => {
    const out = await normalizeIconImage(await animatedGif(4));
    const m = await meta(out.data);
    expect(out.animated).toBe(true);
    expect(m.format).toBe('webp');
    expect(m.pages).toBe(4);
    expect(m.width).toBe(ICON_EDGE_PX);
  });

  it('refuses SVG, which can carry script, and says why', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await expect(normalizeIconImage(svg)).rejects.toMatchObject({ code: 'svg-drawing', status: 400 });
  });

  it('refuses bytes that are not a picture at all', async () => {
    await expect(normalizeIconImage(Buffer.from('hello'))).rejects.toMatchObject({ code: 'not-a-picture' });
  });

  it('refuses a canvas too large to unpack before decoding it', async () => {
    const wide = await sharp({ create: { width: 5000, height: 10, channels: 3, background: '#fff' } }).png().toBuffer();
    await expect(normalizeIconImage(wide)).rejects.toMatchObject({ code: 'picture-too-large' });
  });

  it('refuses an upload over the size limit', async () => {
    await expect(normalizeIconImage(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).rejects.toMatchObject({ code: 'too-big', status: 413 });
  });
});

describe('the icon library', () => {
  it('adds, lists, renames and removes an icon, and its file with it', async () => {
    const icon = await addKept(await stickerPng(), 'Grandma lasagna');
    expect(icon.id).toMatch(/^[a-z2-7]{12}$/);
    expect(icon.bytes).toBeGreaterThan(0);
    const file = customIconFilePath(icon.hash)!;
    await expect(fs.stat(file)).resolves.toBeTruthy();
    expect(await readCustomIcons()).toEqual([icon]);

    const renamed = await updateCustomIcon(icon.id, { name: '  Nana   lasagna ' });
    expect(renamed.name).toBe('Nana lasagna');
    expect((await readCustomIcons())[0].name).toBe('Nana lasagna');

    await deleteCustomIcon(icon.id);
    expect(await readCustomIcons()).toEqual([]);
    await expect(fs.stat(file)).rejects.toThrow();
  });

  it('hands back the icon the library already has instead of a second copy', async () => {
    const png = await stickerPng();
    const first = await addKept(png, 'Taco');
    const again = await addCustomIcon(png, 'taco sticker');
    expect(again).toEqual({ icon: first, existing: true });
    expect(await readCustomIcons()).toHaveLength(1);
  });

  it('keeps a new upload out of every list until it is kept', async () => {
    const { icon, existing } = await addCustomIcon(await stickerPng(), 'Pending');
    expect(existing).toBe(false);
    expect(icon.pending).toBe(true);
    expect(await readCustomIcons()).toEqual([]);
    const kept = await updateCustomIcon(icon.id, { keep: true, name: 'Kept now' });
    expect(kept.pending).toBeUndefined();
    expect((await readCustomIcons()).map((i) => i.name)).toEqual(['Kept now']);
  });

  it('clears uploads nobody kept once they are an hour old', async () => {
    const { icon } = await addCustomIcon(await stickerPng(), 'Abandoned');
    const index = JSON.parse(await fs.readFile(path.join(dir(), 'index.json'), 'utf8'));
    index.icons[0].createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await fs.writeFile(path.join(dir(), 'index.json'), JSON.stringify(index));
    const other = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#00f' } }).png().toBuffer();
    await addCustomIcon(other, 'Next');
    const after = JSON.parse(await fs.readFile(path.join(dir(), 'index.json'), 'utf8'));
    expect(after.icons.map((i: { name: string }) => i.name)).toEqual(['Next']);
    await expect(fs.stat(customIconFilePath(icon.hash)!)).rejects.toThrow();
  });

  it('records the size of each picture for the review step\'s notes', async () => {
    const banner = await sharp({ create: { width: 2000, height: 300, channels: 3, background: '#1d4ed8' } }).png().toBuffer();
    const { icon } = await addCustomIcon(banner, 'Banner');
    expect([icon.width, icon.height]).toEqual([512, 77]);
    // The square is cut from the full-size original, not the shrunk banner.
    expect(icon.square).toMatchObject({ width: 300, height: 300 });
    const square = await cropCustomIconToSquare(icon.id);
    expect([square.width, square.height]).toEqual([300, 300]);
    expect(square.square).toBeUndefined();
    await expect(fs.stat(customIconFilePath(icon.hash)!)).rejects.toThrow();
    await expect(fs.stat(customIconFilePath(square.hash)!)).resolves.toBeTruthy();
  });

  it('puts everything that used a removed picture back to its standard icon', async () => {
    const icon = await addKept(await stickerPng(), 'Chili');
    const value = `custom:${icon.id}`;
    const data = path.join(process.cwd(), 'data');
    const write = (name: string, body: unknown) => fs.writeFile(path.join(data, name), JSON.stringify(body));
    const read = async (name: string) => JSON.parse(await fs.readFile(path.join(data, name), 'utf8'));
    await write('meals.json', { savedMeals: [{ id: 'm1', name: 'Chili', emoji: value }, { id: 'm2', name: 'Soup', emoji: '🍲' }], plan: [] });
    await write('chores.json', { chores: [{ id: 'c1', name: 'Stir', emoji: value }] });
    await write('rewards.json', { rewards: [{ id: 'r1', name: 'Bake', emoji: value }], balances: {}, redemptions: [] });
    await write('family.json', { members: [{ id: 'p1', name: 'Leo', color: '#fff', emoji: value }], migrated: true });
    await write('routines.json', { routines: [{ id: 'rt', name: 'Bed', icon: value, view: 'ring', steps: [{ id: 's', label: 'Teeth', icon: value, durationSec: 60 }] }] });
    const config = JSON.parse(await fs.readFile(path.join(data, 'config.json'), 'utf8').catch(() => '{"settings":{},"screens":[]}'));
    config.screens = [{ id: 's', name: 'S', modules: [{ id: 't', type: 'text', config: { icon: value, content: 'Hi' } }] }];
    await write('config.json', config);

    await deleteCustomIcon(icon.id);

    expect((await read('meals.json')).savedMeals.map((m: { emoji: string }) => m.emoji)).toEqual(['🍽️', '🍲']);
    expect((await read('chores.json')).chores[0].emoji).toBe('lucide:sparkles');
    expect((await read('rewards.json')).rewards[0].emoji).toBe('lucide:gift');
    expect((await read('family.json')).members[0]).not.toHaveProperty('emoji');
    const routine = (await read('routines.json')).routines[0];
    expect([routine.icon, routine.steps[0].icon]).toEqual(['⏱️', '⏱️']);
    const text = (await read('config.json')).screens[0].modules[0].config;
    expect(text).not.toHaveProperty('icon');
    expect(text.content).toBe('Hi');
  });

  it('refuses a crop that would take the library past its space', async () => {
    const banner = await sharp({ create: { width: 2000, height: 300, channels: 3, background: '#1d4ed8' } }).png().toBuffer();
    const { icon } = await addCustomIcon(banner, 'Banner');
    // Fill the rest of the budget so only the bigger square tips it over.
    const index = JSON.parse(await fs.readFile(path.join(dir(), 'index.json'), 'utf8'));
    const { LIBRARY_BUDGET_BYTES } = await import('@/lib/custom-icons');
    index.icons.push({ ...index.icons[0], id: 'filler000000', hash: 'f'.repeat(32), pending: false, square: undefined,
      bytes: LIBRARY_BUDGET_BYTES - index.icons[0].bytes });
    await fs.writeFile(path.join(dir(), 'index.json'), JSON.stringify(index));
    await expect(cropCustomIconToSquare(icon.id)).rejects.toMatchObject({ code: 'budget-full' });
  });

  it('says whether a removal rewrote the screen config', async () => {
    const icon = await addKept(await stickerPng(), 'Prefix');
    const data = path.join(process.cwd(), 'data');
    const config = JSON.parse(await fs.readFile(path.join(data, 'config.json'), 'utf8').catch(() => '{"settings":{},"screens":[]}'));
    config.screens = [{ id: 's', name: 'S', modules: [{ id: 't', type: 'text', config: { icon: `custom:${icon.id}` } }] }];
    await fs.writeFile(path.join(data, 'config.json'), JSON.stringify(config));
    expect(await deleteCustomIcon(icon.id)).toEqual({ configChanged: true });
    const other = await addKept(await sharp({ create: { width: 30, height: 30, channels: 3, background: '#0f0' } }).png().toBuffer(), 'Unused');
    expect(await deleteCustomIcon(other.id)).toEqual({ configChanged: false });
  });

  it('asks for a name', async () => {
    await expect(addCustomIcon(await stickerPng(), '   ')).rejects.toMatchObject({ code: 'bad-name' });
  });

  it('answers not-found for an id it does not have', async () => {
    await expect(updateCustomIcon('aaaaaaaaaaaa', { name: 'x' })).rejects.toMatchObject({ code: 'not-found', status: 404 });
    await expect(deleteCustomIcon('aaaaaaaaaaaa')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('refuses a new icon once the library holds the most it can', async () => {
    const now = new Date().toISOString();
    const icons = Array.from({ length: MAX_ICONS }, (_, i) => ({
      id: `a${String(i).padStart(11, 'a').replace(/[0-9]/g, 'b')}`.slice(0, 12),
      name: `Icon ${i}`, hash: 'f'.repeat(32), bytes: 10, animated: false, createdAt: now, updatedAt: now,
    }));
    await fs.mkdir(dir(), { recursive: true });
    await fs.writeFile(path.join(dir(), 'index.json'), JSON.stringify({ icons }));
    await expect(addCustomIcon(await stickerPng(), 'One more')).rejects.toMatchObject({ code: 'library-full', status: 409 });
    // Nothing unnamed is left behind by the refusal.
    expect((await fs.readdir(dir())).filter((n) => n.endsWith('.webp'))).toEqual([]);
  });

  it('sweeps picture files the index does not name, and stray temp files', async () => {
    const icon = await addKept(await stickerPng(), 'Kept');
    await fs.writeFile(path.join(dir(), `${'0'.repeat(32)}.webp`), 'orphan');
    await fs.writeFile(path.join(dir(), 'x.webp.123.tmp'), 'crash');
    await sweepCustomIconFiles();
    expect((await fs.readdir(dir())).sort()).toEqual([`${icon.hash}.webp`, 'index.json'].sort());
  });
});

describe('backup and restore', () => {
  it('round-trips the library through a backup section', async () => {
    const still = await addKept(await stickerPng(), 'Still');
    const moving = await addKept(await animatedGif(3, 200), 'Moving');
    const section = JSON.parse(JSON.stringify(await readCustomIconBackup()));
    expect(Object.keys(section.files).sort()).toEqual([still.hash, moving.hash].sort());

    await fs.rm(dir(), { recursive: true, force: true });
    const verified = await verifyCustomIconBackup(section);
    if (typeof verified === 'string') throw new Error(verified);
    await withDataTransaction(async () => {
      const change = await planCustomIconRestore(verified);
      await commitDataTransaction({ kind: 'test-restore', changes: change ? [change] : [] });
    });
    const restored = await readCustomIcons();
    expect(restored.map((icon) => [icon.id, icon.name, icon.animated])).toEqual([
      [still.id, 'Still', false],
      [moving.id, 'Moving', true],
    ]);
    expect(await fs.readFile(customIconFilePath(moving.hash)!)).toEqual(Buffer.from(section.files[moving.hash], 'base64'));
  });

  it('refuses a picture whose bytes do not match their hash', async () => {
    await addKept(await stickerPng(), 'Tampered');
    const section = await readCustomIconBackup();
    const hash = Object.keys(section.files)[0];
    section.files[hash] = Buffer.from('not the picture').toString('base64');
    expect(await verifyCustomIconBackup(section)).toMatch(/damaged/);
  });

  it('refuses a picture that is not the kind this store writes', async () => {
    const png = await stickerPng();
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update(png).digest('hex').slice(0, 32);
    const section = {
      icons: [{ id: 'abcdefghijkl', name: 'PNG', hash, bytes: png.length, animated: false }],
      files: { [hash]: png.toString('base64') },
    };
    expect(await verifyCustomIconBackup(section)).toMatch(/damaged/);
  });

  it('refuses a malformed section', async () => {
    expect(await verifyCustomIconBackup({ icons: 'nope' })).toMatch(/list/);
    expect(await verifyCustomIconBackup({ icons: [{ id: '../x', name: 'x', hash: 'h' }], files: {} })).toMatch(/id/);
  });
});
