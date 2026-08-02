/**
 * Wire-format types for `/api/rain-map` (a pass-through of RainViewer's
 * weather-maps.json). Shared between the server route and the RainMap module
 * so a field added on one side doesn't go silently unconsumed on the other.
 */

export interface RainFrame {
  time: number;
  path: string;
}

export interface RainViewerResponse {
  version: string;
  generated: number;
  host: string;
  radar: {
    past: RainFrame[];
    nowcast: RainFrame[];
  };
  satellite: {
    infrared: RainFrame[];
  };
}
