import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import {
  readAuthState,
  isAuthEnabled,
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  setPassword,
  clearPassword,
  requireSession,
  requireDisplayAuth,
  getDisplayToken,
  regenerateDisplayToken,
  createSessionCookie,
  buildSessionCookie,
  buildClearCookie,
  clearAuthCache,
  getSessionMaxAge,
  revokeAllSessions,
  getIpAllowlistConfig,
  setIpAllowlistConfig,
} from '../auth';

const AUTH_PATH = path.join(process.cwd(), 'data', 'auth.json');
const AUTH_TMP = AUTH_PATH + '.tmp';

// Save and restore original auth.json around tests
let originalContent: string | null = null;

beforeEach(async () => {
  clearAuthCache();
  try {
    originalContent = await fs.readFile(AUTH_PATH, 'utf-8');
  } catch {
    originalContent = null;
  }
  // Remove auth file for clean test state
  try { await fs.unlink(AUTH_PATH); } catch { /* ok */ }
  try { await fs.unlink(AUTH_TMP); } catch { /* ok */ }
});

afterEach(async () => {
  clearAuthCache();
  try { await fs.unlink(AUTH_PATH); } catch { /* ok */ }
  try { await fs.unlink(AUTH_TMP); } catch { /* ok */ }
  if (originalContent !== null) {
    await fs.mkdir(path.dirname(AUTH_PATH), { recursive: true });
    await fs.writeFile(AUTH_PATH, originalContent, 'utf-8');
  }
});

describe('readAuthState', () => {
  it('returns disabled state when file does not exist', async () => {
    const state = await readAuthState();
    expect(state).toEqual({ passwordHash: null, salt: null, cookieSecret: null, displayToken: null });
  });

  it('reads valid auth state', async () => {
    const data = { passwordHash: 'hash', salt: 'salt', cookieSecret: 'secret' };
    await fs.mkdir(path.dirname(AUTH_PATH), { recursive: true });
    await fs.writeFile(AUTH_PATH, JSON.stringify(data));
    const state = await readAuthState();
    expect(state).toEqual(data);
  });

  it('throws on corrupt JSON (fail closed)', async () => {
    await fs.mkdir(path.dirname(AUTH_PATH), { recursive: true });
    await fs.writeFile(AUTH_PATH, 'not json!!!');
    await expect(readAuthState()).rejects.toThrow();
  });

  it('returns empty allowlist fields on default state', async () => {
    const state = await readAuthState();
    expect(state.ipAllowlist).toBeUndefined();
    expect(state.ipBypassAuth).toBeUndefined();
    expect(state.ipRestrictAccess).toBeUndefined();
  });
});

describe('isAuthEnabled', () => {
  it('returns false when no auth file exists', async () => {
    expect(await isAuthEnabled()).toBe(false);
  });

  it('returns true after setting a password', async () => {
    await setPassword('testpassword123');
    clearAuthCache();
    expect(await isAuthEnabled()).toBe(true);
  });

  it('returns false after clearing password', async () => {
    await setPassword('testpassword123');
    await clearPassword();
    clearAuthCache();
    expect(await isAuthEnabled()).toBe(false);
  });
});

describe('password hashing', () => {
  it('hashes and verifies a password correctly', async () => {
    const salt = 'a'.repeat(64);
    const hash = await hashPassword('mypassword', salt);
    expect(hash).toBeTruthy();
    expect(hash.length).toBe(128); // 64 bytes as hex
  });

  it('verifyPassword returns true for correct password', async () => {
    await setPassword('correcthorse');
    clearAuthCache();
    expect(await verifyPassword('correcthorse')).toBe(true);
  });

  it('verifyPassword returns false for wrong password', async () => {
    await setPassword('correcthorse');
    clearAuthCache();
    expect(await verifyPassword('wrongpassword')).toBe(false);
  });

  it('verifyPassword returns false when auth is disabled', async () => {
    expect(await verifyPassword('anything')).toBe(false);
  });
});

describe('session signing', () => {
  const secret = 'a'.repeat(64);

  it('signs and verifies a valid session', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = { iat: now, exp: now + 3600 };
    const cookie = signSession(payload, secret);
    expect(cookie).toContain('.');

    const result = verifySession(cookie, secret);
    expect(result).not.toBeNull();
    expect(result!.iat).toBe(now);
    expect(result!.exp).toBe(now + 3600);
  });

  it('rejects expired sessions', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const payload = { iat: past - 3600, exp: past };
    const cookie = signSession(payload, secret);
    expect(verifySession(cookie, secret)).toBeNull();
  });

  it('rejects tampered cookies', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = { iat: now, exp: now + 3600 };
    const cookie = signSession(payload, secret);
    // Flip a character in the middle of the signature (not the tail,
    // where base64url padding bits can absorb small changes).
    const dotIdx = cookie.indexOf('.');
    const midSig = dotIdx + Math.floor((cookie.length - dotIdx) / 2);
    const flipped = cookie[midSig] === 'A' ? 'B' : 'A';
    const tampered = cookie.slice(0, midSig) + flipped + cookie.slice(midSig + 1);
    expect(verifySession(tampered, secret)).toBeNull();
  });

  it('rejects cookies signed with a different secret', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = { iat: now, exp: now + 3600 };
    const cookie = signSession(payload, secret);
    expect(verifySession(cookie, 'b'.repeat(64))).toBeNull();
  });

  it('rejects malformed cookies', () => {
    expect(verifySession('notacookie', secret)).toBeNull();
    expect(verifySession('', secret)).toBeNull();
    expect(verifySession('a.b.c', secret)).toBeNull();
  });
});

describe('setPassword / clearPassword', () => {
  it('setPassword returns a valid session cookie', async () => {
    const token = await setPassword('mypassword8');
    expect(token).toContain('.');

    const state = await readAuthState();
    expect(state.passwordHash).toBeTruthy();
    expect(state.salt).toBeTruthy();
    expect(state.cookieSecret).toBeTruthy();

    const result = verifySession(token, state.cookieSecret!);
    expect(result).not.toBeNull();
  });

  it('clearPassword wipes all auth state including display token', async () => {
    await setPassword('mypassword8');
    await clearPassword();
    const state = await readAuthState();
    expect(state.passwordHash).toBeNull();
    expect(state.salt).toBeNull();
    expect(state.cookieSecret).toBeNull();
    expect(state.displayToken).toBeNull();
  });

  it('changing password invalidates old sessions', async () => {
    const oldToken = await setPassword('password1!');
    const oldState = await readAuthState();

    const newToken = await setPassword('password2!');
    const newState = await readAuthState();

    // Old cookie secret is different from new one
    expect(oldState.cookieSecret).not.toBe(newState.cookieSecret);

    // Old token is invalid with new secret
    expect(verifySession(oldToken, newState.cookieSecret!)).toBeNull();
    // New token is valid
    expect(verifySession(newToken, newState.cookieSecret!)).not.toBeNull();
  });
});

describe('requireSession', () => {
  it('is a no-op when auth is disabled', async () => {
    const request = new Request('http://localhost/api/test');
    await expect(requireSession(request)).resolves.toBeUndefined();
  });

  it('throws 401 when auth is enabled and no cookie', async () => {
    await setPassword('testpassword123');
    clearAuthCache();
    const request = new Request('http://localhost/api/test');
    try {
      await requireSession(request);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      const res = err as Response;
      expect(res.status).toBe(401);
    }
  });

  it('passes when auth is enabled and valid cookie is present', async () => {
    const token = await setPassword('testpassword123');
    clearAuthCache();
    const request = new Request('http://localhost/api/test', {
      headers: { cookie: `hs-session=${token}` },
    });
    await expect(requireSession(request)).resolves.toBeUndefined();
  });

  it('throws 401 when cookie is invalid', async () => {
    await setPassword('testpassword123');
    clearAuthCache();
    const request = new Request('http://localhost/api/test', {
      headers: { cookie: 'hs-session=invalid.token' },
    });
    try {
      await requireSession(request);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
    }
  });
});

describe('cookie helpers', () => {
  it('buildSessionCookie includes required flags', () => {
    const request = new Request('http://localhost/api/test');
    const cookie = buildSessionCookie('token123', request);
    expect(cookie).toContain('hs-session=token123');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=2592000');
    expect(cookie).not.toContain('Secure');
  });

  it('buildSessionCookie includes Secure for HTTPS', () => {
    const request = new Request('https://example.com/api/test');
    const cookie = buildSessionCookie('token123', request);
    expect(cookie).toContain('Secure');
  });

  it('buildClearCookie sets Max-Age=0', () => {
    const request = new Request('http://localhost/api/test');
    const cookie = buildClearCookie(request);
    expect(cookie).toContain('Max-Age=0');
  });

  it('createSessionCookie creates a valid token', async () => {
    const secret = 'a'.repeat(64);
    const token = createSessionCookie(secret);
    const result = verifySession(token, secret);
    expect(result).not.toBeNull();
    expect(result!.exp - result!.iat).toBe(30 * 24 * 60 * 60);
  });
});

describe('display token', () => {
  it('setPassword auto-generates a display token', async () => {
    await setPassword('testpassword123');
    const state = await readAuthState();
    expect(state.displayToken).toBeTruthy();
    expect(state.displayToken!.length).toBe(64); // 32 bytes hex
  });

  it('setPassword preserves existing display token on password change', async () => {
    await setPassword('password1');
    const firstToken = (await readAuthState()).displayToken;

    await setPassword('password2');
    const secondToken = (await readAuthState()).displayToken;

    expect(secondToken).toBe(firstToken);
  });

  it('getDisplayToken returns the token when set', async () => {
    await setPassword('testpassword123');
    const token = await getDisplayToken();
    expect(token).toBeTruthy();
    expect(token!.length).toBe(64);
  });

  it('getDisplayToken returns null when auth is disabled', async () => {
    const token = await getDisplayToken();
    expect(token).toBeNull();
  });

  it('regenerateDisplayToken creates a new token', async () => {
    await setPassword('testpassword123');
    const originalToken = await getDisplayToken();

    const newToken = await regenerateDisplayToken();
    expect(newToken).not.toBe(originalToken);
    expect(newToken.length).toBe(64);

    // The new token should be persisted
    const stored = await getDisplayToken();
    expect(stored).toBe(newToken);
  });

  it('regenerateDisplayToken preserves other auth state', async () => {
    await setPassword('testpassword123');
    const stateBefore = await readAuthState();

    await regenerateDisplayToken();
    const stateAfter = await readAuthState();

    expect(stateAfter.passwordHash).toBe(stateBefore.passwordHash);
    expect(stateAfter.salt).toBe(stateBefore.salt);
    expect(stateAfter.cookieSecret).toBe(stateBefore.cookieSecret);
  });

  it('getDisplayToken auto-generates token for pre-display-token auth.json (upgrade path)', async () => {
    // Simulate an auth.json from before the display token feature was added
    await fs.mkdir(path.dirname(AUTH_PATH), { recursive: true });
    await fs.writeFile(AUTH_PATH, JSON.stringify({
      passwordHash: 'abc',
      salt: 'def',
      cookieSecret: 'ghi',
      // no displayToken field — this is the upgrade scenario
    }));
    clearAuthCache();

    const token = await getDisplayToken();
    expect(token).toBeTruthy();
    expect(token!.length).toBe(64);

    // Token should now be persisted in auth.json
    const state = await readAuthState();
    expect(state.displayToken).toBe(token);
    // Other auth state should be preserved
    expect(state.passwordHash).toBe('abc');
    expect(state.salt).toBe('def');
    expect(state.cookieSecret).toBe('ghi');
  });
});

describe('requireDisplayAuth', () => {
  it('is a no-op when auth is disabled', async () => {
    const request = new Request('http://localhost/api/test');
    await expect(requireDisplayAuth(request)).resolves.toBeUndefined();
  });

  it('accepts a valid Bearer token', async () => {
    await setPassword('testpassword123');
    clearAuthCache();
    const token = await getDisplayToken();

    const request = new Request('http://localhost/api/test', {
      headers: { authorization: `Bearer ${token}` },
    });
    await expect(requireDisplayAuth(request)).resolves.toBeUndefined();
  });

  it('accepts a valid query param token', async () => {
    await setPassword('testpassword123');
    clearAuthCache();
    const token = await getDisplayToken();

    // Query param token is only accepted on /api/display/* paths
    const request = new Request(`http://localhost/api/display/wake?token=${token}`);
    await expect(requireDisplayAuth(request)).resolves.toBeUndefined();
  });

  it('rejects a valid query param token on a non-display path', async () => {
    await setPassword('testpassword123');
    clearAuthCache();
    const token = await getDisplayToken();

    // Valid token, but path is not /api/display/* — should be rejected
    const request = new Request(`http://localhost/api/weather?token=${token}`);
    try {
      await requireDisplayAuth(request);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      expect((err as Response).status).toBe(401);
    }
  });

  it('accepts a valid session cookie', async () => {
    const sessionToken = await setPassword('testpassword123');
    clearAuthCache();

    const request = new Request('http://localhost/api/test', {
      headers: { cookie: `hs-session=${sessionToken}` },
    });
    await expect(requireDisplayAuth(request)).resolves.toBeUndefined();
  });

  it('throws 401 when auth is enabled and no credentials provided', async () => {
    await setPassword('testpassword123');
    clearAuthCache();

    const request = new Request('http://localhost/api/test');
    try {
      await requireDisplayAuth(request);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      expect((err as Response).status).toBe(401);
    }
  });

  it('throws 401 for an invalid Bearer token', async () => {
    await setPassword('testpassword123');
    clearAuthCache();

    const request = new Request('http://localhost/api/test', {
      headers: { authorization: 'Bearer invalidtoken' },
    });
    try {
      await requireDisplayAuth(request);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      expect((err as Response).status).toBe(401);
    }
  });

  it('throws 401 for an invalid query param token', async () => {
    await setPassword('testpassword123');
    clearAuthCache();

    const request = new Request('http://localhost/api/test?token=wrongtoken');
    try {
      await requireDisplayAuth(request);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      expect((err as Response).status).toBe(401);
    }
  });
});

describe('remember me sessions', () => {
  it('getSessionMaxAge returns 30 days by default', () => {
    expect(getSessionMaxAge()).toBe(30 * 24 * 60 * 60);
    expect(getSessionMaxAge(false)).toBe(30 * 24 * 60 * 60);
  });

  it('getSessionMaxAge returns 90 days for rememberMe', () => {
    expect(getSessionMaxAge(true)).toBe(90 * 24 * 60 * 60);
  });

  it('createSessionCookie creates a 30-day session by default', () => {
    const secret = 'a'.repeat(64);
    const token = createSessionCookie(secret);
    const result = verifySession(token, secret);
    expect(result).not.toBeNull();
    expect(result!.exp - result!.iat).toBe(30 * 24 * 60 * 60);
  });

  it('createSessionCookie creates a 90-day session with rememberMe', () => {
    const secret = 'a'.repeat(64);
    const token = createSessionCookie(secret, true);
    const result = verifySession(token, secret);
    expect(result).not.toBeNull();
    expect(result!.exp - result!.iat).toBe(90 * 24 * 60 * 60);
  });

  it('buildSessionCookie uses correct Max-Age for rememberMe', () => {
    const request = new Request('http://localhost/api/test');
    const cookie = buildSessionCookie('token', request, getSessionMaxAge(true));
    expect(cookie).toContain(`Max-Age=${90 * 24 * 60 * 60}`);
  });
});

describe('session epoch revocation', () => {
  it('sessions without epoch pass when no epoch is set', async () => {
    const secret = 'a'.repeat(64);
    const token = createSessionCookie(secret);
    const result = verifySession(token, secret);
    expect(result).not.toBeNull();
  });

  it('sessions with matching epoch pass', () => {
    const secret = 'a'.repeat(64);
    const epoch = Math.floor(Date.now() / 1000);
    const token = createSessionCookie(secret, false, epoch);
    const result = verifySession(token, secret, epoch);
    expect(result).not.toBeNull();
  });

  it('sessions with epoch newer than required pass', () => {
    const secret = 'a'.repeat(64);
    const oldEpoch = Math.floor(Date.now() / 1000) - 1000;
    const newEpoch = Math.floor(Date.now() / 1000);
    const token = createSessionCookie(secret, false, newEpoch);
    const result = verifySession(token, secret, oldEpoch);
    expect(result).not.toBeNull();
  });

  it('rejects sessions with epoch older than required', () => {
    const secret = 'a'.repeat(64);
    const oldEpoch = Math.floor(Date.now() / 1000) - 1000;
    const newEpoch = Math.floor(Date.now() / 1000);
    const token = createSessionCookie(secret, false, oldEpoch);
    const result = verifySession(token, secret, newEpoch);
    expect(result).toBeNull();
  });

  it('rejects sessions without epoch when epoch is required', () => {
    const secret = 'a'.repeat(64);
    const epoch = Math.floor(Date.now() / 1000);
    const token = createSessionCookie(secret); // no epoch
    const result = verifySession(token, secret, epoch);
    expect(result).toBeNull();
  });

  it('revokeAllSessions bumps the epoch in auth state', async () => {
    await setPassword('testpassword123');
    clearAuthCache();

    const stateBefore = await readAuthState();
    expect(stateBefore.sessionEpoch).toBeUndefined();

    await revokeAllSessions();
    clearAuthCache();

    const stateAfter = await readAuthState();
    expect(stateAfter.sessionEpoch).toBeDefined();
    expect(stateAfter.sessionEpoch).toBeGreaterThan(0);
    // Other state should be preserved
    expect(stateAfter.passwordHash).toBe(stateBefore.passwordHash);
    expect(stateAfter.cookieSecret).toBe(stateBefore.cookieSecret);
    expect(stateAfter.displayToken).toBe(stateBefore.displayToken);
  });

  it('revokeAllSessions invalidates existing sessions via requireSession', async () => {
    const sessionToken = await setPassword('testpassword123');
    clearAuthCache();

    // Session should work before revocation
    const request1 = new Request('http://localhost/api/test', {
      headers: { cookie: `hs-session=${sessionToken}` },
    });
    await expect(requireSession(request1)).resolves.toBeUndefined();

    // Revoke all sessions
    await revokeAllSessions();
    clearAuthCache();

    // Same session should now be rejected
    const request2 = new Request('http://localhost/api/test', {
      headers: { cookie: `hs-session=${sessionToken}` },
    });
    try {
      await requireSession(request2);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      expect((err as Response).status).toBe(401);
    }
  });

  it('setPassword preserves sessionEpoch', async () => {
    await setPassword('password1');
    await revokeAllSessions();
    clearAuthCache();

    const epochBefore = (await readAuthState()).sessionEpoch;
    expect(epochBefore).toBeDefined();

    await setPassword('password2');
    clearAuthCache();

    const epochAfter = (await readAuthState()).sessionEpoch;
    expect(epochAfter).toBe(epochBefore);
  });
});

describe('getIpAllowlistConfig', () => {
  it('returns empty defaults when no config exists', async () => {
    const config = await getIpAllowlistConfig();
    expect(config).toEqual({ allowlist: [], bypassAuth: false, restrictAccess: false });
  });

  it('persists allowlist config and reads it back', async () => {
    await setIpAllowlistConfig({
      allowlist: ['192.168.1.0/24', '10.0.0.0/8'],
      bypassAuth: true,
      restrictAccess: false,
    });
    const config = await getIpAllowlistConfig();
    expect(config).toEqual({
      allowlist: ['192.168.1.0/24', '10.0.0.0/8'],
      bypassAuth: true,
      restrictAccess: false,
    });
  });

  it('preserves existing auth state when setting allowlist', async () => {
    await setPassword('testpassword123');
    await setIpAllowlistConfig({
      allowlist: ['192.168.1.0/24'],
      bypassAuth: true,
      restrictAccess: true,
    });
    // Verify auth state still works
    expect(await isAuthEnabled()).toBe(true);
    expect(await verifyPassword('testpassword123')).toBe(true);
    // Verify allowlist was saved
    const config = await getIpAllowlistConfig();
    expect(config.allowlist).toEqual(['192.168.1.0/24']);
  });
});
