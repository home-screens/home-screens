import type { auth as googleAuth } from '@googleapis/calendar';
import { SetupError } from '@/lib/api-utils';
import { type GoogleClientMode, type StoredGoogleTokens } from '@/lib/google-token-store';
import { disconnectGoogleService, googleCalendarTokenStore, type GoogleDisconnect } from '@/lib/google-token-stores';
import { classifyDeviceTokenAnswer, type DeviceTokenAnswer } from '@/lib/oauth-device-flow';
import { requestDeviceCodeGrant } from '@/lib/oauth-form-post';
import { logger } from '@/lib/logger';
import { bumpCalendarRevision } from '@/lib/calendar-revision';
import { hostedEventsEnabled } from '@/lib/google-hosted';
import { GOOGLE_EVENTS_SCOPE, googleEntryState, grantedScopes, type GoogleEntryState } from '@/lib/calendar-write';
import { redeemWebSignIn, webSignInLink, type WebSignInLink, type WebSignInResult } from '@/lib/google-web-sign-in';

const log = logger('google-auth');

/** Google Calendar auth: the OAuth device-code flow lives here; holding the
 *  grant (persistence, proactive refresh, revocation) lives in the shared
 *  google-token-store, which the Google Photos importer also uses. */
const READ_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const SCOPES = [READ_SCOPE];

// ── Device Flow ──────────────────────────────────────────────────────
// Google's device authorization endpoint (no redirect URI needed)
const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';

const store = googleCalendarTokenStore;

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

/** Request a device code + user code from Google. */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const clientId = await store.getClientId();
  if (!clientId) {
    throw new SetupError('Google Calendar Client ID is not configured. Add it in Settings > API keys.', 'key', 'Google Calendar', 'integrations');
  }

  const start = await requestDeviceCodeGrant(DEVICE_CODE_URL, {
    client_id: clientId,
    scope: SCOPES.join(' '),
  });
  if (!start.ok) throw new Error(start.detail || 'Failed to request device code');

  const { grant } = start;
  return {
    device_code: grant.deviceCode,
    user_code: grant.userCode,
    verification_url: grant.verificationUrl ?? 'https://www.google.com/device',
    expires_in: grant.expiresIn ?? 1800,
    interval: grant.interval ?? 5,
  };
}

export type GoogleDevicePoll =
  /** `slowDown` when Google asked for polls spaced further apart. */
  | { status: 'pending'; slowDown?: true }
  /** `error` carries a warning the sign-in still went through with. */
  | { status: 'success'; error?: string }
  | { status: 'expired' | 'denied'; error: string };

/** Poll Google's token endpoint for a device code grant. */
export async function pollDeviceToken(deviceCode: string): Promise<GoogleDevicePoll> {
  // A missing credential is a setup problem and still throws; from here on
  // the only way the request fails is Google or the sign-in helper not
  // answering, and the code on screen is still good for its whole lifetime,
  // so that keeps waiting rather than end a sign-in the family may be
  // halfway through.
  const client = await store.getClient();
  let answer: DeviceTokenAnswer;
  try {
    const result = await store.requestToken({
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    answer = classifyDeviceTokenAnswer(result.status, result.data);
  } catch (err) {
    log.warn('Device poll got no answer:', err instanceof Error ? err.message : err);
    answer = { kind: 'transient' };
  }

  switch (answer.kind) {
    case 'granted': {
      const data = answer.tokens as StoredGoogleTokens & { expires_in?: number };
      if (!data.access_token) return { status: 'denied', error: 'Google did not return a sign-in.' };
      // expires_in is relative seconds; expiry_date is the absolute ms the
      // store renews against.
      if (data.expires_in && !data.expiry_date) {
        data.expiry_date = Date.now() + data.expires_in * 1000;
      }
      await store.saveGrant(data, client);
      bumpCalendarRevision();
      if (!data.refresh_token) {
        return {
          status: 'success',
          error: 'Google did not return a refresh token, so the calendar will stop updating when the access token expires (about an hour). To fix: revoke access at myaccount.google.com/permissions, then sign in again.',
        };
      }
      return { status: 'success' };
    }
    case 'pending':
    case 'transient':
      return { status: 'pending' };
    case 'slowDown':
      return { status: 'pending', slowDown: true };
    case 'expired':
      return { status: 'expired', error: 'Code expired. Please try again.' };
    case 'denied':
      if (!answer.declined) log.error('Device sign-in ended at Google:', answer.detail);
      return { status: 'denied', error: answer.declined || !answer.detail ? 'Access was denied.' : answer.detail };
  }
}

export async function loadTokens(): Promise<StoredGoogleTokens | null> {
  return store.loadTokens();
}

/**
 * A Google Calendar client carrying a currently valid access token. Refresh
 * is handled by the token store before the client is built, so the client
 * itself never needs to refresh mid-call. The client library is loaded here
 * rather than at the top of the file: the sign-in routes share this file and
 * are all plain `fetch`, so opening Settings > Calendar loads none of it.
 */
export async function getAuthenticatedClient(): Promise<InstanceType<typeof googleAuth.OAuth2> | null> {
  const accessToken = await store.getAccessToken();
  if (!accessToken) {
    log.error('No usable Google tokens (missing, expired without refresh token, or refresh rejected)');
    return null;
  }
  const { clientId, clientSecret } = await store.getClient();
  const { auth } = await import('@googleapis/calendar');
  const client = new auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ access_token: accessToken });
  return client;
}

export async function isAuthenticated(): Promise<boolean> {
  return store.isConnected();
}

/** Disconnect Google Calendar; Google Photos import keeps working (`disconnectGoogleService`). */
export async function disconnect(): Promise<GoogleDisconnect> {
  const result = await disconnectGoogleService('calendar');
  bumpCalendarRevision();
  return result;
}

export async function hasGoogleCredentials(): Promise<boolean> {
  return store.hasCredentials();
}

/** Which app Calendar signs in with; the editor shows its new sign-in screens only for Home Screens' app. */
export async function getCalendarSignInMode(): Promise<GoogleClientMode | null> {
  return store.getMode();
}

// ── Web sign-in, for adding events ────────────────────────────────────

/**
 * The Google sign-in link that lets Home Screens add and change events: the
 * web sign-in Google Photos import uses, asking to read calendars and to
 * "View and edit events". The short code cannot ask for that.
 */
export async function getCalendarWebAuthUrl(hubAddress: string | null = null): Promise<WebSignInLink> {
  return webSignInLink({ store, kind: 'web', scopes: [READ_SCOPE, GOOGLE_EVENTS_SCOPE], hubAddress, purpose: 'calendar' });
}

export type CalendarWebSignInResult =
  /** `canAddEvents` is false when Google's "View and edit events" box was left empty. */
  | { ok: true; canAddEvents: boolean }
  | Extract<WebSignInResult, { ok: false }>;

/** Redeem a Calendar web sign-in code. It replaces the short-code sign-in; showing calendars carries on with it. */
export async function exchangeCalendarWebCode(pasted: string, state?: string): Promise<CalendarWebSignInResult> {
  const result = await redeemWebSignIn({ store, kind: 'web', pasted, state, purpose: 'calendar' });
  if (!result.ok) return result;
  bumpCalendarRevision();
  return { ok: true, canAddEvents: grantedScopes(result.scope).includes(GOOGLE_EVENTS_SCOPE) };
}

/**
 * Where adding Google events stands on this hub (`googleEntryState`). A
 * sign-in from the other app counts as none, the way showing calendars
 * treats it.
 */
export async function getGoogleEntryState(settingOn: boolean): Promise<GoogleEntryState> {
  const [clientMode, webClientSaved, connected, tokens] = await Promise.all([
    store.getMode(),
    store.hasCredentials('web'),
    store.isConnected(),
    store.loadTokens(),
  ]);
  return googleEntryState({
    settingOn,
    clientMode,
    hostedEventsEnabled: hostedEventsEnabled(),
    webClientSaved,
    grant: connected && tokens
      ? { kind: tokens.client_kind === 'web' ? 'web' : 'device', scopes: grantedScopes(tokens.scope) }
      : null,
  });
}
