import { describe, it, expect } from 'vitest';
import collection from '../art-collection.json';
import turnedDown from '../../../../scripts/generate/art-collection-turned-down.json';
import { TITLE_WORDS } from '../art-safety';
import { ART_GENRES } from '@/lib/photo-source';
import { ART_MIN_SHORT_SIDE } from '@/lib/art-fit';

/**
 * The shipped collection is the only thing a wall draws paintings from, so a
 * refresh (`scripts/generate/build-art-collection.mts`) must not let through a row the
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
      const [id, file, title, artist, year, museum, width, height, genre, famous] = row;
      // A tenth entry marks a famous painting that is also one of the four subjects.
      expect(row.length === 9 || (row.length === 10 && famous === 1 && genre !== 'famous'), `${id} has a malformed famous mark`).toBe(true);
      expect(id).toMatch(/^Q\d+$/);
      expect(ids.has(id as string), `${id} is listed twice`).toBe(false);
      ids.add(id as string);
      expect(file).toMatch(/\.(jpe?g|png|webp)$/i);
      expect(typeof title === 'string' && title.length > 0 && typeof artist === 'string' && artist.length > 0).toBe(true);
      expect(year === null || (Number.isInteger(year) && (year as number) > 0)).toBe(true);
      expect(museum === null || (typeof museum === 'string' && museum.length > 0)).toBe(true);
      expect(Math.min(width as number, height as number)).toBeGreaterThanOrEqual(ART_MIN_SHORT_SIDE);
      expect(ART_GENRES).toContain(genre);
    }
  });

  it('has a famous set of a few hundred, some of them landscapes or still lifes as well', () => {
    const famous = rows.filter((row) => row[8] === 'famous' || row[9] === 1);
    expect(famous.length).toBeGreaterThan(200);
    expect(famous.some((row) => row[8] !== 'famous')).toBe(true);
  });

  it('has no painting that was turned down, and none named like something to leave out', () => {
    const down = new Set(Object.keys(turnedDown));
    for (const [id, , title] of rows as Array<[string, string, string]>) {
      expect(down.has(id), `${id} was turned down`).toBe(false);
      expect(TITLE_WORDS.test(title), `${id} "${title}"`).toBe(false);
    }
  });
});
