import type { auth as googleAuth } from '@googleapis/calendar';
import { fetchWithTimeout, SetupError } from '@/lib/api-utils';
import { type GoogleClientMode, type StoredGoogleTokens } from '@/lib/google-token-store';
import { googleCalendarTokenStore } from '@/lib/google-token-stores';
import { classifyDeviceTokenAnswer, type DeviceTokenAnswer } from '@/lib/oauth-device-flow';
import { logger } from '@/lib/logger';
import { bumpCalendarRevision } from '@/lib/calendar-revision';

const log = logger('google-auth');

/** Google Calendar auth: the OAuth device-code flow lives here; holding the
 *  grant (persistence, proactive refresh, revocation) lives in the shared
 *  google-token-store, which the Google Photos importer also uses. */
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

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
    throw new SetupError('Google Calendar Client ID is not configured. Add it in Settings → API keys.', 'key', 'Google Calendar', 'integrations');
  }

  const res = await fetchWithTimeout(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scope: SCOPES.join(' '),
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error_description || err.error || 'Failed to request device code');
  }

  return res.json();
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

export async function disconnect(): Promise<void> {
  await store.disconnect();
  bumpCalendarRevision();
}

export async function hasGoogleCredentials(): Promise<boolean> {
  return store.hasCredentials();
}

/** Which app Calendar signs in with; the editor shows its new sign-in screens only for Home Screens' app. */
export async function getCalendarSignInMode(): Promise<GoogleClientMode | null> {
  return store.getMode();
}
