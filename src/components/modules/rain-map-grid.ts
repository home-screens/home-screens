/**
 * Slippy-map tile geometry for the rain map, sized to the box it renders in.
 *
 * Both layers (OpenStreetMap base, radar) place tiles relative to the box
 * centre, which sits exactly on the configured coordinates. Only tiles that
 * intersect the box are returned, so a 500px module asks for 4 radar tiles
 * where a fixed 5x5 grid asked for 25. An unmeasured box (0 x 0, the server
 * render and the instant before the first layout) yields no tiles at all, so
 * nothing is requested for a size nobody has seen.
 */

export const BASE_TILE_SIZE = 256;
/**
 * Radar tiles are fetched at 512px one zoom level below the map: the same
 * ground per pixel as a 2x2 block of 256px tiles at the map's zoom, in a
 * quarter of the requests. LibreWXR serves 512px at every zoom from 0 up.
 */
export const RADAR_TILE_SIZE = 512;

export interface TileGridBox {
  width: number;
  height: number;
}

export interface GridTile {
  /** Tile column, wrapped into [0, 2^zoom) so the URL is always valid. */
  x: number;
  /** Tile row; rows above or below the map are dropped, never clamped. */
  y: number;
  /** Top-left corner in px relative to the box centre (negative = left/up). */
  left: number;
  top: number;
}

function lon2tile(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * Math.pow(2, zoom);
}

function lat2tile(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    Math.pow(2, zoom)
  );
}

/**
 * Tile indices whose span intersects [centre - half, centre + half], where
 * `centre` is the fractional tile coordinate and `half` is in tiles. A tile
 * `i` covers [i, i + 1), so it is in when i + 1 > centre - half and
 * i < centre + half. A box edge that lands exactly on a tile edge does not
 * pull in the tile beyond it.
 */
function tileRange(centre: number, half: number): number[] {
  const first = Math.floor(centre - half);
  const last = Math.ceil(centre + half) - 1;
  const out: number[] = [];
  for (let i = first; i <= last; i++) out.push(i);
  return out;
}

export function computeTileGrid(
  lat: number,
  lon: number,
  zoom: number,
  tileSize: number,
  box: TileGridBox,
): GridTile[] {
  if (box.width <= 0 || box.height <= 0) return [];
  const n = Math.pow(2, zoom);
  const centreX = lon2tile(lon, zoom);
  const centreY = lat2tile(lat, zoom);
  const halfX = box.width / 2 / tileSize;
  const halfY = box.height / 2 / tileSize;

  const tiles: GridTile[] = [];
  for (const row of tileRange(centreY, halfY)) {
    if (row < 0 || row >= n) continue;
    for (const col of tileRange(centreX, halfX)) {
      tiles.push({
        x: ((col % n) + n) % n,
        y: row,
        left: (col - centreX) * tileSize,
        top: (row - centreY) * tileSize,
      });
    }
  }
  return tiles;
}
