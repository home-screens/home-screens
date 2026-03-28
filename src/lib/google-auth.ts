import { google } from 'googleapis';
import { readFile } from 'fs/promises';
import { writeSecureFile } from '@/lib/secure-file';
import path from 'path';
import { getSecret } from '@/lib/secrets';
import { fetchWithTimeout } from '@/lib/api-utils';

const TOKENS_PATH = path.join(process.cwd(), 'data', 'google-tokens.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

// ── Device Flow ──────────────────────────────────────────────────────
// Google's device authorization endpoint (no redirect URI needed)
const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

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
  if (!clientId) throw new Error('Google OAuth Client ID is not configured. Add it in Settings → Integrations.');

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
  const clientId = await getSecret('google_client_id');
  const clientSecret = await getSecret('google_client_secret');
  if (!clientId || !clientSecret) throw new Error('Google OAuth Client ID and Secret are not configured. Add them in Settings → Integrations.');

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
    await writeSecureFile(TOKENS_PATH, JSON.stringify(data, null, 2));
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

function getRedirectUri(requestUrl?: string) {
  // Derive base URL from the incoming request so OAuth works regardless
  // of whether the user accesses via localhost, LAN IP, or hostname.
  if (requestUrl) {
    const url = new URL(requestUrl);
    return `${url.protocol}//${url.host}/api/auth/google/callback`;
  }
  const port = process.env.PORT || '3000';
  const base = process.env.NEXTAUTH_URL || `http://localhost:${port}`;
  return `${base}/api/auth/google/callback`;
}

async function createOAuth2Client(requestUrl?: string) {
  const clientId = await getSecret('google_client_id');
  const clientSecret = await getSecret('google_client_secret');
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth Client ID and Secret are not configured. Add them in Settings → Integrations.');
  }
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri(requestUrl));
}

interface StoredTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  token_type?: string | null;
  scope?: string;
}

export async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const raw = await readFile(TOKENS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function getAuthenticatedClient(): Promise<import('googleapis').Common.OAuth2Client | null> {
  const tokens = await loadTokens();
  if (!tokens) {
    console.error('[google-auth] No tokens file found at', TOKENS_PATH);
    return null;
  }
  if (!tokens.refresh_token) {
    console.error('[google-auth] Tokens file exists but has no refresh_token. Keys present:', Object.keys(tokens).join(', '));
    // Still try to use access_token if available and not expired
    if (!tokens.access_token) return null;
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) return null;
    try {
      const client = await createOAuth2Client();
      client.setCredentials(tokens);
      return client;
    } catch {
      return null;
    }
  }

  const client = await createOAuth2Client();
  client.setCredentials(tokens);

  // If token is expired or about to expire, refresh it
  const needsRefresh = tokens.expiry_date
    ? tokens.expiry_date < Date.now() + 60_000
    : !tokens.access_token; // No expiry_date and no access_token → must refresh
  if (needsRefresh) {
    try {
      const { credentials } = await client.refreshAccessToken();
      // Preserve the refresh token (Google doesn't always return it on refresh)
      const updated = { ...credentials, refresh_token: tokens.refresh_token };
      await writeSecureFile(TOKENS_PATH, JSON.stringify(updated, null, 2));
      client.setCredentials(updated);
    } catch (err) {
      console.error('[google-auth] Token refresh failed:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  return client;
}

export async function isAuthenticated(): Promise<boolean> {
  const tokens = await loadTokens();
  if (tokens?.refresh_token) return true;
  // Access-token-only (no refresh token) — valid until expired
  if (tokens?.access_token) {
    if (!tokens.expiry_date) return true;
    return tokens.expiry_date > Date.now();
  }
  return false;
}

export async function disconnect() {
  try {
    const tokens = await loadTokens();
    if (tokens?.access_token) {
      const client = await createOAuth2Client();
      client.setCredentials(tokens);
      await client.revokeToken(tokens.access_token);
    }
  } catch {
    // Best effort revocation
  }
  try {
    await writeSecureFile(TOKENS_PATH, JSON.stringify({}));
  } catch {
    // Best effort cleanup
  }
}

export async function hasGoogleCredentials(): Promise<boolean> {
  const clientId = await getSecret('google_client_id');
  const clientSecret = await getSecret('google_client_secret');
  return Boolean(clientId && clientSecret);
}
