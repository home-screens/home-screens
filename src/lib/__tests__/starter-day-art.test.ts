import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import path from 'path';
import { STARTER_DAY_ART, STARTER_DAY_ART_DIR, starterDayArtPath } from '../starter-day-art';

/** The day art that ships with Home Screens. Every catalog entry must have
 *  its committed file and every committed file its entry — the picker's
 *  thumbnails are the same files the wall renders, so they can't drift. */
describe('starter day art', () => {
  const dir = path.join(process.cwd(), STARTER_DAY_ART_DIR);

  it('every catalog entry has its svg file on disk', () => {
    const files = new Set(readdirSync(dir));
    for (const art of STARTER_DAY_ART) {
      expect(files, `missing ${art.file}`).toContain(art.file);
    }
  });

  it('no orphan files the catalog does not list', () => {
    const listed = new Set(STARTER_DAY_ART.map((a) => a.file));
    const orphans = readdirSync(dir).filter((f) => f.endsWith('.svg') && !listed.has(f));
    expect(orphans).toEqual([]);
  });

  it('every file is real svg with the shared viewBox', async () => {
    const { readFile } = await import('fs/promises');
    for (const art of STARTER_DAY_ART) {
      const src = await readFile(path.join(dir, art.file), 'utf8');
      expect(src.startsWith('<svg'), art.file).toBe(true);
      expect(src.includes("viewBox='0 0 120 80'"), art.file).toBe(true);
    }
  });

  it('starterDayArtPath resolves ids and rejects unknown ones', () => {
    expect(starterDayArtPath('celebrate')).toBe('/starter-day-art/celebrate.svg');
    expect(starterDayArtPath('nope')).toBeUndefined();
  });
});
