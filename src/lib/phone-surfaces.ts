/**
 * The two phone surfaces Home Screens serves on the LAN, and the contexts the
 * editor advertises them from.
 *
 * They are genuinely different products and the editor must not conflate them:
 * `/chores` is ungated (see `isProtectedRoute` in `src/proxy.ts`) and renders
 * `ChoresTab` with `isAdmin=false`, so a kid gets today + rewards and cannot
 * add, edit, or backdate anything. `/remote` is password-protectable and owns
 * every management tab. A chore chart therefore needs BOTH advertised — a
 * parent creates the chores on `/remote`, a kid ticks them off on `/chores` —
 * which is why `PHONE_CONTEXTS.chores` lists two surfaces and leads with the
 * kid one.
 */
export const PHONE_SURFACES = ['chores', 'remote'] as const;

export type PhoneSurface = (typeof PHONE_SURFACES)[number];

/** Path each surface is served on. Also the i18n key suffix for its copy. */
export const PHONE_SURFACE_PATHS: Record<PhoneSurface, string> = {
  chores: '/chores',
  remote: '/remote',
};

/**
 * Where in the editor a phone link is being shown. Drives which surfaces are
 * offered and which copy the chip carries — a chip in the photo module should
 * say "add photos", not name a URL.
 */
export const PHONE_CONTEXTS = ['chores', 'meals', 'photos'] as const;

export type PhoneContext = (typeof PHONE_CONTEXTS)[number];

/**
 * Surfaces offered per context, in display order. The first entry leads: it is
 * the visually emphasised card in the popover and the first chip in the list.
 */
export const SURFACES_BY_CONTEXT: Record<PhoneContext, readonly PhoneSurface[]> = {
  chores: ['chores', 'remote'],
  meals: ['remote'],
  photos: ['remote'],
};

/**
 * Absolute URL for a surface, given the origin the editor was reached on.
 *
 * The origin is the right base precisely because it is whatever address the
 * user typed to get here — a hostname, a `.local` name, or a LAN IP — so the
 * printed link works from the phone standing next to them. Returns the bare
 * path when the origin is not known yet (pre-mount; see `useOrigin`), which
 * still renders as a working same-origin link.
 */
export function phoneSurfaceUrl(surface: PhoneSurface, origin: string): string {
  return origin ? `${origin}${PHONE_SURFACE_PATHS[surface]}` : PHONE_SURFACE_PATHS[surface];
}

/**
 * The same URL with the scheme stripped, for display. These are LAN addresses
 * shown next to a QR code, where `http://` is noise that pushes the part that
 * matters (host and path) out of the available width.
 */
export function phoneSurfaceLabel(surface: PhoneSurface, origin: string): string {
  return phoneSurfaceUrl(surface, origin).replace(/^https?:\/\//, '');
}
