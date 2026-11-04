/**
 * Collect and restore the opt-in credential section of a backup bundle.
 *
 * Every read goes through the *owning* module's json-store, never a fresh
 * store on the same path, so a collect cannot tear an OAuth refresh that
 * happens to be in flight. A restore never writes here at all: it is planned
 * as transaction changes that the backup route commits with everything else,
 * so a failure anywhere in the restore rolls the credentials back too.
 */

import { promises as fs } from 'fs';
import { getDataRoot, readTransactionFile, type TransactionChange } from './data-transaction';
import path from 'path';

import { readSecrets, isValidSecretKey, type SecretKey } from './secrets';
import { readICloudAccountsFile, type ICloudAccountsFile } from './icloud-accounts';
import { googleCalendarTokenStore, googlePickerTokenStore } from './google-token-stores';
import { onedriveTokenStore } from './onedrive';
import { readAllPluginSecrets, SECRETS_DIR } from './plugin-secrets';
import { readPluginTokensRaw, TOKENS_DIR } from './plugin-auth';
import { readAuthState, type AuthState } from './auth';
import { isIpAllowed } from './ip-allowlist';
import { sanitizePluginId } from './plugin-utils';
import { logger } from './logger';
import type { StoredOAuthTokens, OAuthTokenStore } from './oauth-token-store';
import type { PluginTokens } from './plugin-auth-types';
import type {
  CredentialApplyResult,
  CredentialPayload,
  CredentialSection,
  OAuthGrantName,
} from './backup-credentials-types';

const log = logger('backup-credentials');

/** The three host-owned OAuth grants and the store that owns each file. */
const OAUTH_STORES: Record<OAuthGrantName, Pick<OAuthTokenStore, 'filePath' | 'loadTokens'>> = {
  google: googleCalendarTokenStore,
  googlePicker: googlePickerTokenStore,
  onedrive: onedriveTokenStore,
};

const OAUTH_GRANT_NAMES = Object.keys(OAUTH_STORES) as OAuthGrantName[];

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

/* ─── Collect ─────────────────────────────────── */

function isNonEmpty(obj: Record<string, unknown> | null | undefined): boolean {
  return !!obj && Object.keys(obj).length > 0;
}

/**
 * Read every credential store on this device. A section that holds nothing is
 * omitted entirely, so a bundle from a bare install carries no dead keys.
 */
export async function collectCredentials(): Promise<CredentialPayload> {
  const payload: CredentialPayload = {};

  const secrets = await readSecrets();
  if (isNonEmpty(secrets)) payload.secrets = secrets as Record<string, string>;

  const icloud = await readICloudAccountsFile();
  if (icloud.accounts.length > 0) payload.icloudAccounts = icloud;

  const oauthTokens: Partial<Record<OAuthGrantName, StoredOAuthTokens | null>> = {};
  for (const name of OAUTH_GRANT_NAMES) {
    const tokens = await OAUTH_STORES[name].loadTokens();
    // `disconnect()` writes `{}` rather than deleting the file, so a
    // truthiness check would carry a disconnected account as a live grant.
    if (tokens?.access_token || tokens?.refresh_token) oauthTokens[name] = tokens;
  }
  if (isNonEmpty(oauthTokens)) payload.oauthTokens = oauthTokens;

  const pluginSecrets: Record<string, Record<string, string>> = {};
  for (const id of await listPluginCredentialIds(SECRETS_DIR)) {
    const secretsForPlugin = await readAllPluginSecrets(id);
    if (isNonEmpty(secretsForPlugin)) pluginSecrets[id] = secretsForPlugin;
  }
  if (isNonEmpty(pluginSecrets)) payload.pluginSecrets = pluginSecrets;

  const pluginTokens: Record<string, PluginTokens> = {};
  for (const id of await listPluginCredentialIds(TOKENS_DIR)) {
    const tokens = await readPluginTokensRaw(id);
    if (tokens) pluginTokens[id] = tokens;
  }
  if (isNonEmpty(pluginTokens)) payload.pluginTokens = pluginTokens;

  const auth = await readAuthState();
  // An install with no password and no IP rules has nothing worth carrying.
  const authIsInteresting =
    !!auth.passwordHash || !!auth.displayToken || (auth.ipAllowlist?.length ?? 0) > 0;
  if (authIsInteresting) payload.auth = auth;

  return payload;
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
 * Keep only the three known grant names. `null` survives as an explicit
 * "clear this grant" entry; anything else that isn't an object is dropped, so
 * a bundle carrying `"oauthTokens": null` (or a string, or an unknown
 * provider) is sanitized away instead of failing an otherwise-valid restore.
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

/* ─── Restore ─────────────────────────────────── */

/**
 * Plan the restore of every section present in `payload` as transaction
 * changes; sections absent from the payload are left exactly as they are on
 * disk. Nothing is written here: the backup route commits the changes with the
 * rest of the restore, so the journal rolls the credentials back with it.
 *
 * `clientIp` is where the restore request came from. It feeds the lockout
 * guard: restoring `ipRestrictAccess` from a device that isn't on the restored
 * allowlist would make this hub unreachable, and on a headless Pi the only
 * way back is SSH.
 */
export async function planCredentialRestore(
  payload: CredentialPayload,
  clientIp: string,
): Promise<{ changes: TransactionChange[]; result: CredentialApplyResult }> {
  const changes: TransactionChange[] = [];
  const applied: CredentialSection[] = [];
  const skipped: string[] = [];
  const plan = async (file: string, value: unknown, dirMode?: number) => {
    changes.push({
      path: file,
      before: await readTransactionFile(file),
      after: JSON.stringify(value, null, 2),
      mode: 0o600,
      ...(dirMode === undefined ? {} : { dirMode }),
    });
  };

  if (payload.secrets !== undefined) {
    await plan('data/secrets.json', sanitizeSecrets(payload.secrets));
    applied.push('secrets');
  }

  if (payload.icloudAccounts !== undefined) {
    await plan('data/icloud-accounts.json', sanitizeICloud(payload.icloudAccounts));
    applied.push('icloudAccounts');
  }

  if (payload.oauthTokens !== undefined) {
    const grants = sanitizeOAuthTokens(payload.oauthTokens);
    let plannedAny = false;
    for (const name of OAUTH_GRANT_NAMES) {
      if (!(name in grants)) continue;
      // `{}` is how disconnect() clears a grant, so a null entry lands as one.
      await plan(path.relative(getDataRoot(), OAUTH_STORES[name].filePath), grants[name] ?? {});
      plannedAny = true;
    }
    if (plannedAny) applied.push('oauthTokens');
  }

  if (payload.pluginSecrets !== undefined) {
    const map = sanitizePluginMap<Record<string, string>>(payload.pluginSecrets);
    for (const [id, secrets] of Object.entries(map)) {
      await plan(path.join(SECRETS_DIR, `${id}.json`), secrets, 0o700);
    }
    applied.push('pluginSecrets');
  }

  if (payload.pluginTokens !== undefined) {
    const map = sanitizePluginMap<PluginTokens>(payload.pluginTokens);
    for (const [id, tokens] of Object.entries(map)) {
      await plan(path.join(TOKENS_DIR, `${id}.json`), tokens, 0o700);
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
      if (next.ipRestrictAccess && !(clientIp && isIpAllowed(clientIp, next.ipAllowlist ?? []))) {
        // Keep the allowlist itself so the user can re-enable it after adding
        // this device; only the enforcement switch is held back.
        next = { ...next, ipRestrictAccess: false };
        skipped.push('auth.ipRestrictAccess');
      }
      await plan('data/auth.json', next);
      applied.push('auth');
    }
  }

  return { changes, result: { applied, skipped } };
}
