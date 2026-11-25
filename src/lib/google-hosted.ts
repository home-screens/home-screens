import type { HostedGoogleClient } from './google-token-store';

/**
 * Home Screens' own Google apps, so a household can connect Google without
 * creating a Google Cloud project of its own.
 *
 * On by default now that Google has approved the apps; HS_GOOGLE_HOSTED=0
 * switches it off, which leaves a hub exactly as it was before the hosted
 * apps existed. A household's own Google app, saved in Settings, is used
 * while `settings.googleApp` is `own` (the default) or whenever the hosted
 * apps are switched off, so they change nothing for a household that already
 * set one up until it flips the switch to Home Screens' app. The rule is
 * `chooseGoogleApp` (google-app-choice.ts).
 *
 * Client ids are public (they appear in every sign-in link). Both secrets
 * stay in the sign-in helper (infrastructure/google-oauth-worker), never in
 * this repository or on a hub: hubs send their token requests there and it
 * adds the secret on the way to Google.
 * - Calendar uses a "TVs and Limited Input devices" client. The hub asks
 *   Google for the short code itself (client id only); collecting the
 *   finished sign-in and every renewal go through the helper.
 * - Photos uses a "Web application" client: code exchange and renewals go
 *   through the helper.
 */

export const HOSTED_CALENDAR_CLIENT_ID =
  '529435319756-hgrtgtbc3va1tccdgio9b57a4fp6kl7c.apps.googleusercontent.com';
export const HOSTED_PHOTOS_CLIENT_ID =
  '529435319756-oejms0l610evvbed4mpljueobjtu91d9.apps.googleusercontent.com';

const CALENDAR_TOKEN_URL = 'https://auth.homescreens.dev/google/calendar/token';
const PHOTOS_TOKEN_URL = 'https://auth.homescreens.dev/google/photos/token';

function hostedEnabled(): boolean {
  return process.env.HS_GOOGLE_HOSTED?.trim() !== '0';
}

// The HS_GOOGLE_*_TOKEN_URL overrides point a development hub at
// `wrangler dev`, or a test at a stub.

export function hostedCalendarClient(): HostedGoogleClient | null {
  if (!hostedEnabled()) return null;
  const tokenUrl = process.env.HS_GOOGLE_CALENDAR_TOKEN_URL?.trim() || CALENDAR_TOKEN_URL;
  return { clientId: HOSTED_CALENDAR_CLIENT_ID, tokenUrl };
}

/**
 * Whether Home Screens' own app may offer adding calendar events. It needs a
 * wider Google sign-in ("View and edit events") that Google must review
 * before households can use it, so it stays off until `HS_GOOGLE_HOSTED_EVENTS=1`,
 * which lets the review video be recorded on a development hub. Households on
 * their own Google app are not affected.
 */
export function hostedEventsEnabled(): boolean {
  return process.env.HS_GOOGLE_HOSTED_EVENTS?.trim() === '1';
}

/** Home Screens' web app: Google Photos import signs in with it, and so does Calendar when it adds events. */
export function hostedPhotosClient(): HostedGoogleClient | null {
  if (!hostedEnabled()) return null;
  const tokenUrl = process.env.HS_GOOGLE_PHOTOS_TOKEN_URL?.trim() || PHOTOS_TOKEN_URL;
  return { clientId: HOSTED_PHOTOS_CLIENT_ID, tokenUrl };
}
