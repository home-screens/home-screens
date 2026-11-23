import { createGoogleTokenStore } from './google-token-store';
import { hostedCalendarClient, hostedPhotosClient } from './google-hosted';
import { readGoogleAppPreference } from './google-app-preference';
import { mayCancelAtGoogle } from './google-grant-project';
import type { GoogleAppsStatus } from './google-apps';

/**
 * The two Google grant instances, in their own module rather than inside
 * google-auth.ts / google-picker.ts.
 *
 * Each store owns a serialized write queue for its file, so there must be
 * exactly one instance per path — a second handle would have its own queue
 * and could interleave a write with an in-flight token refresh. Anything that
 * needs a store (including the credential backup) imports it from here, which
 * also keeps google-auth.ts and the Google client library it loads off the
 * import path of callers that only need to read or write the tokens file.
 */

/**
 * Google Calendar: device-code flow on a "TVs and Limited Input devices"
 * client for showing calendars. Adding events signs in on the web instead,
 * through the same web client Google Photos import uses, because Google gives
 * the short-code sign-in only read-only or full calendar access, never the
 * narrow "View and edit events". One grant at a time; `client_kind` says
 * which client issued it.
 */
export const googleCalendarTokenStore = createGoogleTokenStore({
  tokensPath: 'data/google-tokens.json',
  clientIdKey: 'google_client_id',
  clientSecretKey: 'google_client_secret',
  hosted: hostedCalendarClient,
  preference: readGoogleAppPreference,
  service: 'Google Calendar',
  missingCredentialsMessage:
    'Google Calendar needs both a Client ID and a Client Secret. Add them in Settings > API keys.',
  web: {
    clientIdKey: 'google_web_client_id',
    clientSecretKey: 'google_web_client_secret',
    hosted: hostedPhotosClient,
    missingCredentialsMessage:
      'Adding events needs the Web sign-in Client ID and Secret. Add them in Settings > API keys.',
  },
  logName: 'google-auth',
});

/** Google Photos import: auth-code flow, "Web application" client. */
export const googlePickerTokenStore = createGoogleTokenStore({
  tokensPath: 'data/google-picker-tokens.json',
  clientIdKey: 'google_web_client_id',
  clientSecretKey: 'google_web_client_secret',
  hosted: hostedPhotosClient,
  preference: readGoogleAppPreference,
  service: 'Google Photos',
  missingCredentialsMessage:
    'Google Photos import needs both a Web sign-in Client ID and Secret. Add them in Settings > API keys.',
  logName: 'google-picker',
});

/** Which app each integration signs in with, for the editor's Google screens. */
export async function getGoogleAppsStatus(): Promise<GoogleAppsStatus> {
  const [calendarMode, photosMode, preference] = await Promise.all([
    googleCalendarTokenStore.getMode(),
    googlePickerTokenStore.getMode(),
    readGoogleAppPreference(),
  ]);
  return {
    calendar: { mode: calendarMode, hostedAvailable: googleCalendarTokenStore.hostedAvailable() },
    photos: { mode: photosMode, hostedAvailable: googlePickerTokenStore.hostedAvailable() },
    preference,
  };
}

export type GoogleService = 'calendar' | 'photos';

export interface GoogleDisconnect {
  /**
   * The other Google service on this hub still signs in through the same
   * Google project, so Google was not asked to cancel the sign-in: that
   * would have signed the other one out too. Null when it was cancelled, or
   * there was nothing to cancel.
   */
  stillUsedBy: GoogleService | null;
}

/**
 * Disconnect Google Calendar or Google Photos import on this hub. The grant
 * is always cleared here; Google is asked to cancel it only when the other
 * service's saved grant cannot share its project (google-grant-project.ts).
 */
export async function disconnectGoogleService(service: GoogleService): Promise<GoogleDisconnect> {
  const [mine, other, otherService] = service === 'calendar'
    ? [googleCalendarTokenStore, googlePickerTokenStore, 'photos' as const]
    : [googlePickerTokenStore, googleCalendarTokenStore, 'calendar' as const];
  const [mineProject, otherProject] = await Promise.all([mine.savedGrantProject(), other.savedGrantProject()]);
  const cancel = mineProject === undefined
    || mayCancelAtGoogle(mineProject, otherProject === undefined ? [] : [otherProject]);
  await mine.disconnect({ revoke: cancel });
  return { stillUsedBy: cancel ? null : otherService };
}
