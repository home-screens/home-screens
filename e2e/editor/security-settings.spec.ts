import { test, expect } from '../fixtures';

// The Security defaults page drives a stateful auth lifecycle: set a password
// (enables auth + auto-generates a display token) -> log in and change it ->
// reveal/regenerate the display token -> add an IP allowlist entry -> disable
// auth again. Each step depends on server-side auth.json state left by the
// previous one, so the file runs serially in a single worker. Browser cookies
// are function-scoped (fresh context per test), which is why every test after
// the first re-logs-in.
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'e2e-security-page-pw';
const NEW_PASSWORD = 'e2e-security-page-pw-2';

const SECURITY_URL = '/editor/settings?section=defaults&page=security';

// The PasswordModal is the only dialog the Security page opens, so this scopes
// the modal's submit button away from the section-level trigger button that
// shares its accessible name.
function passwordModal(page: import('@playwright/test').Page) {
  return page.getByRole('dialog');
}

async function login(page: import('@playwright/test').Page, password: string) {
  await page.goto('/login');
  await page.locator('input[type="password"]').fill(password);
  await page.locator('input[type="password"]').press('Enter');
  await page.waitForURL('**/editor');
}

test('setting a password from the Security page enables auth and shows a display token', async ({ page }) => {
  await page.goto(SECURITY_URL);

  // Section-level trigger (unique while the modal is closed).
  await page.getByRole('button', { name: 'Set a password' }).click();

  const modal = passwordModal(page);
  await modal.getByPlaceholder('New password (min 8 characters)').fill(PASSWORD);
  await modal.getByPlaceholder('Confirm new password').fill(PASSWORD);
  await modal.getByRole('button', { name: 'Turn it on', exact: true }).click();

  // Status flips as soon as the POST succeeds.
  await expect(page.getByText('Password is on')).toBeVisible();
  // The display token, signed-in devices and the IP allowlist live under one
  // "Advanced network access" disclosure: the page leads with what the
  // password covers, not with network administration.
  await page.getByText('Advanced network access').click();
  await expect(page.getByRole('button', { name: 'Reveal' })).toBeVisible();
});

test('logging in and changing the password works end to end', async ({ page, context }) => {
  await login(page, PASSWORD);
  expect((await context.cookies()).some((c) => c.name === 'hs-session')).toBe(true);

  await page.goto(SECURITY_URL);
  await page.getByRole('button', { name: 'Change password' }).click();

  const modal = passwordModal(page);
  await modal.getByPlaceholder('Current password').fill(PASSWORD);
  await modal.getByPlaceholder('New password (min 8 characters)').fill(NEW_PASSWORD);
  await modal.getByPlaceholder('Confirm new password').fill(NEW_PASSWORD);
  await modal.getByRole('button', { name: 'Change Password', exact: true }).click();

  await expect(page.getByText(/changed/i)).toBeVisible();
});

test('the display token can be revealed and regenerated', async ({ page }) => {
  await login(page, NEW_PASSWORD);
  await page.goto(SECURITY_URL);

  await page.getByText('Advanced network access').click();
  // The token <code> uniquely carries the `select-all` class.
  const tokenCode = page.locator('code.select-all');
  await expect(tokenCode).toBeVisible();

  await page.getByRole('button', { name: 'Reveal' }).click();
  const before = await tokenCode.innerText();

  await page.getByRole('button', { name: 'Make a new key' }).click();
  // The confirm button reads "Confirm" (not "Regenerate"); it's the only
  // Confirm on screen since session-revocation confirm isn't triggered.
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();

  await expect
    .poll(async () => tokenCode.innerText())
    .not.toBe(before);
});

test('the IP allowlist rejects a malformed entry with an inline error', async ({ page }) => {
  await login(page, NEW_PASSWORD);
  await page.goto(SECURITY_URL);

  // The allowlist sits under the "Advanced network access" disclosure.
  await page.getByText('Advanced network access').click();
  const entryInput = page.getByPlaceholder('192.168.1.0/24');
  await expect(entryInput).toBeVisible();

  // A value that fails the dotted-quad shape → "That isn't an address". The bad
  // entry is never added to the list, so nothing gets saved.
  await entryInput.fill('not-an-ip');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText("That isn't an address")).toBeVisible();
  await expect(page.getByText('not-an-ip')).toHaveCount(0);

  // A valid IP with an out-of-range prefix → the slash-number explanation.
  await entryInput.fill('10.0.0.0/99');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('The number after the slash has to be between 0 and 32.')).toBeVisible();
});

test('the IP allowlist accepts an entry and saves', async ({ page }) => {
  await login(page, NEW_PASSWORD);
  await page.goto(SECURITY_URL);

  await page.getByText('Advanced network access').click();

  const entryInput = page.getByPlaceholder('192.168.1.0/24');
  await expect(entryInput).toBeVisible();
  await entryInput.fill('10.0.0.0/24');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('10.0.0.0/24')).toBeVisible();

  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/auth/ip-allowlist') && r.request().method() === 'PUT',
  );
  // Save button appears only once the list is dirty; label is "Save Changes".
  await page.getByRole('button', { name: /^Save/ }).click();
  const res = await saved;
  expect(res.ok()).toBe(true);
});

test('disabling auth from the Security page removes the login gate', async ({ page, context }) => {
  await login(page, NEW_PASSWORD);
  await page.goto(SECURITY_URL);

  // Section trigger says what it does to the password; the modal submit is
  // still the short "Disable".
  await page.getByRole('button', { name: 'Turn the password off' }).click();

  const modal = passwordModal(page);
  await modal.getByPlaceholder('Current password').fill(NEW_PASSWORD);
  await modal.getByRole('button', { name: 'Disable', exact: true }).click();

  await expect(page.getByText('No password yet')).toBeVisible();

  // With auth off, the editor loads without bouncing to /login even with no session.
  await context.clearCookies();
  await page.goto('/editor');
  await expect(page.getByRole('heading', { name: 'Modules' })).toBeVisible();
  await expect(page).not.toHaveURL(/\/login/);
});
