import { test, expect } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';
import { postHeartbeat, putConfig } from '../helpers/api';
import { baseConfig, choreChartModule, makeScreen, textModule } from '../helpers/config-fixtures';

/** Drain a display's command queue and return the full command objects (with payloads). */
async function drainCommands(
  request: APIRequestContext,
  display?: string,
): Promise<Array<{ type: string; payload?: Record<string, unknown> }>> {
  const url = display ? `/api/display/commands?display=${display}` : '/api/display/commands';
  const res = await request.get(url);
  return (await res.json()).commands;
}

/**
 * Post an "asleep" heartbeat the way a dimmed kiosk does. `postHeartbeat`
 * hardcodes displayState:'active', and the wake button only appears once the
 * remote's status poll reports the display asleep, so this variant is needed
 * here. Always targets a named display (its own statusMap slot) rather than the
 * legacy `__default__` slot — that slot is shared with the pre-existing sleep
 * test, and a lingering "asleep" status there poisons it across the full suite.
 */
async function postAsleepStatus(request: APIRequestContext, display: string): Promise<void> {
  const res = await request.post(`/api/display/status?display=${display}`, {
    data: {
      displayId: display,
      currentScreen: { index: 0, id: 'screen-0', name: 'Screen 0' },
      screenCount: 2,
      activeProfile: null,
      displayState: 'asleep',
      timestamp: Date.now(),
    },
  });
  expect(res.ok()).toBe(true);
}

/** Two named displays with distinct screen sets, for per-display targeting tests. */
function twoDisplays(
  a: { id: string; name: string },
  b: { id: string; name: string },
) {
  return baseConfig({
    displays: [
      { id: a.id, name: a.name, screens: [
        makeScreen('s1', 'S1', [textModule('A ONE')]),
        makeScreen('s2', 'S2', [textModule('A TWO')]),
      ] },
      { id: b.id, name: b.name, screens: [
        makeScreen('t1', 'T1', [textModule('B ONE')]),
      ] },
    ],
  });
}

test.beforeEach(async ({ request }) => {
  await putConfig(request, baseConfig());
  // Drain any commands left over from a previous test in this worker
  await request.get('/api/display/commands');
});

test('sleep button enqueues a sleep command for the display', async ({ page, request }) => {
  // Controls stay inert until the display has reported in: a command to a
  // display the hub has never heard from cannot be confirmed or reverted.
  await postHeartbeat(request);
  await page.goto('/remote');
  const sleepButton = page.getByRole('button', { name: 'Sleep Display' });
  await expect(sleepButton).toBeEnabled();
  await sleepButton.click();
  // The button flips optimistically and says who it is waiting on.
  await expect(page.getByText('Waiting for The display…')).toBeVisible();

  // Poll the same queue the kiosk polls (legacy single-display key __default__)
  await expect
    .poll(async () => {
      const res = await request.get('/api/display/commands');
      const body = await res.json();
      return (body.commands as Array<{ type: string }>).map((c) => c.type);
    }, { timeout: 5000 })
    .toContain('sleep');
});

test('next-screen button enqueues a next command', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('a', 'A', [textModule('ALPHA')]),
      makeScreen('b', 'B', [textModule('BRAVO')]),
    ],
  }));
  // The screen-nav buttons stay disabled until a live display heartbeat reports
  // screenCount > 0, and handleNav no-ops without a status. Seed one.
  await postHeartbeat(request, { screenCount: 2, currentIndex: 0 });
  await page.goto('/remote');

  const nextButton = page.getByRole('button', { name: 'Next screen' });
  await expect(nextButton).toBeEnabled(); // waits out the 5s status poll
  await nextButton.click();

  await expect
    .poll(async () => {
      const res = await request.get('/api/display/commands');
      const body = await res.json();
      return (body.commands as Array<{ type: string }>).map((c) => c.type);
    }, { timeout: 5000 })
    .toContain('next-screen');
});

test('tab bar is hidden without chore/meal/photo modules', async ({ page }) => {
  await page.goto('/remote');
  await expect(page.getByRole('button', { name: 'Sleep Display' })).toBeVisible();
  // exact match: the backup action's accessible name contains the word "chores"
  // ("Download config, chores, meals & rewards"), so a substring match would
  // false-positive. The real tab-bar button is aria-label="Chores".
  await expect(page.getByRole('button', { name: 'Chores', exact: true })).toBeHidden();
});

test('chores tab appears when a chore-chart module exists', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [choreChartModule()])],
  }));
  await page.goto('/remote');
  await expect(page.getByRole('button', { name: 'Chores', exact: true })).toBeVisible();
});

test('the wake button appears for an asleep display and dispatches a wake command', async ({ page, request }) => {
  // Dedicated named display so the asleep status lands in its own statusMap
  // slot and never poisons the legacy __default__ slot the pre-existing sleep
  // test polls.
  await putConfig(request, twoDisplays({ id: 'wakekit', name: 'Wake Kitchen' }, { id: 'wakemain', name: 'Wake Main' }));
  await drainCommands(request, 'wakekit');
  // Seed an asleep heartbeat so the status poll flips the quick-action button
  // from "Sleep Display" to "Wake Display".
  await postAsleepStatus(request, 'wakekit');
  await page.goto('/remote');

  // Target the asleep display so both the status poll and the wake dispatch
  // scope to it.
  await page.getByRole('button', { name: 'Wake Kitchen', exact: true }).click();

  const wakeButton = page.getByRole('button', { name: 'Wake Display' });
  await expect(wakeButton).toBeVisible(); // waits out the status poll reporting asleep
  await wakeButton.click();

  await expect
    .poll(async () => (await drainCommands(request, 'wakekit')).map((c) => c.type), { timeout: 5000 })
    .toContain('wake');
});

test('previous-screen button enqueues a prev command', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('a', 'A', [textModule('ALPHA')]),
      makeScreen('b', 'B', [textModule('BRAVO')]),
    ],
  }));
  // Screen-nav buttons stay disabled until a heartbeat reports screenCount > 0.
  await postHeartbeat(request, { screenCount: 2, currentIndex: 1 });
  await page.goto('/remote');

  const prevButton = page.getByRole('button', { name: 'Previous screen' });
  await expect(prevButton).toBeEnabled(); // waits out the 5s status poll
  await prevButton.click();

  await expect
    .poll(async () => (await drainCommands(request)).map((c) => c.type), { timeout: 5000 })
    .toContain('prev-screen');
});

test('the brightness slider posts its value to the targeted display queue', async ({ page, request }) => {
  await putConfig(request, twoDisplays({ id: 'bkit', name: 'Bright Kitchen' }, { id: 'bmain', name: 'Bright Main' }));
  // Clear any leftover queue from a prior test in this worker.
  await drainCommands(request, 'bkit');
  await drainCommands(request, 'bmain');
  // The slider is inert until the targeted display has reported in.
  await postHeartbeat(request, { display: 'bkit', brightness: 100 });
  await page.goto('/remote');

  // Target one display so the brightness POST carries displayId: 'bkit'.
  await page.getByRole('button', { name: 'Bright Kitchen', exact: true }).click();

  // Range inputs can't be filled directly; drive the native value setter and
  // dispatch the input event so React's onChange (and the debounced POST) fire.
  const slider = page.getByRole('slider');
  await expect(slider).toBeEnabled();
  await slider.evaluate((el) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, '40');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  let brightness: { type: string; payload?: Record<string, unknown> } | undefined;
  await expect
    .poll(async () => {
      const found = (await drainCommands(request, 'bkit')).find((c) => c.type === 'brightness');
      if (found) brightness = found;
      return brightness?.type;
    }, { timeout: 6000 })
    .toBe('brightness');
  expect(brightness?.payload?.value).toBe(40);
  // The command scoped to bkit; the sibling display never received it.
  expect((await drainCommands(request, 'bmain')).map((c) => c.type)).not.toContain('brightness');
});

test('the brightness slider starts from what the display reports, or -- until it has', async ({ page, request }) => {
  await putConfig(request, twoDisplays({ id: 'brkit', name: 'Level Kitchen' }, { id: 'brmain', name: 'Level Main' }));
  // Kitchen last reported 40%; Main has never reported at all.
  await postHeartbeat(request, { display: 'brkit', displayState: 'dimmed', brightness: 40 });
  await page.goto('/remote');

  await page.getByRole('button', { name: 'Level Kitchen', exact: true }).click();
  await expect(page.getByTestId('brightness-value')).toHaveText('40%');
  await expect(page.getByRole('slider')).toHaveValue('40');

  await page.getByRole('button', { name: 'Level Main', exact: true }).click();
  await expect(page.getByTestId('brightness-value')).toHaveText('--');
  await expect(page.getByRole('slider')).toBeDisabled();
});

test('a sleep that no display confirms reverts and says the display did not respond', async ({ page, request }) => {
  await putConfig(request, twoDisplays({ id: 'rvkit', name: 'Revert Kitchen' }, { id: 'rvmain', name: 'Revert Main' }));
  await drainCommands(request, 'rvkit');
  // A fresh heartbeat makes the display look reachable, but nothing drains
  // its queue or reports back — exactly an unplugged Pi within its last minute.
  await postHeartbeat(request, { display: 'rvkit' });
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Revert Kitchen', exact: true }).click();

  const sleepButton = page.getByRole('button', { name: 'Sleep Display' });
  await expect(sleepButton).toBeEnabled();
  await sleepButton.click();
  await expect(page.getByText('Waiting for Revert Kitchen…')).toBeVisible();

  // After the confirm window the remote stops pretending: toast + Sleep is back.
  const toast = page.getByTestId('remote-toast');
  await expect(toast).toHaveText(/Revert Kitchen didn't respond/, { timeout: 15000 });
  await expect(toast).toHaveAttribute('data-tone', 'error');
  await expect(page.getByRole('button', { name: 'Sleep Display' })).toBeEnabled();
  await expect(page.getByText('Waiting for Revert Kitchen…')).toHaveCount(0);
});

test('the hero names the targeted display, and All mode lists every display', async ({ page, request }) => {
  await putConfig(request, twoDisplays({ id: 'heroa', name: 'Hero Alpha' }, { id: 'herob', name: 'Hero Beta' }));
  await postHeartbeat(request, { display: 'heroa', screenCount: 2, currentIndex: 1 });
  await postHeartbeat(request, { display: 'herob', screenCount: 1, currentIndex: 0, displayState: 'asleep' });
  await page.goto('/remote');

  // All (the default): one row per display, each with its own screen and state.
  const all = page.getByTestId('display-hero-all');
  await expect(all).toBeVisible();
  await expect(all.getByText('Hero Alpha')).toBeVisible();
  await expect(all.getByText('Hero Beta')).toBeVisible();
  await expect(all.getByText('Screen 2 of 2')).toBeVisible();
  await expect(all.getByText('Asleep', { exact: true })).toBeVisible();
  await expect(all.getByText('Pick one display to change its screen or profile.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next screen' })).toHaveCount(0);

  // One display: the hero is prefixed with its name and the nav returns.
  await page.getByRole('button', { name: 'Hero Alpha', exact: true }).click();
  await expect(page.getByTestId('display-hero-name')).toHaveText('Hero Alpha');
  await expect(page.getByTestId('display-hero-all')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next screen' })).toBeEnabled();
});

test('sending an alert lands the payload on the targeted display queue only', async ({ page, request }) => {
  await putConfig(request, twoDisplays({ id: 'akit', name: 'Alert Kitchen' }, { id: 'amain', name: 'Alert Main' }));
  await drainCommands(request, 'akit');
  await drainCommands(request, 'amain');
  await page.goto('/remote');

  await page.getByRole('button', { name: 'Alert Kitchen', exact: true }).click();

  // Two buttons read "Send Alert": the QuickActions trigger (first in the DOM)
  // opens the sheet; the sheet's submit button (last) sends it.
  await page.getByRole('button', { name: 'Send Alert', exact: true }).first().click();
  await page.getByRole('button', { name: 'Warning', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Dinner');
  await page.getByLabel('Message', { exact: true }).fill('Time to eat');
  await page.getByRole('button', { name: '30s', exact: true }).click();
  await page.getByRole('button', { name: 'Send Alert', exact: true }).last().click();

  let alert: { type: string; payload?: Record<string, unknown> } | undefined;
  await expect
    .poll(async () => {
      const found = (await drainCommands(request, 'akit')).find((c) => c.type === 'alert');
      if (found) alert = found;
      return alert?.type;
    }, { timeout: 5000 })
    .toBe('alert');
  expect(alert?.payload).toMatchObject({
    type: 'warning',
    title: 'Dinner',
    message: 'Time to eat',
    duration: 30000,
  });
  expect((await drainCommands(request, 'amain')).map((c) => c.type)).not.toContain('alert');

  // The sheet holds its green Sent! state, then closes with a named toast.
  // (The closed sheet is slid off-screen and aria-hidden, so the role query
  // stops resolving it; a plain label query would still see the input.)
  await expect(page.getByTestId('remote-toast')).toHaveText('Alert sent to Alert Kitchen');
  await expect(page.getByRole('heading', { name: 'Send Alert' })).toBeHidden();
});

test('a persistent alert can be cleared from the phone', async ({ page, request }) => {
  await putConfig(request, twoDisplays({ id: 'clkit', name: 'Clear Kitchen' }, { id: 'clmain', name: 'Clear Main' }));
  await drainCommands(request, 'clkit');
  // The display reports one alert on screen, so the row says so.
  await postHeartbeat(request, { display: 'clkit', activeAlerts: 1 });
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Clear Kitchen', exact: true }).click();
  await page.getByRole('button', { name: 'Send Alert', exact: true }).first().click();

  const clearButton = page.getByRole('button', { name: /Clear alerts on Clear Kitchen/ });
  await expect(clearButton).toContainText('(1 showing now)');
  await clearButton.click();

  await expect
    .poll(async () => (await drainCommands(request, 'clkit')).map((c) => c.type), { timeout: 5000 })
    .toContain('clear-alerts');
  await expect(page.getByTestId('remote-toast')).toHaveText('Alerts cleared on Clear Kitchen');
});

test('the update-available banner shows, dismisses, and stays dismissed after reload', async ({ page, request }) => {
  await putConfig(request, baseConfig({ settings: { updateNotification: { enabled: true } } }));

  // Version check hits git/GitHub in production, so stub it to advertise a
  // newer release. latest ("1.6.0") drives the banner text; tags[0].tag
  // ("v1.6.0") is what dismissal persists and compares against.
  await page.route('**/api/system/version**', (route) =>
    route.fulfill({
      json: {
        current: '1.5.0', currentCommit: 'aaa', latest: '1.6.0', latestCommit: 'bbb',
        updateAvailable: true, installedVia: 'git', channel: 'stable',
        tags: [{ tag: 'v1.6.0', version: '1.6.0', commit: 'bbb' }], upgradeRunning: false,
      },
    }));

  // Stand in for the dismissal store so persistence is deterministic and
  // isolated from worker-shared state: GET reflects the last dismissed tag,
  // POST records it. On reload the banner reads the recorded value and stays
  // hidden.
  let dismissedVersion: string | null = null;
  await page.route('**/api/system/update-notification', async (route) => {
    if (route.request().method() === 'POST') {
      dismissedVersion = (route.request().postDataJSON()?.version as string) ?? null;
    }
    await route.fulfill({ json: { lastDismissedVersion: dismissedVersion } });
  });

  await page.goto('/remote');
  await expect(page.getByText('Update available: v1.6.0')).toBeVisible();
  // Updating is an editor task; the banner says so and points there.
  await expect(page.getByText(/Install it from the editor on a computer/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the editor' })).toHaveAttribute('href', '/editor/settings?page=system');

  // Wait for the dismissal POST to land before reloading so the stubbed GET
  // returns the recorded version on the next mount.
  const dismissResponse = page.waitForResponse(
    (res) => res.url().includes('/api/system/update-notification') && res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await dismissResponse;
  await expect(page.getByText('Update available: v1.6.0')).toBeHidden();

  await page.reload();
  await expect(page.getByText('Update available: v1.6.0')).toBeHidden();
});

test('the backup reminder banner shows, downloads a backup, and dismisses', async ({ page, request }) => {
  await putConfig(request, baseConfig({ settings: { backupReminder: { enabled: true, intervalDays: 7 } } }));

  // A real "last backed up 40 days ago" state can't be seeded through the API
  // (POST only stamps "now"), so stub the reminder read to look overdue.
  const fortyDaysAgo = new Date(Date.now() - 40 * 86_400_000).toISOString();
  await page.route('**/api/backup/reminder', (route) =>
    route.fulfill({ json: { lastBackupDate: fortyDaysAgo, lastDismissedDate: null } }));

  await page.goto('/remote');
  await expect(page.getByText(/backed up in 40 days/)).toBeVisible();

  // "Backup" GETs /api/backup (unstubbed, served from the sandbox) and triggers
  // a client-side file download; the download event is the success signal.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^home-screens-backup-.*\.json$/);

  // Backing up dismisses the banner.
  await expect(page.getByText(/backed up in 40 days/)).toBeHidden();
});

test('aborting the status poll surfaces the disconnected banner', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  // Fail every status poll; the remote flips to disconnected after 3 failures
  // (~10s at the 5s poll cadence).
  await page.route('**/api/display/status**', (route) => route.abort());
  await page.goto('/remote');

  // The banner blames the hub connection, never a display (that is the hero's
  // job). Next's route announcer is a second role="alert", so match the text.
  const banner = page.getByTestId('connection-banner');
  await expect(banner).toBeVisible({ timeout: 20000 });
  await expect(banner).toHaveText(/Can't reach Home Screens\. Check that this phone is on the home Wi-Fi/);
});

test('the disconnected banner clears once the status poll recovers', async ({ page, request }) => {
  await putConfig(request, baseConfig());

  // Block the poll until the banner has appeared, then let real requests through.
  // A recovered poll (200 or 404) resets the failure count and flips isConnected
  // back to true, hiding the banner.
  let blocked = true;
  await page.route('**/api/display/status**', (route) => (blocked ? route.abort() : route.continue()));
  await page.goto('/remote');
  await expect(page.getByTestId('connection-banner')).toBeVisible({ timeout: 20000 });

  blocked = false;
  await expect(page.getByTestId('connection-banner')).toBeHidden({ timeout: 15000 });
});
