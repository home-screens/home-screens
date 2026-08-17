/**
 * Shared hex → RGB parsing. Calendar colors arrive from several producers
 * (Google Calendar, iCal config swatches, Apple CalDAV) in 3-, 6-, or
 * 8-digit hex; every consumer that needs channel values goes through this
 * one parser so format handling can't drift between call sites. Returns
 * `null` for anything unparseable (named colors, junk) — callers pick
 * their own fallback.
 */
export function parseHexToRgb(color: string): [number, number, number] | null {
  let hex = color.startsWith('#') ? color.slice(1) : color;
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  // 8-digit #rrggbbaa: ignore the alpha channel.
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return null;
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}
