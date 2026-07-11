/**
 * Shared types for the plugin auth engine. Kept in their own module so the
 * engine (`plugin-auth.ts`), provider adapters (`plugin-auth-garmin.ts`), and
 * the proxy route can all import them without circular imports.
 */

/**
 * The long-lived Garmin OAuth1 credential. Garmin has no refresh_token
 * grant — the bearer used on data calls is re-minted from this credential
 * (signed with Garmin's published consumer key), so it is the thing that
 * actually keeps the connection alive.
 */
export interface GarminOauth1Credential {
  token: string;
  secret: string;
  /** Present when the account used MFA at sign-in; replayed on re-exchange. */
  mfa_token?: string;
}

export interface PluginTokens {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  /** Absolute expiry in ms since epoch. */
  expiry_date: number;
  /** Actual granted scope, when the provider reports it. */
  scope?: string;
  /** Garmin adapter bookkeeping: the credential that re-mints the bearer. */
  garmin_oauth1?: GarminOauth1Credential;
}

/** How the proxy should attach a plugin's access token to an upstream request. */
export interface TokenInjectionSpec {
  /** allowedDomains entries that receive the token; empty disables injection. */
  targetDomains: string[];
  placement: 'header' | 'query';
  /** Query-param name for `placement: 'query'`. */
  paramName?: string;
}
