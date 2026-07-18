import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig } from '../helpers/config-fixtures';
import { autosaved } from '../helpers/editor';

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

test('Defaults › Calendar: adding an iCal feed persists', async ({ page, request }) => {
  await putConfig(request, baseConfig());
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
});

test('Defaults › Integrations renders without error', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=integrations');

  // The section shows a loading paragraph until /api/secrets resolves, then
  // renders its single page heading. It's an <h2>, not the <h3> the plan
  // assumed (only the per-service card names live below it, and those are
  // plain divs).
  await expect(page.getByRole('heading', { name: 'Integrations', level: 2 })).toBeVisible();
});

test('Defaults › Data: triggering a backup responds', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=data');

  // The button is labeled "Backup All Data" (not "Backup now"/"Create backup").
  // handleBackupExport GETs /api/backup, builds a JSON blob, and triggers a
  // client-side download — there is NO "success/complete/saved" status text.
  // The observable success signals are the file download firing and the
  // "Last backup:" line replacing "No backups recorded yet".
  const backupButton = page.getByRole('button', { name: 'Backup All Data' });
  await expect(backupButton).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await backupButton.click();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^home-screens-backup-.*\.json$/);

  await expect(page.getByText(/Last backup:/)).toBeVisible();
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
