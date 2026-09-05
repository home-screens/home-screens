import { describe, it, expect } from 'vitest';
import { computeTileGrid, BASE_TILE_SIZE, RADAR_TILE_SIZE } from '../rain-map-grid';

// Prior Lake, MN: fractional tile coordinates at zoom 6 are x=15.39, y=23.12.
const LAT = 44.7126;
const LON = -93.4013;

describe('computeTileGrid', () => {
  it('returns no tiles for an unmeasured box', () => {
    expect(computeTileGrid(LAT, LON, 6, BASE_TILE_SIZE, { width: 0, height: 0 })).toEqual([]);
    expect(computeTileGrid(LAT, LON, 6, BASE_TILE_SIZE, { width: 500, height: 0 })).toEqual([]);
  });

  it('covers a 500px box with 3x3 base tiles and 2x2 radar tiles', () => {
    const base = computeTileGrid(LAT, LON, 6, BASE_TILE_SIZE, { width: 500, height: 500 });
    expect(base).toHaveLength(9);
    // Radar at zoom 5, 512px: half a box is 250px, under half a tile, so the
    // centre tile plus one neighbour per axis.
    const radar = computeTileGrid(LAT, LON, 5, RADAR_TILE_SIZE, { width: 500, height: 500 });
    expect(radar).toHaveLength(4);
  });

  it('covers a 1000x840 box with 9 radar tiles where a fixed 5x5 grid used 25', () => {
    const radar = computeTileGrid(LAT, LON, 5, RADAR_TILE_SIZE, { width: 1000, height: 840 });
    expect(radar).toHaveLength(9);
    const base = computeTileGrid(LAT, LON, 6, BASE_TILE_SIZE, { width: 1000, height: 840 });
    expect(base).toHaveLength(20); // 5 columns x 4 rows
  });

  it('places every tile so that its span actually intersects the box', () => {
    const box = { width: 700, height: 420 };
    for (const [zoom, size] of [[6, BASE_TILE_SIZE], [5, RADAR_TILE_SIZE]] as const) {
      const tiles = computeTileGrid(LAT, LON, zoom, size, box);
      for (const t of tiles) {
        expect(t.left).toBeLessThan(box.width / 2);
        expect(t.left + size).toBeGreaterThan(-box.width / 2);
        expect(t.top).toBeLessThan(box.height / 2);
        expect(t.top + size).toBeGreaterThan(-box.height / 2);
      }
      // And the box is fully covered: the tiles' union spans past both edges.
      expect(Math.min(...tiles.map((t) => t.left))).toBeLessThanOrEqual(-box.width / 2);
      expect(Math.max(...tiles.map((t) => t.left + size))).toBeGreaterThanOrEqual(box.width / 2);
      expect(Math.min(...tiles.map((t) => t.top))).toBeLessThanOrEqual(-box.height / 2);
      expect(Math.max(...tiles.map((t) => t.top + size))).toBeGreaterThanOrEqual(box.height / 2);
    }
  });

  it('keeps the same ground under 512px tiles one zoom down as under 256px tiles', () => {
    // A 512px tile at zoom 5 is the 2x2 block of 256px tiles at zoom 6 with
    // the same top-left, so its pixel offset from the centre matches the
    // offset of that block's top-left tile. The base grid is asked for a
    // larger box so every block the radar grid's edge tiles belong to is in it.
    const base = computeTileGrid(LAT, LON, 6, BASE_TILE_SIZE, { width: 2048, height: 2048 });
    const radar = computeTileGrid(LAT, LON, 5, RADAR_TILE_SIZE, { width: 1024, height: 1024 });
    for (const r of radar) {
      const topLeftOfBlock = base.find((b) => b.x === r.x * 2 && b.y === r.y * 2);
      expect(topLeftOfBlock, `block for radar tile ${r.x},${r.y}`).toBeDefined();
      expect(topLeftOfBlock!.left).toBeCloseTo(r.left, 6);
      expect(topLeftOfBlock!.top).toBeCloseTo(r.top, 6);
    }
  });

  it('wraps columns across the antimeridian and drops rows off the map', () => {
    // Zoom 1 has a 2x2 world; a wide box on the date line spans both columns
    // on both sides, and rows beyond the map are not requested.
    const tiles = computeTileGrid(85, 179.9, 1, BASE_TILE_SIZE, { width: 1200, height: 1200 });
    expect(tiles.every((t) => t.x === 0 || t.x === 1)).toBe(true);
    expect(tiles.every((t) => t.y === 0 || t.y === 1)).toBe(true);
    expect(tiles.some((t) => t.left > 0 && t.x === 0)).toBe(true); // column 2 wrapped to 0
  });
});
