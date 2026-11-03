import path from 'path';
import { createJsonStore } from './json-store';
import { onDataTransactionCommit, withDataTransaction } from './data-transaction';
import { fetchWithTimeout } from './api-utils';
import { logger, type Logger } from './logger';

/**
 * Provider-neutral OAuth token store: everything about holding a grant,
 * persistence, proactive refresh (60s before expiry, single-flight, refresh
 * token preserved), passive/liveness checks, and optional revocation.
 *
 * The provider supplies endpoints, token-request credentials, and the tokens
 * file path. Google's two grants (calendar + photos import) and the OneDrive
 * grant all build on this factory. Providers with no revocation endpoint
 * (Microsoft consumer accounts) omit revokeUrl; disconnect then only clears
 * the tokens file.
 *
 * The renewal itself (`resolveAccessToken` below) is shared further: the
 * plugin auth engine holds its grants in its own files and renews them
 * through the same rule, so a provider outage means the same thing on a
 * plugin as on the calendar.
 */

export interface StoredOAuthTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  token_type?: string | null;
  scope?: string;
}

/**
 * Thrown by `getAccessToken` when a renewal could not happen right now: the
 * token endpoint (or Home Screens' sign-in helper in front of it) was
 * unreachable, busy, rate limiting or erroring. The grant itself was not
 * refused, so callers treat this as an outage (the wall keeps its saved
 * events) and never as "sign in again".
 */
export class TokenRenewalUnavailableError extends Error {
  constructor() {
    super("Couldn't renew the sign-in right now. Try again in a few minutes.");
    this.name = 'TokenRenewalUnavailableError';
  }
}

/**
 * A renewal no retry will fix: the provider refused the grant or the app,
 * or the credentials to renew with are gone. The household has to sign in
 * again (or fix its own app).
 */
export class TokenRenewalRefusedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'TokenRenewalRefusedError';
  }
}

/**
 * The token endpoint's answers (RFC 6749 section 5.2) that mean the grant or
 * the app itself is not accepted, so no retry will help and the household
 * has to sign in again (or fix its own app). Every other failure, including
 * the sign-in helper's own `rate_limited` and `temporarily_unavailable`, is
 * an outage that passes.
 */
const REFUSED_GRANT_ERRORS = new Set(['invalid_grant', 'invalid_client', 'unauthorized_client']);

/** Whether a token endpoint's answer refuses the grant or the app for good. */
export function isRefusedGrant(data: Record<string, unknown> | null | undefined): boolean {
  return typeof data?.error === 'string' && REFUSED_GRANT_ERRORS.has(data.error);
}

/** Renew while a token has less than this long left. */
export const REFRESH_GRACE_MS = 60_000;

export interface AccessTokenResolution<T extends StoredOAuthTokens> {
  /** One renewal at a time per grant; concurrent callers share it. */
  key: string;
  log: Logger;
  load: () => Promise<T | null>;
  save: (tokens: T) => Promise<void>;
  /**
   * The grant's save generation, read before the tokens and compared after
   * the renewal (see `renewAndSave`).
   */
  generation: () => number;
  /**
   * Whether this grant can be renewed at all: it holds a refresh token, or
   * its flow mints anew. A grant that cannot is used until it expires.
   */
  renewable: (tokens: T) => boolean;
  /**
   * The renewed grant. Throws `TokenRenewalRefusedError` when no retry will
   * help; any other throw (unreachable, busy, 5xx, an answer with no token)
   * is an outage.
   */
  renew: (tokens: T) => Promise<T>;
  /** Called once a renewal is saved (the plugin engine audits it). */
  onRenewed?: () => void;
  /** Renew even while the current token is fresh: the one retry after an upstream 401. */
  force?: boolean;
}

// Serialized per grant WITHIN THIS PROCESS: concurrent callers (several
// display Pis polling at once) share one in-flight renewal instead of racing
// the provider, since some providers rotate the refresh token and a lost
// race bricks the grant. The app runs a single server process on the hub; a
// cross-worker deployment would need a file mutex.
const renewalsInFlight = new Map<string, Promise<string | null>>();

/**
 * A currently valid access token for a stored grant, renewing when it is
 * within a minute of expiry (or on `force`). Null when there is no usable
 * grant: none saved, or the provider refused a renewal. Throws
 * `TokenRenewalUnavailableError` when a renewal could not happen right now
 * and the current token has already expired.
 */
export async function resolveAccessToken<T extends StoredOAuthTokens>(
  resolution: AccessTokenResolution<T>,
): Promise<string | null> {
  const startedAt = resolution.generation();
  const tokens = await resolution.load();
  if (!tokens) return null;

  const now = Date.now();
  const fresh = Boolean(tokens.expiry_date) && (tokens.expiry_date as number) > now + REFRESH_GRACE_MS;
  if (tokens.access_token && fresh && !resolution.force) return tokens.access_token;

  if (!resolution.renewable(tokens)) {
    // Access-token-only grant: usable until it expires, then dead. No
    // expiry recorded means we can't tell; assume still valid.
    if (tokens.access_token && (!tokens.expiry_date || tokens.expiry_date > now)) {
      return tokens.access_token;
    }
    return null;
  }

  const existing = renewalsInFlight.get(resolution.key);
  if (existing) return existing;
  const flight = renewAndSave(resolution, tokens, startedAt)
    .finally(() => renewalsInFlight.delete(resolution.key));
  renewalsInFlight.set(resolution.key, flight);
  return flight;
}

/** `startedAt` is the generation observed before `tokens` were read. */
async function renewAndSave<T extends StoredOAuthTokens>(
  resolution: AccessTokenResolution<T>,
  tokens: T,
  startedAt: number,
): Promise<string | null> {
  const { log } = resolution;
  let renewed: T;
  try {
    renewed = await resolution.renew(tokens);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (err instanceof TokenRenewalRefusedError) {
      log.error('Token refresh refused, sign in again:', reason);
      return null;
    }
    log.warn('Token refresh failed for now:', reason);
    // We renew a minute early, so the current token may still work; hand it
    // out until it expires, then say the renewal is unavailable rather than
    // that the grant is gone.
    if (tokens.access_token && tokens.expiry_date && tokens.expiry_date > Date.now()) {
      return tokens.access_token;
    }
    throw new TokenRenewalUnavailableError();
  }

  // A renewal reads the tokens, spends a network round trip, then saves what
  // it started from plus a new access token. If the grant was replaced in
  // the meantime (a backup restore, a disconnect, a fresh sign-in), that
  // save would put the previous account's refresh token back over the new
  // one, so it only commits while the generation it started under is still
  // current. Checked AFTER acquiring the same lock as restore: a network
  // response can arrive while restore holds the lock, before its generation
  // bump. The persisted comparison also covers a restore in another process.
  return withDataTransaction(async () => {
    const current = await resolution.load();
    if (resolution.generation() !== startedAt || JSON.stringify(current) !== JSON.stringify(tokens)) {
      log.warn('Token refresh discarded: the stored grant was replaced while it was in flight');
      return null;
    }
    await resolution.save(renewed);
    resolution.onRenewed?.();
    return renewed.access_token ?? null;
  });
}

export interface OAuthTokenStoreOptions {
  /** Path of the tokens JSON file, relative to process.cwd(). */
  tokensPath: string;
  /** Revocation endpoint; absent means disconnect only clears the tokens file. */
  revokeUrl?: string;
  /**
   * Where a refresh goes and the client params it carries (client_id, and
   * client_secret when the client has one). Resolved per refresh, and as one
   * value, because a provider can switch clients while running and the
   * endpoint must match the credentials. Throws with the provider's own
   * message when unusable.
   */
  getTokenClient: () => Promise<{ tokenUrl: string; params: Record<string, string> }>;
  /** Passive presence check, no network. */
  hasCredentials: () => Promise<boolean>;
  /** Logger namespace. */
  logName: string;
}

export interface OAuthTokenStore {
  readonly filePath: string;
  loadTokens(): Promise<StoredOAuthTokens | null>;
  saveTokens(tokens: StoredOAuthTokens): Promise<void>;
  /** Passive credential presence check, supplied by the provider, no network. */
  hasCredentials(): Promise<boolean>;
  /** Passive presence check, no network. */
  isConnected(): Promise<boolean>;
  /**
   * A currently valid access token, refreshing proactively (60s before
   * expiry, single-flight, refresh token preserved). Null when there is no
   * usable grant, including when the provider refuses a refresh (grant
   * revoked). Throws TokenRenewalUnavailableError when a refresh could not
   * happen right now and the current token has already expired.
   */
  getAccessToken(): Promise<string | null>;
  /**
   * Liveness check: does the grant still actually work? Costs nothing while
   * the cached access token is fresh; otherwise performs one refresh. Status
   * endpoints use this so a revoked grant surfaces as "not connected". A
   * renewal that could not happen right now counts as connected: nothing
   * refused the grant, and asking the household to sign in again would not
   * help.
   */
  verifyConnected(): Promise<boolean>;
  /** Best-effort revoke (when revokeUrl is set), then clear the tokens file. */
  disconnect(): Promise<void>;
}

export function createOAuthTokenStore(opts: OAuthTokenStoreOptions): OAuthTokenStore {
  const log = logger(opts.logName);

  // Bumped by every save, and by every journal that wrote THIS tokens file:
  // a chore toggle or a list edit commits a journal too, and bumping on
  // those would throw away a refresh that finished underneath them, which
  // with a provider that rotates refresh tokens means reconnecting the
  // account. The write queue below cannot provide this: it orders the file
  // writes, not the stale read that produced one.
  let generation = 0;
  const ownPath = path.normalize(opts.tokensPath);
  onDataTransactionCommit((paths) => {
    if (paths.some((p) => path.normalize(p) === ownPath)) generation += 1;
  });

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

  /** One refresh_token round trip; the outcome is sorted by `resolveAccessToken`. */
  async function renewGrant(tokens: StoredOAuthTokens): Promise<StoredOAuthTokens> {
    let client: { tokenUrl: string; params: Record<string, string> };
    try {
      client = await opts.getTokenClient();
    } catch (err) {
      // No client to renew with is a setup problem, not an outage.
      throw new TokenRenewalRefusedError(err instanceof Error ? err.message : String(err));
    }
    const res = await fetchWithTimeout(client.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...client.params,
        refresh_token: tokens.refresh_token!,
        grant_type: 'refresh_token',
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    } | null;
    if (!res.ok || !data?.access_token) {
      const reason = String(data?.error_description || data?.error || res.status);
      throw isRefusedGrant(data) ? new TokenRenewalRefusedError(reason) : new Error(reason);
    }
    return {
      ...tokens,
      access_token: data.access_token,
      expiry_date: Date.now() + (data.expires_in ?? 3600) * 1000,
      refresh_token: data.refresh_token || tokens.refresh_token,
      scope: data.scope ?? tokens.scope,
    };
  }

  async function getAccessToken(): Promise<string | null> {
    return resolveAccessToken<StoredOAuthTokens>({
      key: ownPath,
      log,
      load: loadTokens,
      save: saveTokens,
      generation: () => generation,
      renewable: (tokens) => Boolean(tokens.refresh_token),
      renew: renewGrant,
    });
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
    try {
      return (await getAccessToken()) !== null;
    } catch (err) {
      if (err instanceof TokenRenewalUnavailableError) return true;
      throw err;
    }
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
    get filePath() { return store.filePath; },
    loadTokens,
    saveTokens,
    hasCredentials: opts.hasCredentials,
    isConnected,
    verifyConnected,
    getAccessToken,
    disconnect,
  };
}
