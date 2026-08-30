import { createGoogleTokenStore } from './google-token-store';

/**
 * The two Google grant instances, in their own module rather than inside
 * google-auth.ts / google-picker.ts.
 *
 * Each store owns a serialized write queue for its file, so there must be
 * exactly one instance per path — a second handle would have its own queue
 * and could interleave a write with an in-flight token refresh. Anything that
 * needs a store (including the credential backup) imports it from here, which
 * also keeps `googleapis` — pulled in by google-auth.ts — off the import path
 * of callers that only need to read or write the tokens file.
 */

/** Google Calendar: device-code flow, "TVs and Limited Input devices" client. */
export const googleCalendarTokenStore = createGoogleTokenStore({
  tokensPath: 'data/google-tokens.json',
  clientIdKey: 'google_client_id',
  clientSecretKey: 'google_client_secret',
  missingCredentialsMessage:
    'Google Calendar Client ID and Secret are not configured. Add them in Settings → Integrations.',
  logName: 'google-auth',
});

/** Google Photos import: auth-code flow, "Web application" client. */
export const googlePickerTokenStore = createGoogleTokenStore({
  tokensPath: 'data/google-picker-tokens.json',
  clientIdKey: 'google_web_client_id',
  clientSecretKey: 'google_web_client_secret',
  missingCredentialsMessage:
    'Google Photos import needs a web Client ID and Secret. Add them in Settings → Integrations.',
  logName: 'google-picker',
});
