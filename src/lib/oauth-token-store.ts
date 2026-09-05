import { createJsonStore } from './json-store';
import { fetchWithTimeout } from './api-utils';
import { logger } from './logger';

/**
 * Provider-neutral OAuth token store: everything about holding a grant —
 * persistence, proactive refresh (60s before expiry, single-flight, refresh
 * token preserved), passive/liveness checks, and optional revocation.
 *
 * The provider supplies endpoints, token-request credentials, and the tokens
 * file path. Google's two grants (calendar + photos import) and the OneDrive
 * grant all build on this factory. Providers with no revocation endpoint
 * (Microsoft consumer accounts) omit revokeUrl — disconnect then only clears
 * the tokens file.
 */

export interface StoredOAuthTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  token_type?: string | null;
  scope?: string;
}

export interface OAuthTokenStoreOptions {
  /** Path of the tokens JSON file, relative to process.cwd(). */
  tokensPath: string;
  tokenUrl: string;
  /** Revocation endpoint; absent → disconnect only clears the tokens file. */
  revokeUrl?: string;
  /**
   * Token-request credential params (client_id, and client_secret when the
   * provider has one). Throws with the provider's own message when unusable.
   */
  getCredentials: () => Promise<Record<string, string>>;
  /** Passive presence check — no network. */
  hasCredentials: () => Promise<boolean>;
  /** Logger namespace. */
  logName: string;
}

export interface OAuthTokenStore {
  loadTokens(): Promise<StoredOAuthTokens | null>;
  saveTokens(tokens: StoredOAuthTokens): Promise<void>;
  /** Passive credential presence check, supplied by the provider — no network. */
  hasCredentials(): Promise<boolean>;
  /** Passive presence check — no network. */
  isConnected(): Promise<boolean>;
  /**
   * A currently valid access token, refreshing proactively (60s before
   * expiry, single-flight, refresh token preserved). Null when there is no
   * usable grant — including when a refresh is rejected (grant revoked).
   */
  getAccessToken(): Promise<string | null>;
  /**
   * Liveness check: does the grant still actually work? Costs nothing while
   * the cached access token is fresh; otherwise performs one refresh. Status
   * endpoints use this so a revoked grant surfaces as "not connected".
   */
  verifyConnected(): Promise<boolean>;
  /** Best-effort revoke (when revokeUrl is set), then clear the tokens file. */
  disconnect(): Promise<void>;
}

export function createOAuthTokenStore(opts: OAuthTokenStoreOptions): OAuthTokenStore {
  const log = logger(opts.logName);
  let refreshInFlight: Promise<string | null> | null = null;

  // Bumped by every save. A refresh reads the tokens, spends a network round
  // trip, then saves what it started from plus a new access token. If the
  // grant was replaced in the meantime (a backup restore, a disconnect, a
  // fresh sign-in), that save would put the previous account's refresh token
  // back over the new one, so a refresh only commits while the generation it
  // started under is still current. The write queue below cannot provide
  // this: it orders the file writes, not the stale read that produced one.
  let generation = 0;

  // Same store the other secret files use (secrets.json, auth.json): writes
  // are queued, tmp+rename atomic (so a power cut on the Pi can't leave a
  // torn tokens file), and chmod'd before the rename (so a refresh token is
  // never briefly world-readable). No dirMode: these live directly in data/,
  // which is shared with non-secret files.
  const store = createJsonStore<StoredOAuthTokens | null>({
    path: opts.tokensPath,
    defaultValue: null,
    chmod: 0o600,
  });

  async function loadTokens(): Promise<StoredOAuthTokens | null> {
    return store.read();
  }

  async function saveTokens(tokens: StoredOAuthTokens): Promise<void> {
    generation += 1;
    await store.write(tokens);
  }

  /** `startedAt` is the generation observed before the tokens were read. */
  async function refreshAccessToken(tokens: StoredOAuthTokens, startedAt: number): Promise<string | null> {
    let credentials: Record<string, string>;
    try {
      credentials = await opts.getCredentials();
    } catch (err) {
      log.error('Token refresh impossible:', err instanceof Error ? err.message : err);
      return null;
    }
    const res = await fetchWithTimeout(opts.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...credentials,
        refresh_token: tokens.refresh_token!,
        grant_type: 'refresh_token',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      log.error('Token refresh failed:', data.error_description || data.error || res.status);
      return null;
    }
    if (generation !== startedAt) {
      log.warn('Token refresh discarded: the stored grant was replaced while it was in flight');
      return null;
    }
    await saveTokens({
      ...tokens,
      access_token: data.access_token,
      expiry_date: Date.now() + (data.expires_in ?? 3600) * 1000,
      // Providers rarely return a new refresh token on refresh — keep the old one.
      refresh_token: data.refresh_token || tokens.refresh_token,
      scope: data.scope ?? tokens.scope,
    });
    return data.access_token;
  }

  async function getAccessToken(): Promise<string | null> {
    const startedAt = generation;
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
      refreshInFlight = refreshAccessToken(tokens, startedAt).finally(() => { refreshInFlight = null; });
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
    if (opts.revokeUrl) {
      try {
        const tokens = await loadTokens();
        if (tokens?.access_token) {
          await fetchWithTimeout(opts.revokeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: tokens.access_token }),
          });
        }
      } catch {
        // Best effort revocation
      }
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
    hasCredentials: opts.hasCredentials,
    isConnected,
    verifyConnected,
    getAccessToken,
    disconnect,
  };
}
