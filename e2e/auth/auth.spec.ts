import { test, expect } from '../fixtures';

const PASSWORD = 'e2e-password-123';

test.describe.configure({ mode: 'serial' });

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

test('editor redirects to login when signed out', async ({ page }) => {
  // Fresh page context has no hs-session cookie; the editor's own config
  // fetch 401s and editorFetch redirects to /login?from=...
  await page.goto('/editor');
  await page.waitForURL('**/login**');
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('wrong password stays on login with a 401', async ({ page }) => {
  await page.goto('/login');
  const rejected = page.waitForResponse(
    (r) => r.url().includes('/api/auth/login') && r.status() === 401,
  );
  await page.locator('input[type="password"]').fill('wrong-password');
  await page.locator('input[type="password"]').press('Enter');
  await rejected;
  expect(page.url()).toContain('/login');
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

test('login rate limiter returns 429 after repeated failures (must run last)', async ({ playwright, server }) => {
  const ctx = await playwright.request.newContext({ baseURL: server.baseURL });
  let sawTooMany = false;
  for (let i = 0; i < 8; i++) {
    const res = await ctx.post('/api/auth/login', { data: { password: 'definitely-wrong' } });
    if (res.status() === 429) { sawTooMany = true; break; }
    expect(res.status()).toBe(401);
  }
  expect(sawTooMany).toBe(true);
  await ctx.dispose();
});
