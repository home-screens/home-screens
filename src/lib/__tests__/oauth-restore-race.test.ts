import { describe, it, expect, vi, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createOAuthTokenStore } from '../oauth-token-store';
import { withDataTransaction, commitDataTransaction, readTransactionFile } from '../data-transaction';

const file = 'data/restore-race-tokens.json';
const old = { access_token: 'old-account', refresh_token: 'old-refresh', expiry_date: 0 };
const fresh = { access_token: 'new-account', refresh_token: 'new-refresh', expiry_date: Date.now() + 3_600_000 };
afterEach(() => vi.unstubAllGlobals());

describe('OAuth refresh versus credential restore', () => {
  it.each(['journal', 'another-process'] as const)('keeps the restored account when a queued refresh follows a %s replacement', async (mode) => {
    let release!: () => void;
    let fetched!: () => void;
    let parsed!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const network = new Promise<void>((resolve) => { fetched = resolve; });
    const responseRead = new Promise<void>((resolve) => { parsed = resolve; });
    vi.stubGlobal('fetch', vi.fn(async () => {
      fetched(); await gate;
      return { ok: true, status: 200, json: async () => { parsed(); return { access_token: 'old-account-refreshed', expires_in: 3600 }; } };
    }));
    const store = createOAuthTokenStore({ tokensPath: file, tokenUrl: 'https://example.invalid/token', getCredentials: async () => ({ client_id: 'test' }), hasCredentials: async () => true, logName: 'oauth-test' });
    await store.saveTokens(old);
    const pending = store.getAccessToken();
    await network;
    await withDataTransaction(async () => {
      const before = await readTransactionFile(file);
      release();
      await responseRead;
      // Allow the completed response to queue its save behind this owner.
      await new Promise<void>((resolve) => setImmediate(resolve));
      const after = JSON.stringify(fresh);
      if (mode === 'journal') await commitDataTransaction({ kind: 'backup-restore', changes: [{ path: file, before, after }] });
      else {
        // Another process cannot bump this store instance's generation.
        await fs.writeFile(path.join(process.cwd(), file), after);
      }
    });
    expect(await pending).toBeNull();
    expect(await store.loadTokens()).toEqual(fresh);
  });

  it('keeps a refresh that finished under a journal for some other file', async () => {
    let release!: () => void;
    let fetched!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const network = new Promise<void>((resolve) => { fetched = resolve; });
    vi.stubGlobal('fetch', vi.fn(async () => {
      fetched(); await gate;
      return { ok: true, status: 200, json: async () => ({ access_token: 'old-account-refreshed', refresh_token: 'rotated-refresh', expires_in: 3600 }) };
    }));
    const store = createOAuthTokenStore({ tokensPath: file, tokenUrl: 'https://example.invalid/token', getCredentials: async () => ({ client_id: 'test' }), hasCredentials: async () => true, logName: 'oauth-test' });
    await store.saveTokens(old);
    const pending = store.getAccessToken();
    await network;
    // A chore toggle's journal lands while the token response is in flight.
    const other = 'data/restore-race-other.json';
    await withDataTransaction(async () => {
      const before = await readTransactionFile(other);
      await commitDataTransaction({ kind: 'chore-toggle', changes: [{ path: other, before, after: '{"completions":[]}' }] });
    });
    release();
    // The rotated refresh token is kept; discarding it would strand the grant.
    expect(await pending).toBe('old-account-refreshed');
    expect(await store.loadTokens()).toMatchObject({ access_token: 'old-account-refreshed', refresh_token: 'rotated-refresh' });
    await fs.rm(path.join(process.cwd(), other), { force: true });
  });
});
