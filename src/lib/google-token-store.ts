import type { GoogleAppPreference } from '@/types/config';
import { getSecret, type SecretKey } from './secrets';
import { fetchWithTimeout, SetupError } from './api-utils';
import { chooseGoogleApp } from './google-app-choice';
import { createOAuthTokenStore, type StoredOAuthTokens } from './oauth-token-store';
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
 * Either grant can come from the household's own Google app (the secrets
 * saved in Settings) or from Home Screens' own app (google-hosted.ts). The
 * household's own app always wins; Home Screens' app is only used when no
 * own credential is saved at all and it is available.
 *
 * The flows differ per integration and stay in their own modules; everything
 * about holding a grant — persistence, proactive refresh, revocation — lives
 * in the provider-neutral oauth-token-store exactly once.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export interface StoredGoogleTokens extends StoredOAuthTokens {
  /**
   * Set only on a grant from Home Screens' own Google app; absent means the
   * household's own app issued it, which is every grant saved before Home
   * Screens had an app of its own. Kept through refreshes and backups.
   */
  client_mode?: 'hosted';
}

/** Home Screens' own Google app for one integration. */
export interface HostedGoogleClient {
  clientId: string;
  /** The sign-in helper, which adds the secret on the way to Google. */
  tokenUrl: string;
}

export type GoogleClientMode = 'own' | 'hosted';

export interface GoogleClient {
  mode: GoogleClientMode;
  clientId: string;
  clientSecret?: string;
  tokenUrl: string;
}

/** Thrown when Home Screens' sign-in helper cannot be reached at all. */
export class SignInHelperUnreachableError extends Error {
  constructor() {
    super("Couldn't reach the Home Screens sign-in helper. Try again in a few minutes.");
    this.name = 'SignInHelperUnreachableError';
  }
}

export interface GoogleTokenStoreOptions {
  /** Path of the tokens JSON file, relative to process.cwd(). */
  tokensPath: string;
  clientIdKey: SecretKey;
  clientSecretKey: SecretKey;
  /** Home Screens' own app for this integration, or null while unavailable. */
  hosted: () => HostedGoogleClient | null;
  /** The household's choice between its own saved app and Home Screens' (the API keys switch). */
  preference: () => Promise<GoogleAppPreference>;
  /** The service as the editor names it, for the setup answer a missing client gets. */
  service: string;
  /** The sentence of that answer: what to add and where. */
  missingCredentialsMessage: string;
  /** Logger namespace. */
  logName: string;
}

export interface GoogleTokenStore {
  readonly filePath: string;
  loadTokens(): Promise<StoredGoogleTokens | null>;
  saveTokens(tokens: StoredGoogleTokens): Promise<void>;
  /** The client to sign in and refresh with. Throws a `SetupError` carrying `missingCredentialsMessage` when there is none. */
  getClient(): Promise<GoogleClient>;
  /**
   * The client id alone, for steps that need nothing else (starting a device
   * flow). A household's own id counts even before its secret is saved.
   */
  getClientId(): Promise<string | null>;
  hasCredentials(): Promise<boolean>;
  /** Which app sign-ins and refreshes currently use, or null when neither is usable. */
  getMode(): Promise<GoogleClientMode | null>;
  /**
   * Whether Home Screens' own app is on for this integration, whatever the
   * household saved. The editor shows its new sign-in screens only then.
   */
  hostedAvailable(): boolean;
  /**
   * POST a grant request (code exchange, device poll) to the current client's
   * token endpoint with its credentials. Resolves with Google's answer, which
   * the caller inspects; throws SignInHelperUnreachableError when Home Screens'
   * sign-in helper is down.
   */
  requestToken(
    grant: Record<string, string>,
    init?: { retries?: number },
  ): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; client: GoogleClient }>;
  /** Save a fresh grant, recording which app issued it. */
  saveGrant(tokens: StoredGoogleTokens, client: GoogleClient): Promise<void>;
  /**
   * A currently valid access token, refreshing proactively (60s before
   * expiry, single-flight, refresh token preserved). Null when there is no
   * usable grant: none saved, a refresh rejected (grant revoked), or a grant
   * from a different app than the one now in use.
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

type ResolvedClient =
  | { mode: 'own'; clientId?: string; clientSecret?: string; tokenUrl: string }
  | ({ mode: 'hosted' } & HostedGoogleClient);

function clientParams(client: GoogleClient): Record<string, string> {
  return client.clientSecret
    ? { client_id: client.clientId, client_secret: client.clientSecret }
    : { client_id: client.clientId };
}

export function createGoogleTokenStore(opts: GoogleTokenStoreOptions): GoogleTokenStore {
  const log = logger(opts.logName);

  /**
   * Any own credential saved, even half of one, counts as the household's own
   * app, so a sign-in never silently falls through to Home Screens' app while
   * the household is partway through setting up theirs. The household's
   * switch on the API keys page can still send it to Home Screens' app with
   * its details kept (chooseGoogleApp has the whole rule).
   */
  async function resolveClient(): Promise<ResolvedClient | null> {
    const clientId = (await getSecret(opts.clientIdKey))?.trim() || undefined;
    const clientSecret = (await getSecret(opts.clientSecretKey))?.trim() || undefined;
    const ownSaved = Boolean(clientId || clientSecret);
    const hosted = opts.hosted();
    const preference = ownSaved && hosted ? await opts.preference() : 'own';
    const mode = chooseGoogleApp({ ownSaved, preference, hostedAvailable: hosted !== null });
    if (mode === 'own') return { mode: 'own', clientId, clientSecret, tokenUrl: GOOGLE_TOKEN_URL };
    if (mode === 'hosted' && hosted) return { mode: 'hosted', ...hosted };
    return null;
  }

  function isUsable(client: ResolvedClient | null): client is ResolvedClient & { clientId: string } {
    if (!client?.clientId) return false;
    return client.mode === 'hosted' || Boolean(client.clientSecret);
  }

  async function getClient(): Promise<GoogleClient> {
    const client = await resolveClient();
    if (!isUsable(client)) throw new SetupError(opts.missingCredentialsMessage, 'key', opts.service, 'integrations');
    return client;
  }

  async function getClientId(): Promise<string | null> {
    return (await resolveClient())?.clientId ?? null;
  }

  async function hasCredentials(): Promise<boolean> {
    return isUsable(await resolveClient());
  }

  async function getMode(): Promise<GoogleClientMode | null> {
    const client = await resolveClient();
    return isUsable(client) ? client.mode : null;
  }

  const store = createOAuthTokenStore({
    tokensPath: opts.tokensPath,
    revokeUrl: REVOKE_URL,
    logName: opts.logName,
    getTokenClient: async () => {
      const client = await getClient();
      return { tokenUrl: client.tokenUrl, params: clientParams(client) };
    },
    hasCredentials,
  });

  async function loadTokens(): Promise<StoredGoogleTokens | null> {
    return store.loadTokens();
  }

  async function requestToken(
    grant: Record<string, string>,
    init: { retries?: number } = {},
  ): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; client: GoogleClient }> {
    const client = await getClient();
    let res: Response;
    try {
      res = await fetchWithTimeout(client.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...clientParams(client), ...grant }),
        ...init,
      });
    } catch (err) {
      if (client.tokenUrl !== GOOGLE_TOKEN_URL) throw new SignInHelperUnreachableError();
      throw err;
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data, client };
  }

  async function saveGrant(tokens: StoredGoogleTokens, client: GoogleClient): Promise<void> {
    // Written without the marker for the household's own app, so their
    // tokens file keeps exactly the shape it always had.
    const grant: StoredGoogleTokens = { ...tokens };
    delete grant.client_mode;
    if (client.mode === 'hosted') grant.client_mode = 'hosted';
    await store.saveTokens(grant);
  }

  let warnedMismatch = false;

  /**
   * A refresh token only works with the app that issued it. Once the
   * household switches between its own app and Home Screens' app, the old
   * grant can never refresh again, so it counts as disconnected and the
   * sign-in UI comes back. Nothing to compare when either side is missing;
   * the underlying store then answers as it always has.
   */
  async function grantMatchesClient(): Promise<boolean> {
    const [tokens, client] = await Promise.all([loadTokens(), resolveClient()]);
    if (!tokens || !isUsable(client)) return true;
    const issuedBy: GoogleClientMode = tokens.client_mode === 'hosted' ? 'hosted' : 'own';
    if (issuedBy === client.mode) return true;
    if (!warnedMismatch) {
      warnedMismatch = true;
      log.warn(`Google grant came from the ${issuedBy} app but sign-in now uses the ${client.mode} app; sign in again`);
    }
    return false;
  }

  async function getAccessToken(): Promise<string | null> {
    if (!(await grantMatchesClient())) return null;
    return store.getAccessToken();
  }

  async function isConnected(): Promise<boolean> {
    if (!(await grantMatchesClient())) return false;
    return store.isConnected();
  }

  async function verifyConnected(): Promise<boolean> {
    if (!(await grantMatchesClient())) return false;
    return store.verifyConnected();
  }

  return {
    get filePath() { return store.filePath; },
    loadTokens,
    saveTokens: store.saveTokens,
    getClient,
    getClientId,
    hasCredentials,
    getMode,
    hostedAvailable: () => opts.hosted() !== null,
    requestToken,
    saveGrant,
    getAccessToken,
    isConnected,
    verifyConnected,
    disconnect: store.disconnect,
  };
}
