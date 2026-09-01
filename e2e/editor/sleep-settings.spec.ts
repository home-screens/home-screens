import { test, expect } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import type { DisplayNode, DisplayNodeSettings } from '@/types/config';

/**
 * Coverage for the Sleep settings surface, mirroring the patterns in
 * settings.spec.ts:
 *   - Defaults › Sleep persists edits to config.settings.sleep /
 *     config.settings.screensaver via the page's 500ms debounced autosave.
 *   - Per display › Sleep is a *whole-block* override (WholeBlockOverrideCard),
 *     not a per-field OverrideRow: "Override for {name}" forks the sleep +
 *     screensaver objects onto the node, "Reset to default" drops the fork.
 *   - The Defaults › Sleep backlink banner lists any display that overrides
 *     the sleep block (findDisplaysOverridingFields over SLEEP_OVERRIDE_FIELDS).
 */

/** Read back a specific display's per-display settings override object. */
async function displaySettings(
  request: APIRequestContext,
  id: string,
): Promise<DisplayNodeSettings> {
  const config = await getConfig(request);
  const displays = (config as unknown as { displays?: DisplayNode[] }).displays ?? [];
  return (displays.find((d) => d.id === id)?.settings ?? {}) as DisplayNodeSettings;
}

test('Defaults › Sleep: editing schedule, dim level, and screensaver persists to the shared config', async ({ page, request }) => {
  await putConfig(request, baseConfig()); // no sleep block → form hydrates with defaults (sleep disabled)
  await page.goto('/editor/settings?section=defaults&page=screen&panel=sleep');
  await expect(page.getByRole('heading', { name: 'Screen defaults' })).toBeVisible();

  // Sleep must be enabled before the dim / schedule / screensaver fields mount.
  await page.locator('label', { hasText: 'Enable display sleep' }).getByRole('switch').click();

  // The 24-hour preview bar appears with the rest of the form.
  await expect(page.getByTestId('sleep-timeline-preview')).toBeVisible();

  // Out-of-the-box state: idle dimming defaults ON, so the idle sliders and
  // the dimmed-appearance brightness slider are all live.
  await expect(page.locator('label', { hasText: 'Dim after (minutes)' })).toBeVisible();
  await expect(page.locator('label', { hasText: 'Brightness while dimmed (%)' })).toBeVisible();

  // Idle dimming is a separate switch: turning it off hides the idle-only
  // sliders and persists idleDimEnabled: false — the schedule-only
  // configuration from issue #26.
  const idleDimSwitch = page.locator('label', { hasText: 'Dim after a few quiet minutes' }).getByRole('switch');
  await idleDimSwitch.click();
  await expect(page.locator('label', { hasText: 'Dim after (minutes)' })).toBeHidden();
  await expect
    .poll(async () => (await getConfig(request)).settings.sleep?.idleDimEnabled)
    .toBe(false);

  // With idle dimming off and no dim schedule, nothing here can dim the
  // display: the brightness slider collapses, but the screensaver select
  // stays reachable (remote dimming still shows the screensaver).
  await expect(page.locator('label', { hasText: 'Brightness while dimmed (%)' })).toBeHidden();
  await expect(page.locator('label', { hasText: 'Screensaver' }).locator('select')).toBeVisible();

  // Toggling back on restores the sliders and persists true.
  await idleDimSwitch.click();
  await expect(page.locator('label', { hasText: 'Dim after (minutes)' })).toBeVisible();
  await expect
    .poll(async () => (await getConfig(request)).settings.sleep?.idleDimEnabled)
    .toBe(true);

  // Back to the issue-#26 shape for the rest of the flow.
  await idleDimSwitch.click();
  await expect(page.locator('label', { hasText: 'Dim after (minutes)' })).toBeHidden();

  // The wake-hold slider only exists alongside a schedule — with neither
  // schedule enabled there is no window for a wake to hold off.
  await expect(page.locator('[data-field-id="sleep.wakeHoldMinutes"]')).toBeHidden();

  // Enabling the dim schedule brings the dimmed-appearance controls back.
  await page.locator('label', { hasText: 'Dim in the evening' }).getByRole('switch').click();

  // ...and the wake-hold slider with them. Home → 0 ("Just a moment"), a
  // value distinct from the default 5, proving the field persists.
  const wakeHold = page
    .locator('[data-field-id="sleep.wakeHoldMinutes"]')
    .locator('input[type="range"]');
  await expect(wakeHold).toBeVisible();
  await wakeHold.focus();
  await wakeHold.press('Home');

  // Dim level: the brightness slider (min 5, max 80, step 5). End → 80, a value
  // distinct from the default 20.
  const brightness = page
    .locator('label', { hasText: 'Brightness while dimmed (%)' })
    .locator('input[type="range"]');
  await expect(brightness).toBeVisible();
  await brightness.focus();
  await brightness.press('End');

  // Screensaver mode select.
  await page.locator('label', { hasText: 'Screensaver' }).locator('select').selectOption('blank');

  // Dim schedule times: set the "Dim at" time.
  await page.locator('label', { hasText: 'Dim at' }).locator('input[type="time"]').fill('22:30');

  // All edits collapse into the debounced /api/config PUT — poll the persisted
  // config rather than waiting on a single response.
  await expect
    .poll(async () => (await getConfig(request)).settings.sleep?.dimBrightness)
    .toBe(80);
  await expect
    .poll(async () => (await getConfig(request)).settings.screensaver?.mode)
    .toBe('blank');
  await expect
    .poll(async () => (await getConfig(request)).settings.sleep?.dimSchedule?.startTime)
    .toBe('22:30');
  await expect
    .poll(async () => (await getConfig(request)).settings.sleep?.wakeHoldMinutes)
    .toBe(0);
});

test.describe('per-display sleep override', () => {
  // Kitchen's sleep is enabled in the shared defaults so that, after forking,
  // the screensaver select is visible (it lives behind the "Enable display
  // sleep" gate). Fork seeds the node from these defaults.
  function multiDisplayConfig() {
    return baseConfig({
      settings: {
        sleep: { enabled: true, idleDimEnabled: false, dimAfterMinutes: 10, sleepAfterMinutes: 0, dimBrightness: 20 },
        screensaver: { mode: 'clock' },
      },
      displays: [
        { id: 'main', name: 'Main', screens: [makeScreen('m1', 'M1', [textModule('MAIN')])] },
        { id: 'kitchen', name: 'Kitchen', screens: [makeScreen('k1', 'K1', [textModule('KIT')])] },
      ],
    });
  }

  test('Override forks the sleep block, an edit persists to the node, and Reset clears it', async ({ page, request }) => {
    await putConfig(request, multiDisplayConfig());
    await page.goto('/editor/settings?section=display&id=kitchen&subtab=overrides');

    // Not forked yet: the sleep card offers "Override for Kitchen". The merged
    // Overrides subtab renders an identical button on the alerts card, so
    // scope through the sleep card's test id.
    const sleepCard = page.getByTestId('sleep-override-card');
    const forkButton = sleepCard.getByRole('button', { name: 'Override for Kitchen' });
    await expect(forkButton).toBeVisible();
    await forkButton.click();

    // Forking seeds both sleep + screensaver on the node from the defaults —
    // including idleDimEnabled: false, which the shared transform must carry
    // (the field is optional, so a fork that dropped it would silently
    // re-enable idle dimming on this display).
    await expect
      .poll(async () => (await displaySettings(request, 'kitchen')).sleep?.enabled)
      .toBe(true);
    await expect
      .poll(async () => (await displaySettings(request, 'kitchen')).sleep?.idleDimEnabled)
      .toBe(false);

    // The Defaults › Screen › Sleep tab's backlink banner now lists the kitchen display.
    await page.goto('/editor/settings?section=defaults&page=screen&panel=sleep');
    await expect(page.locator('a[href*="section=display&id=kitchen"]')).toBeVisible();

    // Back on the subtab, the form is now editable: change the screensaver mode.
    await page.goto('/editor/settings?section=display&id=kitchen&subtab=overrides');
    await page.locator('label', { hasText: 'Screensaver' }).locator('select').selectOption('off');

    await expect
      .poll(async () => (await displaySettings(request, 'kitchen')).screensaver?.mode)
      .toBe('off');

    // Reset to default drops the whole fork (both keys deleted from the node).
    // Scoped to the sleep card — per-field OverrideRows and the alerts card
    // render the same button label on this subtab.
    await page.getByTestId('sleep-override-card').getByRole('button', { name: 'Reset to default' }).click();

    await expect
      .poll(async () => (await displaySettings(request, 'kitchen')).sleep)
      .toBeUndefined();
    await expect
      .poll(async () => (await displaySettings(request, 'kitchen')).screensaver)
      .toBeUndefined();
  });

  test('Defaults › Sleep backlink banner names a display that overrides the sleep block', async ({ page, request }) => {
    // Seed kitchen with a pre-existing sleep + screensaver override.
    const config = multiDisplayConfig();
    const displays = (config as unknown as { displays: DisplayNode[] }).displays;
    displays[1].settings = {
      sleep: { enabled: true, dimAfterMinutes: 15, sleepAfterMinutes: 30, dimBrightness: 40 },
      screensaver: { mode: 'blank' },
    };
    await putConfig(request, config);

    await page.goto('/editor/settings?section=defaults&page=screen&panel=sleep');

    // The banner renders the overriding display's name and a link back to it.
    const banner = page.getByText('Kitchen', { exact: false });
    await expect(banner.first()).toBeVisible();
    await expect(page.locator('a[href*="section=display&id=kitchen"]')).toBeVisible();
    // sleep + screensaver are one override to the user, named after the card
    // that forks them, never "2 fields".
    // (The tab button carries the same label, so match the banner's emphasis.)
    await expect(page.locator('strong', { hasText: 'Sleep & dimming' })).toBeVisible();
    await expect(page.getByText('2 fields')).toHaveCount(0);

    // The banner follows the tab: nothing on Rotation & appearance is overridden.
    await page.getByTestId('screen-tab-appearance').click();
    await expect(page.locator('a[href*="section=display&id=kitchen"]')).toHaveCount(0);

    // The per-display pages count it once too.
    await page.goto('/editor/settings?section=display&id=kitchen&subtab=overrides');
    await expect(page.getByText('1 display override', { exact: false })).toBeVisible();
    await page.goto('/editor/settings?section=display&id=kitchen&subtab=overview');
    await expect(page.getByText('Sleep & dimming overridden')).toBeVisible();
    await expect(page.getByText('Screensaver overridden')).toHaveCount(0);
  });
});
