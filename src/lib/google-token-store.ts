import { readFile } from 'fs/promises';
import { writeSecureFile } from './secure-file';
import { getSecret, type SecretKey } from './secrets';
import { fetchWithTimeout } from './api-utils';
import { logger } from './logger';

/**
 * Shared OAuth token store for the two Google integrations. Each grant lives
 * in its own file with its own client credentials:
 *
 * - Google Calendar: device-code flow, `google_client_id/secret` (a "TVs and
 *   Limited Input devices" client), tokens in data/google-tokens.json.
 * - Google Photos import: auth-code flow, `google_web_client_id/secret` (a
 *   "Web application" client — the picker scope is banned from the device
 *   flow), tokens in data/google-picker-tokens.json.
 *
 * The flows differ per integration and stay in their own modules; everything
 * about holding a grant — persistence, proactive refresh, revocation — is
 * identical and lives here exactly once.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export interface StoredGoogleTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  token_type?: string | null;
  scope?: string;
}

export interface GoogleTokenStoreOptions {
  /** Absolute path of the tokens JSON file. */
  tokensPath: string;
  clientIdKey: SecretKey;
  clientSecretKey: SecretKey;
  /** Thrown when the client id/secret secrets are missing. */
  missingCredentialsMessage: string;
  /** Logger namespace. */
  logName: string;
}

export interface GoogleTokenStore {
  loadTokens(): Promise<StoredGoogleTokens | null>;
  saveTokens(tokens: StoredGoogleTokens): Promise<void>;
  /** Throws with `missingCredentialsMessage` when either secret is unset. */
  getClientCredentials(): Promise<{ clientId: string; clientSecret: string }>;
  hasCredentials(): Promise<boolean>;
  /**
   * A currently valid access token, refreshing proactively (60s before
   * expiry, single-flight, refresh token preserved). Null when there is no
   * usable grant — including when a refresh is rejected (grant revoked).
   */
  getAccessToken(): Promise<string | null>;
  /** Passive presence check — no network. */
  isConnected(): Promise<boolean>;
  /**
   * Liveness check: does the grant still actually work? Costs nothing while
   * the cached access token is fresh; otherwise performs one refresh. Status
   * endpoints use this so a revoked grant surfaces as "not connected" (with
   * the sign-in UI) instead of a dead "connected" state.
   */
  verifyConnected(): Promise<boolean>;
  /** Best-effort revoke, then clear the tokens file. */
  disconnect(): Promise<void>;
}

export function createGoogleTokenStore(opts: GoogleTokenStoreOptions): GoogleTokenStore {
  const log = logger(opts.logName);
  let refreshInFlight: Promise<string | null> | null = null;

  async function loadTokens(): Promise<StoredGoogleTokens | null> {
    try {
      return JSON.parse(await readFile(opts.tokensPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  async function saveTokens(tokens: StoredGoogleTokens): Promise<void> {
    await writeSecureFile(opts.tokensPath, JSON.stringify(tokens, null, 2));
  }

  async function getClientCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    const clientId = (await getSecret(opts.clientIdKey))?.trim();
    const clientSecret = (await getSecret(opts.clientSecretKey))?.trim();
    if (!clientId || !clientSecret) throw new Error(opts.missingCredentialsMessage);
    return { clientId, clientSecret };
  }

  async function hasCredentials(): Promise<boolean> {
    const clientId = await getSecret(opts.clientIdKey);
    const clientSecret = await getSecret(opts.clientSecretKey);
    return Boolean(clientId && clientSecret);
  }

  async function refreshAccessToken(tokens: StoredGoogleTokens): Promise<string | null> {
    let credentials: { clientId: string; clientSecret: string };
    try {
      credentials = await getClientCredentials();
    } catch (err) {
      log.error('Token refresh impossible:', err instanceof Error ? err.message : err);
      return null;
    }
    const res = await fetchWithTimeout(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: tokens.refresh_token!,
        grant_type: 'refresh_token',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      log.error('Token refresh failed:', data.error_description || data.error || res.status);
      return null;
    }
    await saveTokens({
      ...tokens,
      access_token: data.access_token,
      expiry_date: Date.now() + (data.expires_in ?? 3600) * 1000,
      // Google rarely returns a new refresh token on refresh — keep the old one.
      refresh_token: data.refresh_token || tokens.refresh_token,
      scope: data.scope ?? tokens.scope,
    });
    return data.access_token;
  }

  async function getAccessToken(): Promise<string | null> {
    const tokens = await loadTokens();
    if (!tokens) return null;

    const fresh = tokens.expiry_date ? tokens.expiry_date > Date.now() + 60_000 : false;
    if (tokens.access_token && fresh) return tokens.access_token;

    if (!tokens.refresh_token) {
      // Access-token-only grant — usable until it expires, then dead.
      // No expiry_date recorded means we can't tell; assume still valid.
      if (tokens.access_token && (!tokens.expiry_date || tokens.expiry_date > Date.now())) {
        return tokens.access_token;
      }
      return null;
    }

    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken(tokens).finally(() => { refreshInFlight = null; });
    }
    return refreshInFlight;
  }

  async function isConnected(): Promise<boolean> {
    const tokens = await loadTokens();
    if (tokens?.refresh_token) return true;
    if (tokens?.access_token) {
      if (!tokens.expiry_date) return true;
      return tokens.expiry_date > Date.now();
    }
    return false;
  }

  async function verifyConnected(): Promise<boolean> {
    return (await getAccessToken()) !== null;
  }

  async function disconnect(): Promise<void> {
    try {
      const tokens = await loadTokens();
      if (tokens?.access_token) {
        await fetchWithTimeout(REVOKE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: tokens.access_token }),
        });
      }
    } catch {
      // Best effort revocation
    }
    try {
      await saveTokens({});
    } catch {
      // Best effort cleanup
    }
  }

  return {
    loadTokens,
    saveTokens,
    getClientCredentials,
    hasCredentials,
    getAccessToken,
    isConnected,
    verifyConnected,
    disconnect,
  };
}
