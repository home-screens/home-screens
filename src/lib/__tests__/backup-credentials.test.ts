import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

import {
  collectCredentials,
  snapshotCredentials,
  applyCredentials,
  listPluginCredentialIds,
} from '@/lib/backup-credentials';
import { readSecrets, writeSecrets } from '@/lib/secrets';
import { writeICloudAccountsFile } from '@/lib/icloud-accounts';
import { googleCalendarTokenStore, googlePickerTokenStore } from '@/lib/google-token-stores';
import { readAuthState, writeAuthStateRaw } from '@/lib/auth';
import type { CredentialPayload } from '@/lib/backup-credentials-types';

const SECRETS_DIR = path.join('data', 'plugin-secrets');
const TOKENS_DIR = path.join('data', 'plugin-tokens');

async function writeRaw(dir: string, name: string, body: unknown): Promise<void> {
  const full = path.join(process.cwd(), dir);
  await fs.mkdir(full, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(full, name), JSON.stringify(body), 'utf-8');
}

async function readRaw(dir: string, name: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), dir, name), 'utf-8'));
  } catch {
    return null;
  }
}

/** Wipe every store this suite touches back to empty. */
async function resetStores(): Promise<void> {
  await writeSecrets({});
  await writeICloudAccountsFile({ accounts: [] });
  await googleCalendarTokenStore.saveTokens({});
  await googlePickerTokenStore.saveTokens({});
  await writeAuthStateRaw({ passwordHash: null, salt: null, cookieSecret: null });
  for (const dir of [SECRETS_DIR, TOKENS_DIR, path.join('data', 'plugins')]) {
    await fs.rm(path.join(process.cwd(), dir), { recursive: true, force: true });
  }
}

beforeEach(resetStores);

describe('listPluginCredentialIds', () => {
  it('returns an empty list when the directory does not exist', async () => {
    await expect(listPluginCredentialIds(TOKENS_DIR)).resolves.toEqual([]);
  });

  it('lists plugin json files, sorted', async () => {
    await writeRaw(TOKENS_DIR, 'zulu.json', { access_token: 'z' });
    await writeRaw(TOKENS_DIR, 'alpha.json', { access_token: 'a' });
    await expect(listPluginCredentialIds(TOKENS_DIR)).resolves.toEqual(['alpha', 'zulu']);
  });

  // Pending auth state is a 10-minute in-flight OAuth handshake. Carrying it
  // into a backup would restore a handshake that expired long ago.
  it('skips pending auth state and non-json files', async () => {
    await writeRaw(TOKENS_DIR, 'strava.json', { access_token: 'a' });
    await writeRaw(TOKENS_DIR, 'strava.pending.json', { expiresAt: 1 });
    await fs.writeFile(path.join(process.cwd(), TOKENS_DIR, '.state-secret'), 'abc', 'utf-8');
    await expect(listPluginCredentialIds(TOKENS_DIR)).resolves.toEqual(['strava']);
  });

  it('skips filenames that are not legal plugin ids', async () => {
    await writeRaw(TOKENS_DIR, 'ok-plugin.json', { access_token: 'a' });
    await writeRaw(TOKENS_DIR, 'Not A Plugin.json', { access_token: 'b' });
    await expect(listPluginCredentialIds(TOKENS_DIR)).resolves.toEqual(['ok-plugin']);
  });
});

describe('collectCredentials', () => {
  it('omits every section on a bare install', async () => {
    await expect(collectCredentials()).resolves.toEqual({});
  });

  it('collects every section that holds something', async () => {
    await writeSecrets({ openweathermap_key: 'owm-1' });
    await writeICloudAccountsFile({
      accounts: [{ id: 'a1', appleId: 'me@example.com', appPassword: 'aaaa-bbbb' }],
    });
    await googleCalendarTokenStore.saveTokens({ access_token: 'cal', refresh_token: 'r1' });
    await writeRaw(SECRETS_DIR, 'weather-plus.json', { api_key: 'plugin-key' });
    await writeRaw(TOKENS_DIR, 'weather-plus.json', { access_token: 'plugin-token' });
    await writeAuthStateRaw({ passwordHash: 'h', salt: 's', cookieSecret: 'c' });

    const payload = await collectCredentials();

    expect(payload.secrets).toEqual({ openweathermap_key: 'owm-1' });
    expect(payload.icloudAccounts?.accounts[0].appPassword).toBe('aaaa-bbbb');
    expect(payload.oauthTokens?.google).toEqual({ access_token: 'cal', refresh_token: 'r1' });
    expect(payload.pluginSecrets).toEqual({ 'weather-plus': { api_key: 'plugin-key' } });
    expect(payload.pluginTokens).toEqual({ 'weather-plus': { access_token: 'plugin-token' } });
    expect(payload.auth).toMatchObject({ passwordHash: 'h', salt: 's' });
  });

  // A grant that has expired but still holds a refresh token is exactly what a
  // backup needs to carry — loadPluginTokens would drop it.
  it('keeps a plugin grant that has only a refresh token left', async () => {
    await writeRaw(TOKENS_DIR, 'strava.json', { access_token: '', refresh_token: 'still-good' });
    const payload = await collectCredentials();
    expect(payload.pluginTokens?.strava).toEqual({ access_token: '', refresh_token: 'still-good' });
  });

  // disconnect() writes `{}` rather than deleting the file, so a bare
  // truthiness check would have carried a disconnected account as a grant.
  it('ignores a disconnected OAuth grant left as an empty object', async () => {
    await googleCalendarTokenStore.saveTokens({});
    await googlePickerTokenStore.saveTokens({ access_token: 'real' });
    const payload = await collectCredentials();
    expect(payload.oauthTokens).toEqual({ googlePicker: { access_token: 'real' } });
  });

  // readAllPluginSecrets falls back to data/plugins/<id>/secrets.json, but
  // nothing asked it to: only data/plugin-secrets/ was ever enumerated, so a
  // server that hadn't upgraded its plugins backed up none of their keys.
  it('collects plugin secrets that still live only at the legacy path', async () => {
    await writeRaw(path.join('data', 'plugins', 'old-plugin'), 'secrets.json', { api_key: 'legacy' });
    const payload = await collectCredentials();
    expect(payload.pluginSecrets).toEqual({ 'old-plugin': { api_key: 'legacy' } });
  });

  it('prefers the new location when a plugin has both', async () => {
    await writeRaw(path.join('data', 'plugins', 'both'), 'secrets.json', { api_key: 'legacy' });
    await writeRaw(SECRETS_DIR, 'both.json', { api_key: 'current' });
    const payload = await collectCredentials();
    expect(payload.pluginSecrets).toEqual({ both: { api_key: 'current' } });
  });

  it('carries auth when only IP rules are set, with no password', async () => {
    await writeAuthStateRaw({
      passwordHash: null,
      salt: null,
      cookieSecret: null,
      ipAllowlist: ['192.168.1.0/24'],
    });
    const payload = await collectCredentials();
    expect(payload.auth?.ipAllowlist).toEqual(['192.168.1.0/24']);
  });

  it('includeEmpty keeps every section present for the rollback snapshot', async () => {
    const payload = await collectCredentials({ includeEmpty: true });
    expect(Object.keys(payload).sort()).toEqual([
      'auth',
      'icloudAccounts',
      'oauthTokens',
      'pluginSecrets',
      'pluginTokens',
      'secrets',
    ]);
  });
});

describe('snapshotCredentials', () => {
  it('returns only the requested sections, even when they are empty', async () => {
    const snapshot = await snapshotCredentials(['secrets', 'auth']);
    expect(Object.keys(snapshot).sort()).toEqual(['auth', 'secrets']);
    expect(snapshot.secrets).toEqual({});
  });

  // Apply only touches grant names PRESENT in the map, so a snapshot that
  // omitted the disconnected ones could never roll a restore back to
  // disconnected — the backup's account would silently stay signed in.
  it('records a null sentinel for grants this device does not have', async () => {
    const snapshot = await snapshotCredentials(['oauthTokens']);
    expect(snapshot.oauthTokens).toEqual({ google: null, googlePicker: null, onedrive: null });
  });

  it('rolls a newly-restored OAuth grant back to disconnected', async () => {
    const snapshot = await snapshotCredentials(['oauthTokens']);
    await applyCredentials({ oauthTokens: { google: { access_token: 'from-backup' } } });
    expect((await collectCredentials()).oauthTokens?.google).toEqual({ access_token: 'from-backup' });

    await applyCredentials(snapshot, { enforceIpGuard: false, prunePlugins: true });
    expect(await collectCredentials()).toEqual({});
  });
});

describe('applyCredentials', () => {
  it('is a faithful inverse of collect', async () => {
    await writeSecrets({ openweathermap_key: 'owm-1', todoist_token: 'td' });
    await writeICloudAccountsFile({
      accounts: [{ id: 'a1', appleId: 'me@example.com', appPassword: 'aaaa-bbbb' }],
    });
    await googlePickerTokenStore.saveTokens({ access_token: 'pick' });
    await writeRaw(SECRETS_DIR, 'weather-plus.json', { api_key: 'plugin-key' });
    await writeRaw(TOKENS_DIR, 'weather-plus.json', { access_token: 'plugin-token' });
    await writeAuthStateRaw({ passwordHash: 'h', salt: 's', cookieSecret: 'c' });

    const collected = await collectCredentials();
    await resetStores();
    expect(await collectCredentials()).toEqual({});

    const result = await applyCredentials(collected);
    expect(result.skipped).toEqual([]);
    expect(await collectCredentials()).toEqual(collected);
  });

  it('leaves sections absent from the payload untouched', async () => {
    await writeSecrets({ openweathermap_key: 'keep-me' });
    await applyCredentials({ icloudAccounts: { accounts: [] } });
    expect(await readSecrets()).toEqual({ openweathermap_key: 'keep-me' });
  });

  it('drops secret keys this version does not recognize', async () => {
    await applyCredentials({
      secrets: { openweathermap_key: 'good', not_a_real_key: 'bad' } as Record<string, string>,
    });
    expect(await readSecrets()).toEqual({ openweathermap_key: 'good' });
  });

  it('drops plugin entries whose id is not a legal plugin id', async () => {
    await applyCredentials({
      pluginSecrets: { 'ok-plugin': { k: 'v' }, '../escape': { k: 'v' } },
    });
    expect(await readRaw(SECRETS_DIR, 'ok-plugin.json')).toEqual({ k: 'v' });
    await expect(listPluginCredentialIds(SECRETS_DIR)).resolves.toEqual(['ok-plugin']);
  });

  // `payload.auth` is untrusted JSON only *typed* as AuthState. `{}` and `[]`
  // agree at "hash and salt both absent", so without a shape check they would
  // be written verbatim — wiping cookieSecret, displayToken, sessionEpoch and
  // the IP allowlist in one go, and silently disabling the editor password.
  it.each([
    ['an empty object', {}],
    ['an array', []],
    ['a string', 'nope'],
  ])('refuses %s as an auth state', async (_label, value) => {
    await writeAuthStateRaw({
      passwordHash: 'existing',
      salt: 'existing',
      cookieSecret: 'secret',
      displayToken: 'token',
      ipAllowlist: ['10.0.0.0/24'],
    });
    const result = await applyCredentials({ auth: value as never });
    expect(result.skipped).toContain('auth');
    expect(result.applied).not.toContain('auth');

    const state = await readAuthState();
    expect(state.passwordHash).toBe('existing');
    expect(state.cookieSecret).toBe('secret');
    expect(state.displayToken).toBe('token');
    expect(state.ipAllowlist).toEqual(['10.0.0.0/24']);
  });

  // A real auth state with only IP rules and no password is legitimate.
  it('accepts an auth state carrying only IP rules', async () => {
    const result = await applyCredentials({
      auth: { passwordHash: null, salt: null, cookieSecret: null, ipAllowlist: ['10.0.0.0/24'] },
    });
    expect(result.applied).toContain('auth');
    expect((await readAuthState()).ipAllowlist).toEqual(['10.0.0.0/24']);
  });

  it('sanitizes a null oauthTokens section instead of throwing', async () => {
    await googleCalendarTokenStore.saveTokens({ access_token: 'keep' });
    const result = await applyCredentials({ oauthTokens: null as never });
    expect(result.applied).not.toContain('oauthTokens');
    // The existing grant is untouched, and nothing threw.
    expect((await collectCredentials()).oauthTokens?.google).toEqual({ access_token: 'keep' });
  });

  it('drops OAuth entries for providers it does not know', async () => {
    const result = await applyCredentials({
      oauthTokens: { google: { access_token: 'ok' }, dropbox: { access_token: 'no' } } as never,
    });
    expect(result.applied).toContain('oauthTokens');
    expect((await collectCredentials()).oauthTokens).toEqual({ google: { access_token: 'ok' } });
  });

  it('refuses an auth state whose password hash and salt disagree', async () => {
    await writeAuthStateRaw({ passwordHash: 'existing', salt: 'existing', cookieSecret: 'c' });
    const result = await applyCredentials({
      auth: { passwordHash: 'orphan', salt: null, cookieSecret: 'c' },
    });
    expect(result.skipped).toContain('auth');
    expect(result.applied).not.toContain('auth');
    // The device's own password is untouched, not replaced by an unusable one.
    expect((await readAuthState()).passwordHash).toBe('existing');
  });

  describe('IP lockout guard', () => {
    const restrictedAuth: CredentialPayload = {
      auth: {
        passwordHash: 'h',
        salt: 's',
        cookieSecret: 'c',
        ipAllowlist: ['10.0.0.0/24'],
        ipRestrictAccess: true,
      },
    };

    it('holds back ipRestrictAccess when this device is not on the restored list', async () => {
      const result = await applyCredentials(restrictedAuth, { clientIp: '192.168.1.50' });
      expect(result.applied).toContain('auth');
      expect(result.skipped).toContain('auth.ipRestrictAccess');

      const state = await readAuthState();
      expect(state.ipRestrictAccess).toBe(false);
      // The list itself survives, so the user can add this device and re-enable.
      expect(state.ipAllowlist).toEqual(['10.0.0.0/24']);
      expect(state.passwordHash).toBe('h');
    });

    it('applies ipRestrictAccess when this device is on the restored list', async () => {
      const result = await applyCredentials(restrictedAuth, { clientIp: '10.0.0.7' });
      expect(result.skipped).toEqual([]);
      expect((await readAuthState()).ipRestrictAccess).toBe(true);
    });

    it('holds back ipRestrictAccess when the request IP is unknown', async () => {
      const result = await applyCredentials(restrictedAuth);
      expect(result.skipped).toContain('auth.ipRestrictAccess');
      expect((await readAuthState()).ipRestrictAccess).toBe(false);
    });

    it('is bypassed on the rollback path, which must restore state verbatim', async () => {
      const result = await applyCredentials(restrictedAuth, { enforceIpGuard: false });
      expect(result.skipped).toEqual([]);
      expect((await readAuthState()).ipRestrictAccess).toBe(true);
    });
  });

  it('prunePlugins removes credential files the payload does not mention', async () => {
    await writeRaw(SECRETS_DIR, 'keep.json', { k: 'v' });
    await writeRaw(SECRETS_DIR, 'drop.json', { k: 'v' });
    await writeRaw(TOKENS_DIR, 'drop.json', { access_token: 'a' });

    await applyCredentials(
      { pluginSecrets: { keep: { k: 'v' } }, pluginTokens: {} },
      { prunePlugins: true },
    );

    await expect(listPluginCredentialIds(SECRETS_DIR)).resolves.toEqual(['keep']);
    await expect(listPluginCredentialIds(TOKENS_DIR)).resolves.toEqual([]);
  });

  it('does not prune by default, so a restore only adds', async () => {
    await writeRaw(SECRETS_DIR, 'untouched.json', { k: 'v' });
    await applyCredentials({ pluginSecrets: { added: { k: 'v' } } });
    await expect(listPluginCredentialIds(SECRETS_DIR)).resolves.toEqual(['added', 'untouched']);
  });
});
