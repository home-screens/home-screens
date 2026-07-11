/**
 * Garmin Connect SSO adapter (`auth: { type: 'garmin' }`).
 *
 * Garmin has no public API — the whole open-source ecosystem uses the mobile
 * app's private SSO flow: email/password login at sso.garmin.com, an optional
 * MFA code round-trip, then a three-step exchange at connectapi.garmin.com:
 * service ticket → OAuth1 token (signed with Garmin's published consumer key)
 * → OAuth2 bearer. This is a port of matin/garth, the reference
 * implementation the ecosystem builds on, verified against its source.
 *
 * The durable credential is the OAuth1 token+secret — Garmin has no
 * refresh_token grant; expired bearers are re-minted by re-running the
 * OAuth2 exchange with the stored OAuth1 credential.
 *
 * All calls here are host-originated `fetch`es — never routed through the
 * plugin proxy — so the sso.garmin.com / connectapi.garmin.com auth endpoints
 * never need to appear in a plugin's allowedDomains. Passwords are used once
 * for the SSO exchange and never persisted; only tokens are stored. Data
 * calls (connectapi.garmin.com) go through the proxy with the injected
 * Bearer token.
 */

import crypto from 'crypto';
import { fetchWithTimeout } from '@/lib/api-utils';
import { logger } from '@/lib/logger';
import type { GarminOauth1Credential, PluginTokens } from '@/lib/plugin-auth-types';

const log = logger('plugin-auth-garmin');

// Endpoints + identifiers of the Garmin Connect mobile app's SSO flow, all
// matching garth: the GCM_ANDROID_DARK client against the /gcm/android
// service, with the consumer key/secret Garmin publishes via garth's S3.
const SSO_SIGNIN_PAGE_URL = 'https://sso.garmin.com/mobile/sso/en/sign-in';
const SSO_LOGIN_URL = 'https://sso.garmin.com/mobile/api/login';
const SSO_MFA_URL = 'https://sso.garmin.com/mobile/api/mfa/verifyCode';
const OAUTH_BASE_URL = 'https://connectapi.garmin.com/oauth-service/oauth';
const OAUTH_CONSUMER_URL = 'https://thegarth.s3.amazonaws.com/oauth_consumer.json';
const SSO_CLIENT_ID = 'GCM_ANDROID_DARK';
const SSO_SERVICE_URL = 'https://mobile.integration.garmin.com/gcm/android';
/** Audience of the login-time OAuth2 exchange — the mobile app's identifier. */
const EXCHANGE_AUDIENCE = 'GARMIN_CONNECT_MOBILE_ANDROID_DI';
// The SSO endpoints run in the app's WebView, so requests must look like a
// browser or Cloudflare challenges them; the OAuth endpoints instead expect
// the app's own User-Agent and reject unexpected ones.
const SSO_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const OAUTH_USER_AGENT = 'com.garmin.android.apps.connectmobile';

/**
 * Opaque continuation state between an MFA challenge and the code submit.
 * Holds only the SSO session cookies and the challenge method Garmin used —
 * never the password.
 */
export interface GarminPendingMfa {
  cookies: string[];
  mfaMethod: string;
}

export type GarminLoginResult =
  | { status: 'connected'; tokens: PluginTokens }
  | { status: 'mfa_required'; pending: GarminPendingMfa };

export type GarminMfaResult =
  | { status: 'connected'; tokens: PluginTokens }
  | { status: 'mfa_required'; error: string };

function ssoUrl(base: string): string {
  const url = new URL(base);
  url.searchParams.set('clientId', SSO_CLIENT_ID);
  url.searchParams.set('locale', 'en-US');
  url.searchParams.set('service', SSO_SERVICE_URL);
  return url.toString();
}

function ssoHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': SSO_USER_AGENT,
    ...extra,
  };
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function responseStatusType(data: Record<string, unknown>): string | undefined {
  const status = data.responseStatus;
  if (status && typeof status === 'object' && 'type' in status) {
    const t = (status as Record<string, unknown>).type;
    return typeof t === 'string' ? t : undefined;
  }
  return undefined;
}

/** First name=value segment of each Set-Cookie header, ready to replay. */
function extractCookies(res: Response): string[] {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  return setCookies
    .map((c) => c.split(';')[0].trim())
    .filter((c) => c.includes('='));
}

/** Merge cookie lists, later entries winning on name collisions. */
function mergeCookies(...lists: string[][]): string[] {
  const byName = new Map<string, string>();
  for (const cookie of lists.flat()) {
    byName.set(cookie.split('=')[0], cookie);
  }
  return [...byName.values()];
}

/* ─── OAuth1 signing ─────────────────────────── */

interface OAuthConsumer {
  consumer_key: string;
  consumer_secret: string;
}

// The consumer key/secret are public constants (extracted from the mobile
// app, republished for the ecosystem via garth's S3 bucket) — fetched once
// per process, not credentials to protect.
let consumerCache: OAuthConsumer | null = null;

async function getOAuthConsumer(): Promise<OAuthConsumer> {
  if (consumerCache) return consumerCache;
  const res = await fetchWithTimeout(OAUTH_CONSUMER_URL);
  const data = await parseJson(res);
  if (!res.ok || typeof data.consumer_key !== 'string' || typeof data.consumer_secret !== 'string') {
    log.error('Garmin OAuth consumer fetch failed:', res.status);
    throw new Error('Garmin sign-in did not go through. Please try again in a few minutes.');
  }
  consumerCache = { consumer_key: data.consumer_key, consumer_secret: data.consumer_secret };
  return consumerCache;
}

/** RFC 5849 §3.6 percent-encoding (stricter than encodeURIComponent). */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/**
 * Build an OAuth1 HMAC-SHA1 `Authorization` header (RFC 5849). Signs the URL
 * query string plus any form-urlencoded body params — the same coverage
 * requests_oauthlib gives garth.
 *
 * @internal exported for tests
 */
export function oauth1Header(
  method: string,
  url: string,
  consumer: OAuthConsumer,
  opts?: {
    token?: string;
    tokenSecret?: string;
    bodyParams?: Record<string, string>;
    // Fixed nonce/timestamp for deterministic tests; real calls generate them.
    nonce?: string;
    timestamp?: string;
  },
): string {
  const parsed = new URL(url);
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumer.consumer_key,
    oauth_nonce: opts?.nonce ?? crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: opts?.timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
    ...(opts?.token ? { oauth_token: opts.token } : {}),
  };
  const pairs: Array<[string, string]> = [
    ...parsed.searchParams.entries(),
    ...Object.entries(oauthParams),
    ...Object.entries(opts?.bodyParams ?? {}),
  ].map(([k, v]) => [rfc3986(k), rfc3986(v)]);
  // Byte-order sort by encoded key, then encoded value (RFC 5849 §3.4.1.3.2).
  pairs.sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0));
  const baseString = [
    method.toUpperCase(),
    rfc3986(`${parsed.protocol}//${parsed.host}${parsed.pathname}`),
    rfc3986(pairs.map(([k, v]) => `${k}=${v}`).join('&')),
  ].join('&');
  const signingKey = `${rfc3986(consumer.consumer_secret)}&${rfc3986(opts?.tokenSecret ?? '')}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
  return 'OAuth ' + Object.entries({ ...oauthParams, oauth_signature: signature })
    .map(([k, v]) => `${rfc3986(k)}="${rfc3986(v)}"`)
    .join(', ');
}

/* ─── SSO login + MFA ────────────────────────── */

/**
 * Sign in with Garmin Connect credentials. Returns tokens on the happy path,
 * or MFA continuation state when Garmin challenges (the normal path for most
 * accounts — the caller persists the state and prompts for the code).
 */
export async function garminLogin(email: string, password: string): Promise<GarminLoginResult> {
  // Prime SSO session cookies the way the app's WebView does — best-effort;
  // the login attempt itself is the authority on whether they were needed.
  let cookies: string[] = [];
  try {
    const pageUrl = new URL(SSO_SIGNIN_PAGE_URL);
    pageUrl.searchParams.set('clientId', SSO_CLIENT_ID);
    const pageRes = await fetchWithTimeout(pageUrl.toString(), {
      headers: {
        'User-Agent': SSO_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    cookies = extractCookies(pageRes);
  } catch (err) {
    log.warn('Garmin sign-in page cookie priming failed (continuing):',
      err instanceof Error ? err.message : err);
  }

  const res = await fetchWithTimeout(ssoUrl(SSO_LOGIN_URL), {
    method: 'POST',
    headers: ssoHeaders(cookies.length ? { Cookie: cookies.join('; ') } : undefined),
    body: JSON.stringify({ username: email, password, rememberMe: false, captchaToken: '' }),
  });
  const data = await parseJson(res);
  const statusType = responseStatusType(data);

  if (statusType === 'MFA_REQUIRED') {
    const mfaInfo = data.customerMfaInfo;
    const mfaMethod = mfaInfo && typeof mfaInfo === 'object'
      && typeof (mfaInfo as Record<string, unknown>).mfaLastMethodUsed === 'string'
      ? (mfaInfo as Record<string, string>).mfaLastMethodUsed
      : 'email';
    return {
      status: 'mfa_required',
      pending: { cookies: mergeCookies(cookies, extractCookies(res)), mfaMethod },
    };
  }
  if (res.ok && typeof data.serviceTicketId === 'string' && data.serviceTicketId) {
    return { status: 'connected', tokens: await completeLogin(data.serviceTicketId) };
  }

  log.error('Garmin sign-in failed:', res.status, statusType ?? '(no status)');
  if (res.status === 401 || res.status === 403 || statusType?.includes('INVALID')) {
    throw new Error('Garmin sign-in failed. Check your email and password and try again.');
  }
  throw new Error('Garmin sign-in did not go through. Please try again in a few minutes.');
}

/**
 * Submit the one-time MFA code using the continuation state from
 * `garminLogin`. Wrong codes are retryable until the pending state expires.
 */
export async function garminContinueMfa(
  pending: GarminPendingMfa,
  mfaCode: string,
): Promise<GarminMfaResult> {
  const res = await fetchWithTimeout(ssoUrl(SSO_MFA_URL), {
    method: 'POST',
    headers: ssoHeaders({ Cookie: pending.cookies.join('; ') }),
    body: JSON.stringify({
      mfaMethod: pending.mfaMethod || 'email',
      mfaVerificationCode: mfaCode,
      rememberMyBrowser: false,
      reconsentList: [],
      mfaSetup: false,
    }),
  });
  const data = await parseJson(res);
  const statusType = responseStatusType(data);

  if (res.ok && typeof data.serviceTicketId === 'string' && data.serviceTicketId) {
    return { status: 'connected', tokens: await completeLogin(data.serviceTicketId) };
  }

  log.error('Garmin MFA verify failed:', res.status, statusType ?? '(no status)');
  return {
    status: 'mfa_required',
    error: 'That code didn’t work. Check the code Garmin sent you and try again.',
  };
}

/* ─── OAuth1 → OAuth2 exchange ───────────────── */

/** Trade the SSO service ticket for the long-lived OAuth1 credential. */
async function fetchOauth1Token(ticket: string): Promise<GarminOauth1Credential> {
  const consumer = await getOAuthConsumer();
  const url = new URL(`${OAUTH_BASE_URL}/preauthorized`);
  url.searchParams.set('ticket', ticket);
  url.searchParams.set('login-url', SSO_SERVICE_URL);
  url.searchParams.set('accepts-mfa-tokens', 'true');
  const res = await fetchWithTimeout(url.toString(), {
    headers: {
      Authorization: oauth1Header('GET', url.toString(), consumer),
      'User-Agent': OAUTH_USER_AGENT,
    },
  });
  // Response is form-urlencoded: oauth_token, oauth_token_secret, mfa_token?
  const parsed = Object.fromEntries(new URLSearchParams(await res.text()));
  if (!res.ok || !parsed.oauth_token || !parsed.oauth_token_secret) {
    log.error('Garmin OAuth1 preauthorization failed:', res.status);
    throw new Error('Garmin sign-in did not go through. Please try again in a few minutes.');
  }
  return {
    token: parsed.oauth_token,
    secret: parsed.oauth_token_secret,
    ...(parsed.mfa_token ? { mfa_token: parsed.mfa_token } : {}),
  };
}

/**
 * Mint an OAuth2 bearer from the OAuth1 credential. `login: true` (first
 * exchange after SSO) additionally sends the mobile-app audience, matching
 * garth's login-vs-refresh split.
 */
async function exchangeForBearer(
  oauth1: GarminOauth1Credential,
  opts: { login: boolean },
): Promise<PluginTokens> {
  const consumer = await getOAuthConsumer();
  const url = `${OAUTH_BASE_URL}/exchange/user/2.0`;
  const bodyParams: Record<string, string> = {
    ...(opts.login ? { audience: EXCHANGE_AUDIENCE } : {}),
    ...(oauth1.mfa_token ? { mfa_token: oauth1.mfa_token } : {}),
  };
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: oauth1Header('POST', url, consumer, {
        token: oauth1.token,
        tokenSecret: oauth1.secret,
        bodyParams,
      }),
      'User-Agent': OAUTH_USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(bodyParams),
  });
  const data = await parseJson(res);
  const accessToken = data.access_token;
  if (!res.ok || typeof accessToken !== 'string' || !accessToken) {
    log.error('Garmin OAuth2 exchange failed:', res.status);
    throw new Error(opts.login
      ? 'Garmin sign-in did not go through. Please try again in a few minutes.'
      : 'Garmin connection expired. Reconnect the account in the editor.');
  }
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  return {
    access_token: accessToken,
    token_type: typeof data.token_type === 'string' && data.token_type ? data.token_type : 'Bearer',
    expiry_date: Date.now() + expiresIn * 1000,
    ...(typeof data.scope === 'string' ? { scope: data.scope } : {}),
    garmin_oauth1: oauth1,
  };
}

async function completeLogin(ticket: string): Promise<PluginTokens> {
  const oauth1 = await fetchOauth1Token(ticket);
  return exchangeForBearer(oauth1, { login: true });
}

/**
 * Re-mint the bearer from the stored OAuth1 credential — Garmin's version of
 * a refresh. The OAuth1 credential lives on the order of a year; a full
 * re-login is only needed once it is revoked or expired.
 */
export async function refreshGarminTokens(tokens: PluginTokens): Promise<PluginTokens> {
  if (!tokens.garmin_oauth1) {
    throw new Error('No Garmin sign-in credential stored — reconnect the account.');
  }
  return exchangeForBearer(tokens.garmin_oauth1, { login: false });
}
