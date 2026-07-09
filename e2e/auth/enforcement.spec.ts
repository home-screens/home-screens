import { test, expect } from '../fixtures';
import { writeSandboxFile } from '../helpers/sandbox';
import type { APIRequestContext } from '@playwright/test';

// Enforcement, not UI: the editor's security-settings spec drives the panels;
// this proves the gates actually bite — revoked cookies stop working, a
// disallowed IP is 403'd, and display routes reject a bad token.
//
// Runs serially on one worker server. Because the `server` worker fixture is
// shared across spec files, the flow both resets to a known-disabled state up
// front (independence from whatever ran earlier) and guarantees it never hands
// off a locked-out server (afterAll reset).

const PASSWORD = 'e2e-enforce-pw-123';

// Direct-to-disk disabled auth state. Both the proxy IP gate (src/proxy.ts) and
// the auth-state reader (src/lib/auth.ts) cache auth.json for 5s, and only the
// in-process writeAuthState() busts the auth cache — a bare file write does not
// — so callers must poll until both caches expire before trusting new state.
const DISABLED_AUTH = { passwordHash: null, salt: null, cookieSecret: null, displayToken: null };

test.describe.configure({ mode: 'serial' });

/**
 * Reset auth to disabled + unrestricted, then wait out the proxy + auth caches.
 * `/api/displays` is the IP-gate probe (403 while restricted, reachable once the
 * gate reopens); `/api/auth/status` is always exempt and reports auth-enabled.
 */
async function resetAuth(sandboxDir: string, ctx: APIRequestContext): Promise<void> {
  writeSandboxFile(sandboxDir, 'auth.json', DISABLED_AUTH);
  await expect
    .poll(
      async () => {
        const status = await ctx.get('/api/auth/status');
        const { authEnabled } = await status.json();
        const gate = await ctx.get('/api/displays');
        return authEnabled === false && gate.status() !== 403;
      },
      { timeout: 15_000, intervals: [400] },
    )
    .toBe(true);
}

test.beforeAll(async ({ server, playwright }) => {
  const ctx = await playwright.request.newContext({ baseURL: server.baseURL });
  await resetAuth(server.sandboxDir, ctx);
  await ctx.dispose();
});

test.afterAll(async ({ server, playwright }) => {
  const ctx = await playwright.request.newContext({ baseURL: server.baseURL });
  await resetAuth(server.sandboxDir, ctx);
  await ctx.dispose();
});

test('revoking all sessions invalidates an existing session cookie', async ({ playwright, baseURL }) => {
  const ctx = await playwright.request.newContext({ baseURL });

  // Enable auth (disabled → no current password required), then log in so the
  // context holds a real hs-session cookie.
  expect((await ctx.post('/api/auth/password', { data: { newPassword: PASSWORD } })).ok()).toBe(true);
  expect((await ctx.post('/api/auth/login', { data: { password: PASSWORD } })).ok()).toBe(true);

  // The cookie authorizes a session-only route.
  expect((await ctx.get('/api/auth/display-token')).status()).toBe(200);

  // Revoke bumps the session epoch server-side.
  expect((await ctx.post('/api/auth/revoke-sessions')).ok()).toBe(true);

  // The same (now stale) cookie is rejected.
  expect((await ctx.get('/api/auth/display-token')).status()).toBe(401);

  await ctx.dispose();
});

test('revoking all sessions bounces a previously-authed browser to /login', async ({ page }) => {
  // Log in through the UI so the browser context holds a live session cookie.
  await page.goto('/login');
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('input[type="password"]').press('Enter');
  await page.waitForURL('**/editor');
  await expect(page.getByRole('heading', { name: 'Modules' })).toBeVisible();

  // The session epoch has 1-second granularity. This cookie's epoch is whatever
  // the epoch was at login; a cookie is only revoked when its epoch is strictly
  // less than the new one, so the revoke must land in a later second than the
  // login. Wait past the boundary before revoking.
  await page.waitForTimeout(1100);

  // Revoke using the browser's own cookie (page.request shares its cookie jar).
  expect((await page.request.post('/api/auth/revoke-sessions')).ok()).toBe(true);

  // Re-entering the editor now bounces to /login — its config fetch 401s.
  await page.goto('/editor');
  await page.waitForURL('**/login**');
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('display routes require the display token when auth is enabled', async ({ playwright, baseURL }) => {
  // An authed context reads the real display token (session-only route).
  const admin = await playwright.request.newContext({ baseURL });
  expect((await admin.post('/api/auth/login', { data: { password: PASSWORD } })).ok()).toBe(true);
  const tokenRes = await admin.get('/api/auth/display-token');
  expect(tokenRes.status()).toBe(200);
  const { displayToken } = await tokenRes.json();
  expect(typeof displayToken).toBe('string');
  expect(displayToken.length).toBeGreaterThan(0);
  await admin.dispose();

  // A bare context (no cookie, no bearer) is rejected on the polled routes.
  const anon = await playwright.request.newContext({ baseURL });
  expect((await anon.get('/api/display/commands?display=main')).status()).toBe(401);

  // A wrong bearer token is rejected.
  const wrong = await anon.get('/api/display/commands?display=main', {
    headers: { authorization: 'Bearer not-the-real-token' },
  });
  expect(wrong.status()).toBe(401);

  // The correct bearer token is accepted.
  const right = await anon.get('/api/display/commands?display=main', {
    headers: { authorization: `Bearer ${displayToken}` },
  });
  expect(right.status()).toBe(200);

  // A status POST is likewise token-gated: rejected without one...
  expect((await anon.post('/api/display/status?display=main', { data: {} })).status()).toBe(401);
  // ...and clears the auth gate with the token (any non-401 proves it opened;
  // the body itself may still be rejected, which is fine here).
  const postWithToken = await anon.post('/api/display/status?display=main', {
    headers: { authorization: `Bearer ${displayToken}` },
    data: {},
  });
  expect(postWithToken.status()).not.toBe(401);

  await anon.dispose();
});

test('IP allowlist: a lockout is warned, can be forced, and is then enforced', async ({ playwright, baseURL }) => {
  const admin = await playwright.request.newContext({ baseURL });
  expect((await admin.post('/api/auth/login', { data: { password: PASSWORD } })).ok()).toBe(true);

  // Baseline: restriction ON but our own IP (127.0.0.1) is allowed, so we stay
  // reachable. Poll because the proxy's auth-config cache is up to 5s stale.
  expect(
    (await admin.put('/api/auth/ip-allowlist', {
      data: { allowlist: ['127.0.0.1/32'], bypassAuth: false, restrictAccess: true },
    })).ok(),
  ).toBe(true);
  await expect
    .poll(async () => (await admin.get('/api/displays')).status(), { timeout: 12_000 })
    .not.toBe(403);

  // A rule that would exclude our IP is refused without `force` — 409, nothing
  // saved, so we stay reachable.
  const warned = await admin.put('/api/auth/ip-allowlist', {
    data: { allowlist: ['10.0.0.0/24'], bypassAuth: false, restrictAccess: true },
  });
  expect(warned.status()).toBe(409);
  expect((await warned.json()).reason).toBe('your_ip_not_in_allowlist');
  expect((await admin.get('/api/displays')).status()).not.toBe(403);

  // `force: true` overrides the warning and persists the lockout.
  expect(
    (await admin.put('/api/auth/ip-allowlist', {
      data: { allowlist: ['10.0.0.0/24'], bypassAuth: false, restrictAccess: true, force: true },
    })).ok(),
  ).toBe(true);

  // Now our (disallowed) IP is 403'd on protected routes...
  await expect
    .poll(async () => (await admin.get('/api/displays')).status(), { timeout: 12_000 })
    .toBe(403);
  // ...while the login-status escape hatch stays reachable so the UI can explain.
  expect((await admin.get('/api/auth/status')).status()).toBe(200);

  await admin.dispose();
  // afterAll rewrites auth.json to disabled and waits out the caches, restoring
  // reachability for any spec file that reuses this worker's server.
});
