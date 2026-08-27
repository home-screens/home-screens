import { getSecret, type SecretKey } from './secrets';
import { createOAuthTokenStore, type StoredOAuthTokens } from './oauth-token-store';

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
 * about holding a grant — persistence, proactive refresh, revocation — lives
 * in the provider-neutral oauth-token-store exactly once.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/** Alias kept so existing Google call sites need no changes. */
export type StoredGoogleTokens = StoredOAuthTokens;

export interface GoogleTokenStoreOptions {
  /** Path of the tokens JSON file, relative to process.cwd(). */
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

  const store = createOAuthTokenStore({
    tokensPath: opts.tokensPath,
    tokenUrl: TOKEN_URL,
    revokeUrl: REVOKE_URL,
    missingCredentialsMessage: opts.missingCredentialsMessage,
    logName: opts.logName,
    getCredentials: async () => {
      const { clientId, clientSecret } = await getClientCredentials();
      return { client_id: clientId, client_secret: clientSecret };
    },
    hasCredentials,
  });

  return { ...store, getClientCredentials, hasCredentials };
}
