import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { autosaved } from '../helpers/editor';
import { buildModuleInstance } from '../helpers/module-fixtures';

/**
 * The lighter-weight slice of the Defaults settings pages: Calendar (one
 * real field edit), Integrations / Stats (smoke render), Data (backup
 * responds), and the sidebar's docs footer link. These sections are rarely
 * touched relative to Security / Automation / Screen / Location / Meals, so
 * each gets one meaningful assertion rather than the fuller treatment in
 * settings.spec.ts.
 *
 * Selectors here were confirmed against the real section components
 * (ICalFeedManager, IntegrationsSection, DataSection, StatsSection) rather
 * than guessed strings — see the per-test notes where behavior diverged.
 */

test('Defaults › Calendar: adding an iCal feed checks the link, then persists with a badge', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  // Add probes the link server-side (POST /api/calendar/check) before saving;
  // stub the probe at the browser boundary so no real fetch leaves the sandbox.
  await page.route('**/api/calendar/check', (route) => route.fulfill({ json: { ok: true, eventCount: 3 } }));
  await page.goto('/editor/settings?section=defaults&page=calendar');

  // ICalFeedManager keeps the fields behind a "+ Add Feed" reveal, and the
  // "Add" button stays disabled until BOTH a name and a URL are present — so
  // the plan's "fill URL, click Add" is not enough on its own.
  await page.getByRole('button', { name: '+ Add Feed' }).click();

  await autosaved(page, async () => {
    await page.getByPlaceholder('Feed name (e.g. Work, Sports)').fill('Work');
    await page.getByPlaceholder('https://example.com/calendar.ics').fill('https://example.com/feed.ics');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  });

  await expect
    .poll(async () => (await getConfig(request)).settings.calendar.icalSources?.length ?? 0)
    .toBeGreaterThan(0);
  // The checked link gets its "Updated" badge at once, not after the next display fetch.
  await expect(page.getByTestId('ical-feed-block').locator('[data-source-health="ok"]')).toContainText('Updated');
});

test('Defaults › Calendar: a link that is not a calendar stays in the form with the reason', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.route('**/api/calendar/check', (route) =>
    route.fulfill({ json: { ok: false, error: 'Could not reach the link (HTTP 404)', messageKey: 'linkHttpError', messageParams: { status: 404 } } }),
  );
  await page.goto('/editor/settings?section=defaults&page=calendar');
  await page.getByRole('button', { name: '+ Add Feed' }).click();
  await page.getByPlaceholder('Feed name (e.g. Work, Sports)').fill('Soccer');
  await page.getByPlaceholder('https://example.com/calendar.ics').fill('https://example.com/not-a-calendar');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // Inline, plain-language, and nothing saved.
  const check = page.getByTestId('ical-link-check');
  await expect(check).toContainText('Could not reach the link (HTTP 404)');
  await expect(check).toContainText('Check the link ends in .ics or starts with webcal://');
  await expect(page.getByPlaceholder('https://example.com/calendar.ics')).toHaveValue('https://example.com/not-a-calendar');
  expect((await getConfig(request)).settings.calendar.icalSources ?? []).toHaveLength(0);

  // The escape hatch for a feed that is only down right now.
  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Add anyway' }).click();
  });
  await expect
    .poll(async () => (await getConfig(request)).settings.calendar.icalSources?.length ?? 0)
    .toBe(1);
  await expect(check).toHaveCount(0);
});

test('Defaults › Integrations renders without error', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=integrations');

  // The page heading comes from `DefaultsPageShell` now, so it is the <h1>
  // every Defaults page renders, and it reads "API keys", the same name the
  // sidebar row and the breadcrumb use. It used to say "Integrations" while
  // the sidebar said "API keys".
  await expect(page.getByRole('heading', { name: 'API keys', level: 1 })).toBeVisible();
});

test('Defaults › Data: triggering a backup responds', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=data');

  // handleBackupExport GETs /api/backup, builds a JSON blob, and triggers a
  // client-side download. Pressing it now also states what it produced, right
  // under the button.
  const backupButton = page.getByRole('button', { name: 'Save a backup' });
  await expect(backupButton).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await backupButton.click();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^home-screens-backup-.*\.json$/);

  await expect(page.getByText(/Last backup:/)).toBeVisible();
  // Pressing the button used to change nothing on screen; now it names the
  // file it wrote.
  await expect(page.getByText(/Saved home-screens-backup-.*\.json to your downloads\./)).toBeVisible();
});

test('Defaults › Stats renders without error', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=stats');

  // StatsSection loads /api/system/stats, then renders its cards. Each detail
  // card's SectionHeading is an <h3>, so the first one appearing proves the
  // page rendered past its loading/error states.
  await expect(page.locator('h3').first()).toBeVisible();
});

test('sidebar footer links to the documentation site', async ({ page, request }) => {
  // The Docs settings page was retired in the settings reorganization — the
  // docs entry point is now a footer icon in the sidebar on every settings page.
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=data');

  await expect(page.locator('a[href="https://homescreens.dev/docs"]')).toBeVisible();
});

/**
 * Defaults › On your phone.
 *
 * The page's whole job is keeping the two phone surfaces distinct — `/chores`
 * is the ungated kid view, `/remote` is the password-protectable parent one —
 * so both tests below assert on that split rather than just smoke-rendering
 * the heading. The kids' card greying out is the interesting case: `/chores`
 * falls back to an empty state until a chore module exists anywhere, and the
 * page reads that through the same `resolveChoreModuleConfig` the surface
 * itself uses, so a regression in either drifts this test red.
 */
test('Defaults › On your phone: kids card is greyed out until a chore chart exists', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=phone');

  await expect(page.getByRole('heading', { name: 'On your phone', level: 1 })).toBeVisible();

  // Scoped to the on-screen rows: the printable sheet below them repeats both
  // addresses, so an unscoped getByText('/remote') matches twice.
  const kids = page.getByTestId('phone-surface-chores');
  const parents = page.getByTestId('phone-surface-remote');

  // No chore module in the base config, so the kids' row shows the hint
  // instead of a scannable code, and offers no way through.
  await expect(kids.getByText('Add a chore chart to any screen to turn this on.')).toBeVisible();
  await expect(kids.getByRole('link', { name: 'Open' })).toHaveCount(0);

  // The parent surface is unaffected — /remote works with or without chores.
  await expect(parents.getByRole('link', { name: 'Open' })).toBeVisible();
  await expect(parents.getByText('/remote')).toBeVisible();
});

test('Defaults › On your phone: adding a chore chart enables the kids card', async ({ page, request }) => {
  await putConfig(
    request,
    baseConfig({
      screens: [makeScreen('screen-1', 'Screen 1', [buildModuleInstance('chore-chart')])],
    }),
  );
  await page.goto('/editor/settings?section=defaults&page=phone');

  const kids = page.getByTestId('phone-surface-chores');

  await expect(kids.getByText('Add a chore chart to any screen to turn this on.')).toHaveCount(0);
  await expect(kids.getByRole('link', { name: 'Open' })).toBeVisible();
  await expect(kids.getByText('/chores')).toBeVisible();
});
