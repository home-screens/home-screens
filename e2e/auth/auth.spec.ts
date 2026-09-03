import { test, expect } from '../fixtures';
import { writeSandboxFile } from '../helpers/sandbox';

const PASSWORD = 'e2e-password-123';
const SECURITY_URL = '/editor/settings?section=defaults&page=security';

// Direct-to-disk disabled auth state (mirrors enforcement.spec.ts). Both the
// proxy IP/auth gate and the auth-state reader cache auth.json for 5s, so the
// teardown writes this then polls until the caches expire.
const DISABLED_AUTH = { passwordHash: null, salt: null, cookieSecret: null, displayToken: null };

test.describe.configure({ mode: 'serial' });

// This file enables a password partway through and never turns it back off on
// its own, so restore the no-auth baseline for any spec that reuses this
// worker's server (the `server` worker fixture is shared across spec files).
test.afterAll(async ({ server, playwright }) => {
  writeSandboxFile(server.sandboxDir, 'auth.json', DISABLED_AUTH);
  const ctx = await playwright.request.newContext({ baseURL: server.baseURL });
  await expect
    .poll(
      async () => {
        const { authEnabled } = await (await ctx.get('/api/auth/status')).json();
        return authEnabled;
      },
      { timeout: 15_000, intervals: [400] },
    )
    .toBe(false);
  await ctx.dispose();
});

test('with auth disabled, /login bounces to /editor', async ({ page }) => {
  await page.goto('/login');
  await page.waitForURL('**/editor');
});

test('enable a password via the API', async ({ request }) => {
  const res = await request.post('/api/auth/password', { data: { newPassword: PASSWORD } });
  expect(res.ok()).toBe(true);
  const status = await (await request.get('/api/auth/status')).json();
  expect(status.authEnabled).toBe(true);
});

/**
 * The login page's translations are inlined by the (auth) layout's
 * `buildLocaleBlob`, not fetched after mount. Blocking /api/i18n leaves the
 * blob as the only possible source, so localized copy appearing here proves
 * it arrived with the document.
 *
 * This matters more on /login than anywhere else: `translate()` returns the
 * key on a miss, and while the page is checking auth its entire content is
 * one string — a post-mount fetch renders a blank screen with the literal
 * `login.checkingAuth` centered on it.
 */
test('login renders localized copy with no i18n fetch available', async ({ page }) => {
  await page.route('**/api/i18n/**', (route) => route.abort());
  // Hold the status check open so the page stays in its checking branch long
  // enough to assert on — that branch is where a missing dictionary shows.
  await page.route('**/api/auth/status', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });

  await page.goto('/login');
  await expect(page.getByText('Checking authentication…')).toBeVisible();
  await expect(page.getByText('login.checkingAuth')).toHaveCount(0);

  // And the form itself, once the status check resolves.
  await expect(page.getByText('Enter your password to continue')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('login.');
});

test('rememberMe:true issues a 90-day session cookie', async ({ request }) => {
  // The login route picks SESSION_REMEMBER_ME_AGE (90d) vs SESSION_MAX_AGE (30d)
  // off the rememberMe flag and stamps it as the Set-Cookie Max-Age. A correct
  // password also clears the rate limiter for this IP, so this can't poison the
  // shared peer bucket the way a failed attempt would.
  const res = await request.post('/api/auth/login', { data: { password: PASSWORD, rememberMe: true } });
  expect(res.ok()).toBe(true);
  const setCookie = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value)
    .join('\n');
  expect(setCookie).toMatch(/hs-session=/);
  const maxAge = Number(/Max-Age=(\d+)/.exec(setCookie)?.[1]);
  expect(maxAge).toBe(90 * 24 * 60 * 60); // 7776000
});

test('rememberMe:false issues the shorter 30-day session cookie', async ({ request }) => {
  const res = await request.post('/api/auth/login', { data: { password: PASSWORD, rememberMe: false } });
  expect(res.ok()).toBe(true);
  const setCookie = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value)
    .join('\n');
  const maxAge = Number(/Max-Age=(\d+)/.exec(setCookie)?.[1]);
  expect(maxAge).toBe(30 * 24 * 60 * 60); // 2592000
});

test('a tampered session cookie is rejected and bounces to /login', async ({ page, context, baseURL }) => {
  // Sessions are HMAC-signed with the server's cookieSecret, which the spec can't
  // read, so a genuinely-expired-but-valid cookie can't be forged here. The
  // reachable equivalent: a cookie whose signature doesn't verify must be treated
  // exactly like no session — verifySession returns null, the editor's config
  // fetch 401s, and editorFetch bounces to /login.
  await context.addCookies([
    { name: 'hs-session', value: 'Zm9yZ2Vk.bm90LWEtdmFsaWQtc2ln', url: baseURL },
  ]);
  await page.goto('/editor');
  await page.waitForURL('**/login**');
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('editor redirects to login when signed out', async ({ page }) => {
  // Fresh page context has no hs-session cookie; the editor's own config
  // fetch 401s and editorFetch redirects to /login?from=...
  await page.goto('/editor');
  await page.waitForURL('**/login**');
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('remote redirects to login when signed out', async ({ page }) => {
  // Same proxy page gate as /editor (src/proxy.ts isProtectedRoute matches
  // /editor and /remote). Fresh context = no hs-session cookie, so the proxy
  // 307s the page to /login?from=/remote.
  await page.goto('/remote');
  await page.waitForURL('**/login**');
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('the display page still renders when signed out', async ({ page }) => {
  // Page-level exemption: the proxy gates /editor and /remote but NOT /display,
  // and GET /api/config is unauthenticated, so the kiosk view keeps rendering
  // with no session. (The display *API* — /api/display/* — is token-gated; that
  // enforcement lives in enforcement.spec.ts.) The server booted with the
  // default baseConfig screen, whose text module reads "E2E HOME SCREEN".
  await page.goto('/display');
  await expect(page.getByText('E2E HOME SCREEN')).toBeVisible();
  expect(page.url()).toContain('/display');
});

test('wrong password stays on login and says so in plain words', async ({ page }) => {
  await page.goto('/login');
  const rejected = page.waitForResponse(
    (r) => r.url().includes('/api/auth/login') && r.status() === 401,
  );
  await page.locator('input[type="password"]').fill('wrong-password');
  await page.locator('input[type="password"]').press('Enter');
  await rejected;
  expect(page.url()).toContain('/login');
  // Translated client-side from the response `code`, not the route's English
  // `error` string.
  await expect(page.getByText("That password isn't right.")).toBeVisible();
});

test('login offers a way back in when the password is forgotten', async ({ page }) => {
  await page.goto('/login');
  await page.getByText('Forgot the password?').click();
  await expect(page.getByText('home-screens-reset-password')).toBeVisible();
  await expect(page.getByText(/data\/auth\.json/)).toBeVisible();
});

test('correct password lands in the editor with a session cookie', async ({ page, context }) => {
  await page.goto('/login');
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('input[type="password"]').press('Enter');
  await page.waitForURL('**/editor');
  const cookies = await context.cookies();
  expect(cookies.some((c) => c.name === 'hs-session')).toBe(true);
  // The editor actually works: its config fetch is authorized by the cookie
  await expect(page.getByRole('heading', { name: 'Modules' })).toBeVisible();
});

test('the kid chores page stays open with auth enabled', async ({ page }) => {
  await page.goto('/chores');
  await page.waitForTimeout(1500); // give any misguided redirect a chance to fire
  expect(page.url()).toContain('/chores');
});

test('logging out from the Security page clears the session and re-gates the editor', async ({ page }) => {
  // Sign in so this context holds a live hs-session cookie.
  await page.goto('/login');
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('input[type="password"]').press('Enter');
  await page.waitForURL('**/editor');

  // The Security page's Log Out button (SecuritySection handleLogout) POSTs
  // /api/auth/logout to clear the cookie, then hard-navigates to /login.
  await page.goto(SECURITY_URL);
  const loggedOut = page.waitForResponse(
    (r) => r.url().includes('/api/auth/logout') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  expect((await loggedOut).ok()).toBe(true);
  await page.waitForURL('**/login**');

  // Session gone: re-entering the editor bounces back to /login.
  await page.goto('/editor');
  await page.waitForURL('**/login**');
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('login rate limiter returns 429 after repeated failures (must run last)', async ({ playwright, server }) => {
  const ctx = await playwright.request.newContext({ baseURL: server.baseURL });
  // Bucket the failures under a fake X-Forwarded-For IP (TEST-NET-3, reserved).
  // The e2e server trusts the loopback proxy (HS_TRUSTED_PROXIES in server.ts),
  // so the login limiter keys on this IP instead of the real 127.0.0.1 peer —
  // leaving the shared peer bucket clean for enforcement.spec.ts, which reuses
  // this worker's server and would otherwise be 429'd here (the limiter's 15min
  // window has no in-band reset once tripped).
  const headers = { 'x-forwarded-for': '203.0.113.7' };
  let limited: { code?: string; retryAfterSeconds?: number } | null = null;
  // The allowance is 10 tries; loop past it so the test does not encode the
  // exact number, only that a wall exists and says how long it lasts.
  for (let i = 0; i < 14; i++) {
    const res = await ctx.post('/api/auth/login', { headers, data: { password: 'definitely-wrong' } });
    if (res.status() === 429) { limited = await res.json(); break; }
    expect(res.status()).toBe(401);
  }
  expect(limited).not.toBeNull();
  // The login page needs both to render "wait 15 minutes" in the household's
  // own language rather than the route's English string.
  expect(limited?.code).toBe('rate_limited');
  expect(limited?.retryAfterSeconds).toBeGreaterThan(0);
  await ctx.dispose();
});
