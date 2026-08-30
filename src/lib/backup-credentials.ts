/**
 * Collect and apply the opt-in credential section of a backup bundle.
 *
 * Every read and write goes through the *owning* module's json-store, never a
 * fresh store on the same path. That is what keeps a restore from tearing an
 * OAuth refresh that happens to be in flight: each module's store serializes
 * its own writes, and a second store handle on the same file would have its
 * own independent queue.
 */

import { promises as fs } from 'fs';
import path from 'path';

import { readSecrets, writeSecrets, isValidSecretKey, type SecretKey } from './secrets';
import {
  readICloudAccountsFile,
  writeICloudAccountsFile,
  type ICloudAccountsFile,
} from './icloud-accounts';
import { googleCalendarTokenStore, googlePickerTokenStore } from './google-token-stores';
import { onedriveTokenStore } from './onedrive';
import {
  readAllPluginSecrets,
  writeAllPluginSecrets,
  deleteAllPluginSecrets,
} from './plugin-secrets';
import {
  readPluginTokensRaw,
  savePluginTokens,
  deletePluginTokens,
  TOKENS_DIR,
} from './plugin-auth';
import { readAuthState, writeAuthStateRaw, type AuthState } from './auth';
import { isIpAllowed } from './ip-allowlist';
import { sanitizePluginId } from './plugin-utils';
import { logger } from './logger';
import type { StoredOAuthTokens } from './oauth-token-store';
import type { PluginTokens } from './plugin-auth-types';
import type {
  CredentialApplyResult,
  CredentialPayload,
  CredentialSection,
  OAuthGrantName,
} from './backup-credentials-types';

const log = logger('backup-credentials');

const SECRETS_DIR = path.join('data', 'plugin-secrets');

/** The three host-owned OAuth grants and the store that owns each file. */
const OAUTH_STORES: Record<
  OAuthGrantName,
  { loadTokens(): Promise<StoredOAuthTokens | null>; saveTokens(t: StoredOAuthTokens): Promise<void> }
> = {
  google: googleCalendarTokenStore,
  googlePicker: googlePickerTokenStore,
  onedrive: onedriveTokenStore,
};

const OAUTH_GRANT_NAMES = Object.keys(OAUTH_STORES) as OAuthGrantName[];

/** Where the pre-migration per-plugin secrets file lived. */
const LEGACY_PLUGINS_DIR = path.join('data', 'plugins');

/* ─── Plugin file enumeration ─────────────────── */

/**
 * Plugin ids with a credential file in `dir`. Reads the directory rather than
 * the installed-plugins list so a temporarily-uninstalled plugin's saved token
 * still rides along in the backup.
 *
 * Skips `<id>.pending.json` (10-minute in-flight OAuth state, worthless in a
 * backup and actively confusing to restore) and the extension-less
 * `.state-secret`, which is regenerated on demand.
 */
export async function listPluginCredentialIds(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(path.join(process.cwd(), dir));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const ids: string[] = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    if (name.endsWith('.pending.json')) continue;
    const id = name.slice(0, -'.json'.length);
    try {
      sanitizePluginId(id);
    } catch {
      continue; // a filename that isn't a legal plugin id can't have been ours
    }
    ids.push(id);
  }
  return ids.sort();
}

/**
 * Plugin ids whose secrets still live ONLY at the pre-migration path,
 * `data/plugins/<id>/secrets.json`. `readAllPluginSecrets` falls back to that
 * file, but nothing would ever ask it to: the directory listing above covers
 * `data/plugin-secrets/` only, so a server that hasn't upgraded its plugins
 * since the move would silently back up none of their keys.
 */
export async function listLegacyPluginSecretIds(): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(path.join(process.cwd(), LEGACY_PLUGINS_DIR), {
      withFileTypes: true,
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const ids: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      sanitizePluginId(entry.name);
    } catch {
      continue;
    }
    try {
      await fs.access(path.join(process.cwd(), LEGACY_PLUGINS_DIR, entry.name, 'secrets.json'));
      ids.push(entry.name);
    } catch {
      // no legacy secrets file for this plugin
    }
  }
  return ids;
}

/* ─── Collect ─────────────────────────────────── */

function isNonEmpty(obj: Record<string, unknown> | null | undefined): boolean {
  return !!obj && Object.keys(obj).length > 0;
}

/**
 * Read every credential store on this device.
 *
 * By default a section that holds nothing is omitted entirely, so a bundle
 * from a bare install carries no dead keys. Pass `includeEmpty` for the
 * pre-restore snapshot, where "this section was empty" is information the
 * rollback needs.
 */
export async function collectCredentials(
  opts: { includeEmpty?: boolean } = {},
): Promise<CredentialPayload> {
  const includeEmpty = opts.includeEmpty ?? false;
  const payload: CredentialPayload = {};

  const secrets = await readSecrets();
  if (includeEmpty || isNonEmpty(secrets)) payload.secrets = secrets as Record<string, string>;

  const icloud = await readICloudAccountsFile();
  if (includeEmpty || icloud.accounts.length > 0) payload.icloudAccounts = icloud;

  const oauthTokens: Partial<Record<OAuthGrantName, StoredOAuthTokens | null>> = {};
  for (const name of OAUTH_GRANT_NAMES) {
    const tokens = await OAUTH_STORES[name].loadTokens();
    // `disconnect()` writes `{}` rather than deleting the file, so a
    // truthiness check would carry a disconnected account as a live grant.
    const connected = tokens?.access_token || tokens?.refresh_token;
    if (connected) oauthTokens[name] = tokens;
    // In a snapshot, "there was no grant here" has to be recorded explicitly:
    // apply only touches names present in the map, so an omitted name could
    // not be rolled back to disconnected.
    else if (includeEmpty) oauthTokens[name] = null;
  }
  if (includeEmpty || isNonEmpty(oauthTokens)) payload.oauthTokens = oauthTokens;

  const pluginSecrets: Record<string, Record<string, string>> = {};
  const secretIds = new Set([
    ...(await listPluginCredentialIds(SECRETS_DIR)),
    ...(await listLegacyPluginSecretIds()),
  ]);
  for (const id of [...secretIds].sort()) {
    const secretsForPlugin = await readAllPluginSecrets(id);
    if (isNonEmpty(secretsForPlugin)) pluginSecrets[id] = secretsForPlugin;
  }
  if (includeEmpty || isNonEmpty(pluginSecrets)) payload.pluginSecrets = pluginSecrets;

  const pluginTokens: Record<string, PluginTokens> = {};
  for (const id of await listPluginCredentialIds(TOKENS_DIR)) {
    const tokens = await readPluginTokensRaw(id);
    if (tokens) pluginTokens[id] = tokens;
  }
  if (includeEmpty || isNonEmpty(pluginTokens)) payload.pluginTokens = pluginTokens;

  const auth = await readAuthState();
  // An install with no password and no IP rules has nothing worth carrying.
  const authIsInteresting =
    !!auth.passwordHash || !!auth.displayToken || (auth.ipAllowlist?.length ?? 0) > 0;
  if (includeEmpty || authIsInteresting) payload.auth = auth;

  return payload;
}

/**
 * Snapshot exactly the sections a restore is about to touch, so a failed
 * restore can put them back. Always includes empty sections: "there were no
 * secrets before" is what the rollback has to be able to reinstate.
 */
export async function snapshotCredentials(
  sections: readonly CredentialSection[],
): Promise<CredentialPayload> {
  const full = await collectCredentials({ includeEmpty: true });
  const snapshot: CredentialPayload = {};
  for (const section of sections) {
    if (full[section] !== undefined) {
      // Assignment through a per-key switch keeps the union types intact;
      // a generic index write would widen every field to their union.
      switch (section) {
        case 'secrets': snapshot.secrets = full.secrets; break;
        case 'icloudAccounts': snapshot.icloudAccounts = full.icloudAccounts; break;
        case 'oauthTokens': snapshot.oauthTokens = full.oauthTokens; break;
        case 'pluginSecrets': snapshot.pluginSecrets = full.pluginSecrets; break;
        case 'pluginTokens': snapshot.pluginTokens = full.pluginTokens; break;
        case 'auth': snapshot.auth = full.auth; break;
      }
    }
  }
  return snapshot;
}

/* ─── Validation ──────────────────────────────── */

function sanitizeSecrets(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {};
  const out: Partial<Record<SecretKey, string>> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    // Unknown keys are dropped rather than rejected: a bundle from a newer
    // version that added a provider should still restore everything else.
    if (isValidSecretKey(key) && typeof value === 'string') out[key] = value;
  }
  return out as Record<string, string>;
}

function sanitizeICloud(input: unknown): ICloudAccountsFile {
  const accounts =
    input && typeof input === 'object' && Array.isArray((input as ICloudAccountsFile).accounts)
      ? (input as ICloudAccountsFile).accounts
      : [];
  return {
    accounts: accounts.filter(
      (a) =>
        !!a &&
        typeof a.id === 'string' &&
        typeof a.appleId === 'string' &&
        typeof a.appPassword === 'string',
    ),
  };
}

/**
 * Keep only the three known grant names. `null` survives as the explicit
 * "clear this grant" sentinel the snapshot writes; anything else that isn't an
 * object is dropped, so a bundle carrying `"oauthTokens": null` (or a string,
 * or an unknown provider) is sanitized away instead of throwing mid-apply and
 * rolling back an otherwise-valid restore.
 */
function sanitizeOAuthTokens(
  input: unknown,
): Partial<Record<OAuthGrantName, StoredOAuthTokens | null>> {
  if (!input || typeof input !== 'object') return {};
  const source = input as Record<string, unknown>;
  const out: Partial<Record<OAuthGrantName, StoredOAuthTokens | null>> = {};
  for (const name of OAUTH_GRANT_NAMES) {
    if (!(name in source)) continue;
    const value = source[name];
    if (value === null) out[name] = null;
    else if (value && typeof value === 'object') out[name] = value as StoredOAuthTokens;
  }
  return out;
}

/** Keep only entries whose key is a legal plugin id and whose value is an object. */
function sanitizePluginMap<T>(input: unknown): Record<string, T> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, T> = {};
  for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    try {
      sanitizePluginId(id);
    } catch {
      continue;
    }
    out[id] = value as T;
  }
  return out;
}

/** Every field `AuthState` recognizes. Used to tell an auth state from noise. */
const AUTH_STATE_KEYS: readonly (keyof AuthState)[] = [
  'passwordHash',
  'salt',
  'cookieSecret',
  'displayToken',
  'sessionEpoch',
  'ipAllowlist',
  'ipBypassAuth',
  'ipRestrictAccess',
];

/**
 * An auth state is only usable if the password fields agree: a hash with no
 * salt can never be verified, which would lock the user out with no way in
 * short of deleting the file over SSH.
 *
 * The shape check in front matters as much as the hash/salt one. `payload.auth`
 * is untrusted JSON only *typed* as AuthState, and both `{}` and `[]` would
 * otherwise sail through — hash and salt agree at "both absent" — and get
 * written verbatim, destroying cookieSecret, displayToken, sessionEpoch and the
 * IP allowlist in a single write while reporting nothing.
 */
function authStateIsCoherent(auth: AuthState): boolean {
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return false;
  if (!AUTH_STATE_KEYS.some((key) => key in auth)) return false;
  const hasHash = typeof auth.passwordHash === 'string' && auth.passwordHash.length > 0;
  const hasSalt = typeof auth.salt === 'string' && auth.salt.length > 0;
  if (hasHash !== hasSalt) return false;
  if (hasHash && !auth.cookieSecret) return false;
  return true;
}

/* ─── Apply ───────────────────────────────────── */

export interface ApplyCredentialsOptions {
  /**
   * The IP the restore request came from. Used by the lockout guard: restoring
   * `ipRestrictAccess` from a device that isn't on the restored allowlist would
   * make this hub unreachable, and on a headless Pi the only way back is SSH.
   */
  clientIp?: string;
  /** Disable the lockout guard. Only the rollback path does this. */
  enforceIpGuard?: boolean;
  /**
   * Delete plugin credential files whose id isn't in the payload's maps. Only
   * the rollback path does this, to undo files a restore newly created.
   */
  prunePlugins?: boolean;
}

/**
 * Write every section present in `payload`. Sections absent from the payload
 * are left exactly as they are on disk.
 */
export async function applyCredentials(
  payload: CredentialPayload,
  opts: ApplyCredentialsOptions = {},
): Promise<CredentialApplyResult> {
  const { clientIp, enforceIpGuard = true, prunePlugins = false } = opts;
  const applied: CredentialSection[] = [];
  const skipped: string[] = [];

  if (payload.secrets !== undefined) {
    await writeSecrets(sanitizeSecrets(payload.secrets));
    applied.push('secrets');
  }

  if (payload.icloudAccounts !== undefined) {
    await writeICloudAccountsFile(sanitizeICloud(payload.icloudAccounts));
    applied.push('icloudAccounts');
  }

  if (payload.oauthTokens !== undefined) {
    const grants = sanitizeOAuthTokens(payload.oauthTokens);
    let wroteAny = false;
    for (const name of OAUTH_GRANT_NAMES) {
      if (!(name in grants)) continue;
      const tokens = grants[name];
      // `{}` is how disconnect() clears a grant — writing it is what makes a
      // rollback able to undo a grant the restore had newly created.
      await OAUTH_STORES[name].saveTokens(tokens ?? {});
      wroteAny = true;
    }
    if (wroteAny) applied.push('oauthTokens');
  }

  if (payload.pluginSecrets !== undefined) {
    const map = sanitizePluginMap<Record<string, string>>(payload.pluginSecrets);
    for (const [id, secrets] of Object.entries(map)) {
      await writeAllPluginSecrets(id, secrets);
    }
    if (prunePlugins) {
      for (const id of await listPluginCredentialIds(SECRETS_DIR)) {
        if (!(id in map)) await deleteAllPluginSecrets(id);
      }
    }
    applied.push('pluginSecrets');
  }

  if (payload.pluginTokens !== undefined) {
    const map = sanitizePluginMap<PluginTokens>(payload.pluginTokens);
    for (const [id, tokens] of Object.entries(map)) {
      await savePluginTokens(id, tokens);
    }
    if (prunePlugins) {
      for (const id of await listPluginCredentialIds(TOKENS_DIR)) {
        if (!(id in map)) await deletePluginTokens(id);
      }
    }
    applied.push('pluginTokens');
  }

  if (payload.auth !== undefined) {
    const auth = payload.auth;
    if (!auth || typeof auth !== 'object' || !authStateIsCoherent(auth)) {
      skipped.push('auth');
      log.warn('Skipped restoring auth state: password hash and salt disagree');
    } else {
      let next: AuthState = { ...auth };
      if (
        enforceIpGuard &&
        next.ipRestrictAccess &&
        !(clientIp && isIpAllowed(clientIp, next.ipAllowlist ?? []))
      ) {
        // Keep the allowlist itself so the user can re-enable it after adding
        // this device; only the enforcement switch is held back.
        next = { ...next, ipRestrictAccess: false };
        skipped.push('auth.ipRestrictAccess');
      }
      await writeAuthStateRaw(next);
      applied.push('auth');
    }
  }

  return { applied, skipped };
}
