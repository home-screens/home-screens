import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Only auth is stubbed — every store runs for real against the per-worker
// sandbox `data/` (vitest.setup.ts), so this exercises the real collection
// path through the same json-store writes production uses.
vi.mock('@/lib/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/auth')>()),
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  // Driven per test: the route's first gate reads this, and the 5s auth-state
  // cache in lib/auth makes the real reader too coarse to flip mid-suite.
  isAuthEnabled: vi.fn().mockResolvedValue(true),
}));

import { POST } from '@/app/api/backup/credentials/route';
import { requireSession } from '@/lib/auth';
import { writeSecrets } from '@/lib/secrets';
import { writeICloudAccountsFile } from '@/lib/icloud-accounts';
import { writeAuthStateRaw, isAuthEnabled } from '@/lib/auth';
import { decryptCredentials, BadPassphraseError } from '@/lib/backup-crypto';
import type { EncryptedCredentialEnvelope } from '@/lib/backup-credentials-types';

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backup/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** The route refuses to run without an editor password, so enable one. */
async function enableAuth(): Promise<void> {
  await writeAuthStateRaw({ passwordHash: 'hash', salt: 'salt', cookieSecret: 'secret' });
  vi.mocked(isAuthEnabled).mockResolvedValue(true);
}

beforeEach(async () => {
  vi.clearAllMocks();
  await writeSecrets({});
  await writeICloudAccountsFile({ accounts: [] });
  await enableAuth();
});

describe('POST /api/backup/credentials', () => {
  // `withAuth` alone is not a gate here: requireSession is a no-op when no
  // editor password is set, which is the default. Without this check the route
  // hands every key, refresh token and data/auth.json to any LAN client.
  it('refuses to run at all when no editor password is set', async () => {
    await writeAuthStateRaw({ passwordHash: null, salt: null, cookieSecret: null });
    vi.mocked(isAuthEnabled).mockResolvedValue(false);
    await writeSecrets({ openweathermap_key: 'must-not-leak' });

    const res = await POST(postReq({}));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('editor_password_required');
    expect(body.error).toMatch(/ /);
  });

  it('leaks nothing in the refusal body', async () => {
    await writeAuthStateRaw({ passwordHash: null, salt: null, cookieSecret: null });
    vi.mocked(isAuthEnabled).mockResolvedValue(false);
    await writeSecrets({ openweathermap_key: 'must-not-leak' });

    const res = await POST(postReq({}));
    expect(JSON.stringify(await res.json())).not.toContain('must-not-leak');
  });

  it('requires a session', async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );
    const res = await POST(postReq({}));
    expect(res.status).toBe(401);
  });

  it('returns a plaintext envelope when no password is given', async () => {
    await writeSecrets({ openweathermap_key: 'owm-1' });

    const res = await POST(postReq({}));
    expect(res.status).toBe(200);
    const envelope = await res.json();

    expect(envelope.encrypted).toBe(false);
    expect(envelope.data.secrets).toEqual({ openweathermap_key: 'owm-1' });
  });

  it('returns an encrypted envelope that only the password opens', async () => {
    await writeSecrets({ openweathermap_key: 'owm-secret-value' });
    await writeICloudAccountsFile({
      accounts: [{ id: 'a1', appleId: 'me@example.com', appPassword: 'aaaa-bbbb' }],
    });

    const res = await POST(postReq({ passphrase: 'a good long password' }));
    expect(res.status).toBe(200);
    const envelope = (await res.json()) as EncryptedCredentialEnvelope;

    expect(envelope.encrypted).toBe(true);
    expect(envelope.kdf).toBe('scrypt');
    // Nothing sensitive survives in the clear.
    expect(JSON.stringify(envelope)).not.toContain('owm-secret-value');
    expect(JSON.stringify(envelope)).not.toContain('aaaa-bbbb');

    const payload = await decryptCredentials(envelope, 'a good long password');
    expect(payload.secrets).toEqual({ openweathermap_key: 'owm-secret-value' });
    expect(payload.icloudAccounts?.accounts[0].appPassword).toBe('aaaa-bbbb');

    await expect(decryptCredentials(envelope, 'wrong password')).rejects.toBeInstanceOf(
      BadPassphraseError,
    );
  });

  it('rejects a password shorter than the minimum', async () => {
    const res = await POST(postReq({ passphrase: 'short' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('passphrase_too_short');
    expect(body.error).toMatch(/ /);
  });

  it('rejects a malformed body', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/backup/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      }),
    );
    expect(res.status).toBe(400);
  });

  // A credential export must never sit in a shared or browser cache.
  it('marks the response no-store', async () => {
    const res = await POST(postReq({}));
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('omits sections this device has nothing for', async () => {
    const res = await POST(postReq({}));
    const envelope = await res.json();
    // `auth` is always present now — the route only runs when an editor
    // password exists, which is itself an auth state worth carrying.
    expect(Object.keys(envelope.data)).toEqual(['auth']);
    expect(envelope.data.auth.passwordHash).toBe('hash');
  });
});
