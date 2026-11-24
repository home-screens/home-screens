import { test, expect } from '../fixtures';
import { writeSandboxFile } from '../helpers/sandbox';
import type { APIRequestContext } from '@playwright/test';

// Who may show the wall on a hub with a password. The display key used to be
// written into every /display page, so any browser on the network could read
// it; a wall now holds its own cookie, given only to a wall that was let in.
//
// The test server is reached over localhost, which the hub treats as its own
// screen. A visitor from elsewhere on the network is played by sending
// `X-Forwarded-For`: a request from the hub's address that carries a
// forwarding header is not the hub's own screen.

const PASSWORD = 'e2e-walls-pw-123';
const DISABLED_AUTH = { passwordHash: null, salt: null, cookieSecret: null, displayToken: null };
/** No changeover window: this hub has nothing to move over. */
const NO_WALLS = { version: 1, windowStartedAt: null, windowAdmissions: {}, walls: [] };
const VISITOR = { 'x-forwarded-for': '203.0.113.9' };
const WALL_PAGE = { 'x-hs-wall': '1' };

test.use({ isolateFamily: false });
test.describe.configure({ mode: 'serial' });

async function resetAuth(sandboxDir: string, ctx: APIRequestContext): Promise<void> {
  writeSandboxFile(sandboxDir, 'auth.json', DISABLED_AUTH);
  writeSandboxFile(sandboxDir, 'display-walls.json', NO_WALLS);
  await expect
    .poll(async () => (await (await ctx.get('/api/auth/status')).json()).authEnabled, { timeout: 15_000, intervals: [400] })
    .toBe(false);
}

test.beforeAll(async ({ server, playwright }) => {
  const ctx = await playwright.request.newContext({ baseURL: server.baseURL });
  await resetAuth(server.sandboxDir, ctx);
  expect((await ctx.post('/api/auth/password', { data: { newPassword: PASSWORD } })).ok()).toBe(true);
  await ctx.dispose();
});

test.afterAll(async ({ server, playwright }) => {
  const ctx = await playwright.request.newContext({ baseURL: server.baseURL });
  await resetAuth(server.sandboxDir, ctx);
  await ctx.dispose();
});

async function signedIn(playwright: { request: { newContext: (o: object) => Promise<APIRequestContext> } }, baseURL: string | undefined) {
  const admin = await playwright.request.newContext({ baseURL });
  expect((await admin.post('/api/auth/login', { data: { password: PASSWORD } })).ok()).toBe(true);
  return admin;
}

test('a visitor gets neither the display key nor the layout from the wall page', async ({ browser, playwright, baseURL }) => {
  const admin = await signedIn(playwright, baseURL);
  const { displayToken } = await (await admin.get('/api/auth/display-token')).json();
  await admin.dispose();

  const context = await browser.newContext({ baseURL, extraHTTPHeaders: VISITOR });
  const page = await context.newPage();
  const response = await page.goto('/display');
  const html = await response!.text();
  expect(html).not.toContain(displayToken);
  expect(html).not.toMatch(/"modules":/);

  // The visitor is told what to do, and offered the way in for someone only looking.
  await expect(page.getByRole('heading', { name: 'This wall needs to be let in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Just looking? Sign in' })).toHaveAttribute('href', /\/login\?from=%2Fdisplay/);

  // Its cookie opens nothing while it waits.
  expect((await page.request.get('/api/config')).status()).toBe(401);
  await context.close();
});

test('a waiting wall is let in by a grown-up, and only that one', async ({ playwright, baseURL }) => {
  const kitchen = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { ...VISITOR, ...WALL_PAGE } });
  const other = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.10', ...WALL_PAGE } });

  const asked = await kitchen.post('/api/display/claim', { data: { width: 1080, height: 1920 } });
  expect(await asked.json()).toEqual({ status: 'waiting' });
  expect(asked.headers()['set-cookie']).toMatch(/hs-display=.+HttpOnly.+SameSite=Lax/);
  expect(await (await other.post('/api/display/claim', { data: { width: 390, height: 844 } })).json()).toEqual({ status: 'waiting' });
  expect((await kitchen.get('/api/config')).status()).toBe(401);

  const admin = await signedIn(playwright, baseURL);
  const { walls } = await (await admin.get('/api/display/walls')).json();
  const waiting = walls.filter((w: { status: string }) => w.status === 'waiting');
  const row = waiting.find((w: { viewport: { width: number } | null }) => w.viewport?.width === 1080);
  expect(row).toBeTruthy();
  expect(JSON.stringify(walls)).not.toContain('secretHash');
  expect((await admin.post('/api/display/walls', { data: { action: 'let-in', id: row.id } })).ok()).toBe(true);

  // The wall that was picked is in, on its next ask and on every wall route.
  expect(await (await kitchen.post('/api/display/claim', { data: {} })).json()).toEqual({ status: 'in' });
  expect((await kitchen.get('/api/config')).status()).toBe(200);
  expect((await kitchen.get('/api/display/commands')).status()).toBe(200);
  // The other one asked for the same display and still waits.
  expect((await other.get('/api/config')).status()).toBe(401);

  // A wall is not the editor.
  expect((await kitchen.get('/api/auth/display-token')).status()).toBe(401);
  expect((await kitchen.get('/api/display/walls')).status()).toBe(401);
  expect((await kitchen.put('/api/config', { data: {} })).status()).toBe(401);

  // Removed: refused on its very next request.
  expect((await admin.delete(`/api/display/walls?id=${row.id}`)).ok()).toBe(true);
  expect((await kitchen.get('/api/config')).status()).toBe(401);
  expect((await admin.delete(`/api/display/walls?id=${row.id}`)).status()).toBe(404);

  await Promise.all([kitchen.dispose(), other.dispose(), admin.dispose()]);
});

test('a waiting browser cannot let itself in by first asking under a made-up name', async ({ playwright, baseURL }) => {
  // A wall that asks under a name the hub does not know is let in when a
  // grown-up adds that display. Asking again as a display the hub already
  // has must not carry that over: nobody added anything.
  const visitor = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.20', ...WALL_PAGE } });
  expect(await (await visitor.post('/api/display/claim', { data: { displayId: 'made-up-name' } })).json()).toEqual({ status: 'waiting' });
  for (const body of [{ displayId: 'main' }, { displayId: 'main' }, {}, {}, { displayId: 'made-up-name' }, {}]) {
    expect(await (await visitor.post('/api/display/claim', { data: body })).json(), JSON.stringify(body)).toEqual({ status: 'waiting' });
  }
  expect((await visitor.get('/api/config')).status()).toBe(401);
  expect((await visitor.get('/api/display/commands')).status()).toBe(401);
  await visitor.dispose();
});

test('a grown-up lets a waiting display in from Settings > Displays', async ({ page, playwright, baseURL }) => {
  // The waiting page sends the household to Settings > Displays, so the
  // button has to be there: this goes through the editor, not the API.
  const tablet = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: {
      'x-forwarded-for': '203.0.113.30',
      ...WALL_PAGE,
      'user-agent': 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    },
  });
  expect(await (await tablet.post('/api/display/claim', { data: { width: 820, height: 1180 } })).json()).toEqual({ status: 'waiting' });

  await page.goto('/login');
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('input[type="password"]').press('Enter');
  await page.waitForURL('**/editor');
  await page.goto('/editor/settings?section=displays');

  const row = page.locator('[data-testid^="waiting-wall-"]', { hasText: 'Safari on an iPad' });
  await expect(row).toContainText('820×1180');
  await row.getByRole('button', { name: 'Let in' }).click();
  await expect(row).toHaveCount(0);
  expect((await tablet.get('/api/config')).status()).toBe(200);

  // It is now listed as showing, and Remove sends it back to waiting.
  const shown = page.locator('[data-testid="walls-block"] [data-testid^="wall-"]', { hasText: 'Safari on an iPad' });
  await expect(shown).toBeVisible();
  await shown.getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(shown).toHaveCount(0);
  expect((await tablet.get('/api/config')).status()).toBe(401);
  await tablet.dispose();
});

test('made-up cookies and headers open nothing', async ({ playwright, baseURL }) => {
  for (const cookie of ['hs-display=garbage', 'hs-display=abc.def', 'hs-display=.']) {
    const ctx = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { ...VISITOR, cookie } });
    expect((await ctx.get('/api/config')).status(), cookie).toBe(401);
    expect((await ctx.get('/api/display/commands')).status(), cookie).toBe(401);
    await ctx.dispose();
  }
  // Headers a caller can write by hand do not make it the hub's own screen.
  const forged = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { ...VISITOR, ...WALL_PAGE, 'x-real-ip': '127.0.0.1', 'x-hs-client-ip': '127.0.0.1', 'x-hs-forwarded': '0', referer: `${baseURL}/display` },
  });
  expect(await (await forged.post('/api/display/claim', { data: {} })).json()).toEqual({ status: 'waiting' });
  await forged.dispose();

  // Something that is not a wall page cannot ask at all.
  const script = await playwright.request.newContext({ baseURL, extraHTTPHeaders: VISITOR });
  expect((await script.post('/api/display/claim', { data: {} })).status()).toBe(400);
  await script.dispose();
});

test('the hub\'s own screen is let in without asking', async ({ page }) => {
  // No forwarding header: this is the screen plugged into the hub.
  await page.goto('/display');
  await expect(page.getByRole('heading', { name: 'This wall needs to be let in' })).toHaveCount(0);
  await expect.poll(async () => (await page.request.get('/api/config')).status(), { timeout: 15_000 }).toBe(200);
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'hs-display')?.httpOnly).toBe(true);
});

test('a signed-in grown-up can keep a browser as a wall, and only on purpose', async ({ playwright, baseURL }) => {
  const admin = await playwright.request.newContext({ baseURL, extraHTTPHeaders: VISITOR });
  expect((await admin.post('/api/auth/login', { data: { password: PASSWORD } })).ok()).toBe(true);

  // Looking at the wall while signed in makes no wall.
  const before = (await (await admin.get('/api/display/walls')).json()).walls.length;
  expect((await admin.get('/api/display/commands', { headers: { referer: `${baseURL}/display` } })).status()).toBe(200);
  expect((await (await admin.get('/api/display/walls')).json()).walls.length).toBe(before);

  // Keeping it does, and it then works with no sign-in at all.
  const kept = await admin.post('/api/display/walls/keep', { data: { width: 1280, height: 800 } });
  expect(kept.ok()).toBe(true);
  const cookie = kept.headers()['set-cookie'].split(';')[0];
  const wall = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { ...VISITOR, cookie } });
  expect((await wall.get('/api/config')).status()).toBe(200);

  // Without a sign-in there is nothing to keep.
  const anon = await playwright.request.newContext({ baseURL, extraHTTPHeaders: VISITOR });
  expect((await anon.post('/api/display/walls/keep', { data: {} })).status()).toBe(401);
  await Promise.all([admin.dispose(), wall.dispose(), anon.dispose()]);
});

test('an automation polling with the display key is never made a wall', async ({ playwright, baseURL }) => {
  const admin = await signedIn(playwright, baseURL);
  const { displayToken } = await (await admin.get('/api/auth/display-token')).json();
  const before = (await (await admin.get('/api/display/walls')).json()).walls.length;

  const automation = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { ...VISITOR, authorization: `Bearer ${displayToken}` } });
  const polled = await automation.get('/api/display/commands?display=main');
  expect(polled.status()).toBe(200);
  expect(polled.headers()['set-cookie']).toBeUndefined();
  expect((await (await admin.get('/api/display/walls')).json()).walls.length).toBe(before);
  await Promise.all([admin.dispose(), automation.dispose()]);
});
