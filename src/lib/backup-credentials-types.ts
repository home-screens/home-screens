/**
 * Wire types for the opt-in credential section of a backup bundle.
 *
 * Kept in their own module (with type-only imports) so the editor can import
 * `CredentialEnvelope` without pulling `auth.ts`, `googleapis`, or anything
 * else server-side into the client bundle.
 */

import type { ICloudAccountsFile } from './icloud-accounts';
import type { StoredOAuthTokens } from './oauth-token-store';
import type { PluginTokens } from './plugin-auth-types';
import type { AuthState } from './auth';

/** Logical names for the three host-owned OAuth grants. */
export type OAuthGrantName = 'google' | 'googlePicker' | 'onedrive';

/**
 * Everything an opt-in credential backup can carry. Every section is
 * optional: a section absent from a bundle is left untouched on restore,
 * and the collector omits sections that are empty on this device so a
 * bundle from a bare install has no dead keys in it.
 */
export interface CredentialPayload {
  /** data/secrets.json — host API keys. */
  secrets?: Record<string, string>;
  /** data/icloud-accounts.json — Apple IDs + app-specific passwords. */
  icloudAccounts?: ICloudAccountsFile;
  /**
   * data/{google,google-picker,onedrive}-tokens.json.
   *
   * An explicit `null` means "this device had no grant here" and clears the
   * file on apply. Only the pre-restore snapshot writes nulls — an exported
   * bundle omits absent grants entirely, so restoring someone's backup can
   * never silently sign a device out of an account the bundle said nothing
   * about. Without the sentinel a rollback cannot undo a newly-written grant.
   */
  oauthTokens?: Partial<Record<OAuthGrantName, StoredOAuthTokens | null>>;
  /** data/plugin-secrets/<id>.json, keyed by plugin id. */
  pluginSecrets?: Record<string, Record<string, string>>;
  /** data/plugin-tokens/<id>.json, keyed by plugin id. */
  pluginTokens?: Record<string, PluginTokens>;
  /** data/auth.json — login password hash, cookie secret, IP rules. */
  auth?: AuthState;
}

/** The keys of CredentialPayload, in a stable order for counting/reporting. */
export const CREDENTIAL_SECTIONS = [
  'secrets',
  'icloudAccounts',
  'oauthTokens',
  'pluginSecrets',
  'pluginTokens',
  'auth',
] as const satisfies readonly (keyof CredentialPayload)[];

export type CredentialSection = (typeof CREDENTIAL_SECTIONS)[number];

/** scrypt parameters, carried in the envelope so a future tuning stays readable. */
export interface ScryptParams {
  N: number;
  r: number;
  p: number;
  keylen: 32;
}

export interface PlaintextCredentialEnvelope {
  encrypted: false;
  data: CredentialPayload;
}

export interface EncryptedCredentialEnvelope {
  encrypted: true;
  kdf: 'scrypt';
  kdfParams: ScryptParams;
  /** base64, 16 bytes */
  salt: string;
  /** base64, 12 bytes */
  iv: string;
  /** base64, AES-GCM authentication tag */
  tag: string;
  /** base64, AES-256-GCM over JSON.stringify(CredentialPayload) */
  ciphertext: string;
}

export type CredentialEnvelope =
  | PlaintextCredentialEnvelope
  | EncryptedCredentialEnvelope;

/** Narrowing guard usable from both client and server. */
export function isEncryptedEnvelope(
  envelope: unknown,
): envelope is EncryptedCredentialEnvelope {
  return (
    !!envelope &&
    typeof envelope === 'object' &&
    (envelope as EncryptedCredentialEnvelope).encrypted === true
  );
}

/** Shape check for anything claiming to be an envelope, before we act on it. */
export function isCredentialEnvelope(
  envelope: unknown,
): envelope is CredentialEnvelope {
  if (!envelope || typeof envelope !== 'object') return false;
  // Not `Partial<Encrypted & Plaintext>` — the two `encrypted` literal types
  // intersect to `never`, which collapses the whole shape.
  const e = envelope as {
    encrypted?: unknown;
    kdf?: unknown;
    kdfParams?: unknown;
    salt?: unknown;
    iv?: unknown;
    tag?: unknown;
    ciphertext?: unknown;
    data?: unknown;
  };
  if (e.encrypted === true) {
    return (
      e.kdf === 'scrypt' &&
      !!e.kdfParams &&
      typeof e.salt === 'string' &&
      typeof e.iv === 'string' &&
      typeof e.tag === 'string' &&
      typeof e.ciphertext === 'string'
    );
  }
  if (e.encrypted === false) {
    return !!e.data && typeof e.data === 'object';
  }
  return false;
}

/** Shortest passphrase we accept. Enforced in the API and mirrored in the UI. */
export const MIN_PASSPHRASE_LENGTH = 8;

/** Result of applying a credential payload during a restore. */
export interface CredentialApplyResult {
  /** Sections that were present in the bundle and written to disk. */
  applied: CredentialSection[];
  /**
   * Field paths deliberately not applied for safety, e.g.
   * `auth.ipRestrictAccess` when restoring it would lock this device out.
   */
  skipped: string[];
}
