/**
 * Wire-format types for `/api/rain-map`: the frame index of a v2-compatible
 * radar server (LibreWXR by default; the format RainViewer introduced). Shared
 * between the server route and the RainMap module so a field added on one
 * side doesn't go silently unconsumed on the other.
 */

export interface RainFrame {
  time: number;
  path: string;
}

export interface RadarIndexResponse {
  version: string;
  generated: number;
  /** Tile server origin; the hub rewrites this to the configured radar server. */
  host: string;
  radar: {
    past: RainFrame[];
    nowcast: RainFrame[];
  };
  satellite: {
    infrared: RainFrame[];
  };
}
