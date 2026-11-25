import type { GoogleAppPreference } from '@/types/config';
import { getSecret, type SecretKey } from './secrets';
import { fetchWithTimeout, SetupError } from './api-utils';
import { chooseGoogleApp } from './google-app-choice';
import { createOAuthTokenStore, type StoredOAuthTokens } from './oauth-token-store';
import { logger } from './logger';
import { googleProjectOf } from './google-grant-project';

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
 * saved in Settings) or from Home Screens' own app (google-hosted.ts), as
 * `chooseGoogleApp` (google-app-choice.ts) decides: saved own credentials are
 * used while `settings.googleApp` is `own` (the default) or whenever Home
 * Screens' app is unavailable; otherwise Home Screens' app is used when it
 * is available.
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
  /**
   * Set only on a grant from the integration's second, web client (Calendar
   * signed in on the web to add events); absent means its main client, which
   * is every grant saved before there was a second one. Renewals go to the
   * client that issued the grant. Kept through refreshes and backups.
   */
  client_kind?: 'web';
}

/** Home Screens' own Google app for one integration. */
export interface HostedGoogleClient {
  clientId: string;
  /** The sign-in helper, which adds the secret on the way to Google. */
  tokenUrl: string;
}

export type GoogleClientMode = 'own' | 'hosted';

/**
 * Which of an integration's clients: its `main` one, or its second `web` one
 * where it has one. Calendar reads through a "TVs and Limited Input devices"
 * client, whose short-code sign-in Google will not give the narrow
 * "View and edit events" permission, so adding events signs in on the web.
 */
export type GoogleClientKind = 'main' | 'web';

export interface GoogleClient {
  mode: GoogleClientMode;
  kind: GoogleClientKind;
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
  /**
   * A second, web client for the same integration: the household's saved web
   * pair on its own app, `hosted` on Home Screens' app. Which app is in use is
   * still decided by the main client's keys and the household's switch.
   */
  web?: {
    clientIdKey: SecretKey;
    clientSecretKey: SecretKey;
    hosted: () => HostedGoogleClient | null;
    /** What to add and where, when the web client is missing. */
    missingCredentialsMessage: string;
  };
  /** Logger namespace. */
  logName: string;
}

export interface GoogleTokenStore {
  readonly filePath: string;
  loadTokens(): Promise<StoredGoogleTokens | null>;
  saveTokens(tokens: StoredGoogleTokens): Promise<void>;
  /** The client to sign in and refresh with. Throws a `SetupError` carrying the missing-credentials message when there is none. */
  getClient(kind?: GoogleClientKind): Promise<GoogleClient>;
  /**
   * The client id alone, for steps that need nothing else (starting a device
   * flow). A household's own id counts even before its secret is saved.
   */
  getClientId(): Promise<string | null>;
  hasCredentials(kind?: GoogleClientKind): Promise<boolean>;
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
    init?: { retries?: number; kind?: GoogleClientKind },
  ): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; client: GoogleClient }>;
  /** Save a fresh grant, recording which app and which of its clients issued it. */
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
  /**
   * The Google Cloud project the saved grant came from (google-grant-project.ts):
   * undefined when nothing is saved, null when it can't be told.
   */
  savedGrantProject(): Promise<string | null | undefined>;
  /** Best-effort revoke, then clear the tokens file; `revoke: false` only clears it. */
  disconnect(options?: { revoke?: boolean }): Promise<void>;
}

type ResolvedClient =
  | { mode: 'own'; kind: GoogleClientKind; clientId?: string; clientSecret?: string; tokenUrl: string }
  | ({ mode: 'hosted'; kind: GoogleClientKind } & HostedGoogleClient);

/** Which client issued a saved grant. */
function grantKind(tokens: StoredGoogleTokens | null | undefined): GoogleClientKind {
  return tokens?.client_kind === 'web' ? 'web' : 'main';
}

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
  async function resolveClient(kind: GoogleClientKind = 'main'): Promise<ResolvedClient | null> {
    const clientId = (await getSecret(opts.clientIdKey))?.trim() || undefined;
    const clientSecret = (await getSecret(opts.clientSecretKey))?.trim() || undefined;
    const ownSaved = Boolean(clientId || clientSecret);
    const hosted = opts.hosted();
    const preference = ownSaved && hosted ? await opts.preference() : 'own';
    const mode = chooseGoogleApp({ ownSaved, preference, hostedAvailable: hosted !== null });
    if (kind === 'web') {
      // The same app as the main client, through its web client.
      const web = opts.web;
      if (!web || mode === null) return null;
      if (mode === 'own') {
        return {
          mode: 'own',
          kind: 'web',
          clientId: (await getSecret(web.clientIdKey))?.trim() || undefined,
          clientSecret: (await getSecret(web.clientSecretKey))?.trim() || undefined,
          tokenUrl: GOOGLE_TOKEN_URL,
        };
      }
      const hostedWeb = web.hosted();
      return hostedWeb ? { mode: 'hosted', kind: 'web', ...hostedWeb } : null;
    }
    if (mode === 'own') return { mode: 'own', kind: 'main', clientId, clientSecret, tokenUrl: GOOGLE_TOKEN_URL };
    if (mode === 'hosted' && hosted) return { mode: 'hosted', kind: 'main', ...hosted };
    return null;
  }

  function isUsable(client: ResolvedClient | null): client is ResolvedClient & { clientId: string } {
    if (!client?.clientId) return false;
    return client.mode === 'hosted' || Boolean(client.clientSecret);
  }

  async function getClient(kind: GoogleClientKind = 'main'): Promise<GoogleClient> {
    const client = await resolveClient(kind);
    if (!isUsable(client)) {
      const message = kind === 'web' && opts.web ? opts.web.missingCredentialsMessage : opts.missingCredentialsMessage;
      throw new SetupError(message, 'key', opts.service, 'integrations');
    }
    return client;
  }

  async function getClientId(): Promise<string | null> {
    return (await resolveClient())?.clientId ?? null;
  }

  async function hasCredentials(kind: GoogleClientKind = 'main'): Promise<boolean> {
    return isUsable(await resolveClient(kind));
  }

  async function getMode(): Promise<GoogleClientMode | null> {
    const client = await resolveClient();
    return isUsable(client) ? client.mode : null;
  }

  const store = createOAuthTokenStore({
    tokensPath: opts.tokensPath,
    revokeUrl: REVOKE_URL,
    logName: opts.logName,
    getTokenClient: async (tokens) => {
      const client = await getClient(grantKind(tokens));
      return { tokenUrl: client.tokenUrl, params: clientParams(client) };
    },
    hasCredentials: () => hasCredentials(),
  });

  async function loadTokens(): Promise<StoredGoogleTokens | null> {
    return store.loadTokens();
  }

  async function requestToken(
    grant: Record<string, string>,
    { kind = 'main', ...init }: { retries?: number; kind?: GoogleClientKind } = {},
  ): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; client: GoogleClient }> {
    const client = await getClient(kind);
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
    delete grant.client_kind;
    if (client.mode === 'hosted') grant.client_mode = 'hosted';
    if (client.kind === 'web' && opts.web) grant.client_kind = 'web';
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
    const tokens = await loadTokens();
    const client = await resolveClient(grantKind(tokens));
    if (!tokens || !isUsable(client)) return true;
    const issuedBy: GoogleClientMode = tokens.client_mode === 'hosted' ? 'hosted' : 'own';
    if (issuedBy === client.mode) return true;
    if (!warnedMismatch) {
      warnedMismatch = true;
      log.warn(`Google grant came from the ${issuedBy} app but sign-in now uses the ${client.mode} app; sign in again`);
    }
    return false;
  }

  async function savedGrantProject(): Promise<string | null | undefined> {
    const tokens = await loadTokens();
    if (!tokens?.refresh_token && !tokens?.access_token) return undefined;
    const kind = grantKind(tokens);
    // By the app that issued the grant, not the one in use now: a grant from
    // the other app is still alive at Google until it is cancelled.
    if (tokens.client_mode === 'hosted') {
      return googleProjectOf((kind === 'web' ? opts.web?.hosted() : opts.hosted())?.clientId);
    }
    const idKey = kind === 'web' ? opts.web?.clientIdKey : opts.clientIdKey;
    return idKey ? googleProjectOf(await getSecret(idKey)) : null;
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
    savedGrantProject,
    disconnect: store.disconnect,
  };
}
