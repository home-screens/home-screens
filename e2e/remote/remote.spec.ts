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
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Sleep Display' }).click();

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
  await page.goto('/remote');

  // Target one display so the brightness POST carries displayId: 'bkit'.
  await page.getByRole('button', { name: 'Bright Kitchen', exact: true }).click();

  // Range inputs can't be filled directly; drive the native value setter and
  // dispatch the input event so React's onChange (and the debounced POST) fire.
  const slider = page.getByRole('slider');
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

  // "check that the device is on..." is unique to ConnectionBanner (DisplayHero
  // also renders a bare "Display unreachable", and Next's route announcer is a
  // second role="alert").
  await expect(page.getByText(/check that the device is on/)).toBeVisible({ timeout: 20000 });
});

test('the disconnected banner clears once the status poll recovers', async ({ page, request }) => {
  await putConfig(request, baseConfig());

  // Block the poll until the banner has appeared, then let real requests through.
  // A recovered poll (200 or 404) resets the failure count and flips isConnected
  // back to true, hiding the banner.
  let blocked = true;
  await page.route('**/api/display/status**', (route) => (blocked ? route.abort() : route.continue()));
  await page.goto('/remote');
  await expect(page.getByText(/check that the device is on/)).toBeVisible({ timeout: 20000 });

  blocked = false;
  await expect(page.getByText(/check that the device is on/)).toBeHidden({ timeout: 15000 });
});
