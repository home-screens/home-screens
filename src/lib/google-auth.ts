import { google } from 'googleapis';
import { getSecret } from '@/lib/secrets';
import { fetchWithTimeout } from '@/lib/api-utils';
import { createGoogleTokenStore, type StoredGoogleTokens } from '@/lib/google-token-store';
import { logger } from '@/lib/logger';

const log = logger('google-auth');

/** Google Calendar auth: the OAuth device-code flow lives here; holding the
 *  grant (persistence, proactive refresh, revocation) lives in the shared
 *  google-token-store, which the Google Photos importer also uses. */
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

// ── Device Flow ──────────────────────────────────────────────────────
// Google's device authorization endpoint (no redirect URI needed)
const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const store = createGoogleTokenStore({
  tokensPath: 'data/google-tokens.json',
  clientIdKey: 'google_client_id',
  clientSecretKey: 'google_client_secret',
  missingCredentialsMessage: 'Google Calendar Client ID and Secret are not configured. Add them in Settings → Integrations.',
  logName: 'google-auth',
});

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

/** Request a device code + user code from Google. */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const clientId = (await getSecret('google_client_id'))?.trim();
  if (!clientId) throw new Error('Google Calendar Client ID is not configured. Add it in Settings → Integrations.');

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

/** Poll Google's token endpoint for a device code grant. */
export async function pollDeviceToken(
  deviceCode: string,
): Promise<{ status: 'pending' | 'success' | 'expired' | 'denied'; error?: string }> {
  const { clientId, clientSecret } = await store.getClientCredentials();

  const res = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  const data = await res.json();

  if (res.ok && data.access_token) {
    // Success — convert expires_in (relative seconds) to expiry_date (absolute ms)
    // so getAuthenticatedClient() can proactively refresh before expiry
    if (data.expires_in && !data.expiry_date) {
      data.expiry_date = Date.now() + data.expires_in * 1000;
    }
    await store.saveTokens(data);
    if (!data.refresh_token) {
      return {
        status: 'success',
        error: 'Google did not return a refresh token — calendar will stop updating when the access token expires (~1 hour). To fix: revoke access at myaccount.google.com/permissions, then sign in again.',
      };
    }
    return { status: 'success' };
  }

  // Handle known polling states
  if (data.error === 'authorization_pending' || data.error === 'slow_down') {
    return { status: 'pending' };
  }
  if (data.error === 'expired_token') {
    return { status: 'expired', error: 'Code expired. Please try again.' };
  }
  if (data.error === 'access_denied') {
    return { status: 'denied', error: 'Access was denied.' };
  }

  return { status: 'denied', error: data.error_description || data.error || 'Unknown error' };
}

export async function loadTokens(): Promise<StoredGoogleTokens | null> {
  return store.loadTokens();
}

/**
 * A googleapis client carrying a currently valid access token. Refresh is
 * handled by the token store before the client is built, so the client
 * itself never needs to refresh mid-call.
 */
export async function getAuthenticatedClient(): Promise<import('googleapis').Common.OAuth2Client | null> {
  const accessToken = await store.getAccessToken();
  if (!accessToken) {
    log.error('No usable Google tokens (missing, expired without refresh token, or refresh rejected)');
    return null;
  }
  const { clientId, clientSecret } = await store.getClientCredentials();
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ access_token: accessToken });
  return client;
}

export async function isAuthenticated(): Promise<boolean> {
  return store.isConnected();
}

export async function disconnect(): Promise<void> {
  await store.disconnect();
}

export async function hasGoogleCredentials(): Promise<boolean> {
  return store.hasCredentials();
}
