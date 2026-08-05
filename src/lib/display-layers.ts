/**
 * Z-index stack for full-viewport kiosk overlays, all portaled to
 * document.body. Single source of truth — the layers only compose correctly
 * if every overlay draws from this map.
 *
 * Ordering rationale: module-level content overlays (event details, recipes)
 * must sit UNDER the sleep layer so a sleeping display still blacks out over
 * them, and under alerts so weather warnings always win. Screensaver and
 * alerts share a slot because they are never visible simultaneously (alerts
 * only render while active).
 */
export const DISPLAY_LAYERS = {
  /** Tap-opened module overlays: event details, recipe QR/iframe. */
  moduleOverlay: 9996,
  /** Sleep blackout + dim veil. */
  sleep: 9997,
  /** Ringing timer takeover. */
  timer: 9997,
  /** Weather alert takeover. */
  alert: 9998,
  /** Dimmed-state screensaver (clock). */
  screensaver: 9998,
} as const;
