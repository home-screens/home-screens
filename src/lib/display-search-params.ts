export type DisplaySearchParams = Record<string, string | string[] | undefined>;

/**
 * The two query parameters a display URL accepts, both written by the
 * editor's Preview button:
 *
 * - `screen=<id>` starts on that screen instead of the first one.
 * - `preview=1` holds rotation, ignores the sleep schedule, and keeps the tab
 *   out of the hub's command queue and status reports, so a preview window
 *   never shows up as a second "tab" of the real display.
 *
 * A kiosk opens `/display/<id>` with neither, so nothing changes for it.
 */
export function parseDisplaySearchParams(params: DisplaySearchParams): {
  initialScreenId?: string;
  preview?: boolean;
} {
  const screen = params.screen;
  const preview = params.preview;
  return {
    ...(typeof screen === 'string' && screen ? { initialScreenId: screen } : {}),
    ...(preview === '1' || preview === 'true' ? { preview: true } : {}),
  };
}
