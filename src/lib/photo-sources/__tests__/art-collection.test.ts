import { describe, it, expect } from 'vitest';
import collection from '../art-collection.json';
import turnedDown from '../../../../scripts/art-collection-turned-down.json';
import { SAFE_GENRES, TITLE_WORDS } from '../art-safety';

/**
 * The shipped collection is the only thing a wall draws paintings from, so a
 * refresh (`scripts/build-art-collection.mts`) must not let through a row the
 * adapter cannot show or the sieve was meant to stop.
 */
const rows = collection as unknown[][];

describe('the shipped art collection', () => {
  it('is big enough that a wall does not repeat itself for weeks', () => {
    expect(rows.length).toBeGreaterThan(2000);
  });

  it('holds one well-formed row per painting', () => {
    const ids = new Set<string>();
    for (const row of rows) {
      const [id, file, title, artist, year, museum, width, height, genre] = row;
      expect(row).toHaveLength(9);
      expect(id).toMatch(/^Q\d+$/);
      expect(ids.has(id as string), `${id} is listed twice`).toBe(false);
      ids.add(id as string);
      expect(file).toMatch(/\.(jpe?g|png|webp)$/i);
      expect(typeof title === 'string' && title.length > 0 && typeof artist === 'string' && artist.length > 0).toBe(true);
      expect(year === null || (Number.isInteger(year) && (year as number) > 0)).toBe(true);
      expect(museum === null || (typeof museum === 'string' && museum.length > 0)).toBe(true);
      expect(Math.min(width as number, height as number)).toBeGreaterThanOrEqual(1000);
      expect(Object.keys(SAFE_GENRES)).toContain(genre);
    }
  });

  it('has no painting that was turned down, and none named like something to leave out', () => {
    const down = new Set(Object.keys(turnedDown));
    for (const [id, , title] of rows as Array<[string, string, string]>) {
      expect(down.has(id), `${id} was turned down`).toBe(false);
      expect(TITLE_WORDS.test(title), `${id} "${title}"`).toBe(false);
    }
  });
});
