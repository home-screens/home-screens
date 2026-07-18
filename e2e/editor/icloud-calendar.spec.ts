import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig } from '../helpers/config-fixtures';
import { autosaved } from '../helpers/editor';

/**
 * Defaults › Calendar — iCloud Calendar section (ICloudCalendarManager).
 *
 * Everything the section does goes through browser-side calls to
 * /api/icloud/accounts and /api/icloud/calendars, so page.route stubs the
 * iCloud plumbing at the browser boundary: no real credentials exist in the
 * sandbox and the server never dials caldav.icloud.com. Config persistence
 * (the autosave PUT and what lands in icloudSources) is real.
 */

const ACCOUNT = { id: 'acct-1', appleId: 'family@icloud.com' };

const CALENDAR_LISTING = {
  calendars: [
    { url: 'https://caldav.icloud.com/1/calendars/family/', name: 'Family', color: '#FF2D55' },
    { url: 'https://caldav.icloud.com/1/calendars/school/', name: 'School', color: null },
  ],
  birthdaysAvailable: true,
};

/** Stub the accounts + discovery endpoints for a connected-account session. */
async function stubConnectedAccount(page: Page): Promise<void> {
  await page.route('**/api/icloud/accounts*', (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([ACCOUNT]) });
    }
    if (method === 'DELETE') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    return route.continue();
  });
  await page.route('**/api/icloud/calendars*', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(CALENDAR_LISTING) }),
  );
}

test('Defaults › Calendar: iCloud connect rejection shows the app-password message', async ({ page, request }) => {
  await putConfig(request, baseConfig());

  const rejection = "Couldn't sign in to iCloud. Double-check the Apple ID, and make sure the password is an app password created at account.apple.com; your regular Apple password won't work here.";
  await page.route('**/api/icloud/accounts*', (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (method === 'POST') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: rejection }),
      });
    }
    return route.continue();
  });

  await page.goto('/editor/settings?section=defaults&page=calendar');
  await expect(page.getByRole('heading', { name: 'iCloud Calendar' })).toBeVisible();

  await page.getByRole('button', { name: 'Add iCloud account' }).click();
  await page.getByPlaceholder('Apple ID email').fill('someone@icloud.com');
  await page.getByPlaceholder('xxxx-xxxx-xxxx-xxxx').fill('not-an-app-password');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();

  // The rejection renders inline in the form (a 401 here would instead
  // bounce the editor to /login via editorFetch — the regression this guards).
  await expect(page.getByText(rejection)).toBeVisible();
  expect(page.url()).not.toContain('/login');

  // Cancel resets back to the add button
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Add iCloud account' })).toBeVisible();
});

test('Defaults › Calendar: picking iCloud calendars and birthdays persists sources', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await stubConnectedAccount(page);

  await page.goto('/editor/settings?section=defaults&page=calendar');
  await expect(page.getByText(ACCOUNT.appleId)).toBeVisible();

  const familyRow = page.locator('label', { hasText: 'Family' });
  const birthdaysRow = page.locator('label', { hasText: 'Birthdays' });

  await autosaved(page, async () => {
    await familyRow.getByRole('checkbox').check();
    await birthdaysRow.getByRole('checkbox').check();
  });

  await expect
    .poll(async () => {
      const sources = (await getConfig(request)).settings.calendar.icloudSources ?? [];
      return sources.map((s) => `${s.kind}:${s.name}:${s.color}`).sort();
    })
    .toEqual(['birthdays:Birthdays:#f97316', 'calendar:Family:#FF2D55']);

  // Unchecking removes the source row from config
  await autosaved(page, async () => {
    await familyRow.getByRole('checkbox').uncheck();
  });
  await expect
    .poll(async () => ((await getConfig(request)).settings.calendar.icloudSources ?? []).map((s) => s.kind))
    .toEqual(['birthdays']);
});

test('Defaults › Calendar: disconnecting an iCloud account strips its sources', async ({ page, request }) => {
  const config = baseConfig();
  config.settings.calendar.icloudSources = [
    {
      id: 'src-1',
      accountId: ACCOUNT.id,
      kind: 'calendar',
      url: 'https://caldav.icloud.com/1/calendars/family/',
      name: 'Family',
      color: '#FF2D55',
      enabled: true,
    },
  ];
  await putConfig(request, config);
  await stubConnectedAccount(page);

  await page.goto('/editor/settings?section=defaults&page=calendar');
  // The pre-seeded source shows as a checked box for its calendar
  await expect(page.locator('label', { hasText: 'Family' }).getByRole('checkbox')).toBeChecked();

  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Disconnect' }).click();
  });

  await expect
    .poll(async () => ((await getConfig(request)).settings.calendar.icloudSources ?? []).length)
    .toBe(0);
  await expect(page.getByRole('button', { name: 'Add iCloud account' })).toBeVisible();
});
