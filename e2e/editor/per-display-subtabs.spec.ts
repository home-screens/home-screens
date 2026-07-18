import { test, expect } from '../fixtures';
import { putConfig, getConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import type { DisplayNode, ScreenConfiguration } from '@/types/config';

/**
 * Per-display settings subtabs (`?section=display&id=<id>&subtab=<subtab>`).
 * Covers Identity (rename + main-vs-non-main remove guard), Profile
 * (per-display activeProfile), Alerts (WholeBlockOverrideCard fork/edit/reset),
 * and an Overview smoke test.
 *
 * `main` and `kitchen` are BOTH declared explicitly — `main` is a regular
 * DisplayNode that owns its own dimensions, so nothing here relies on the
 * addDisplay auto-seed behavior.
 */
function twoDisplayConfig(): ScreenConfiguration {
  return baseConfig({
    displays: [
      { id: 'main', name: 'Main', screens: [makeScreen('m1', 'M1', [textModule('MAIN')])] },
      { id: 'kitchen', name: 'Kitchen', screens: [makeScreen('k1', 'K1', [textModule('KIT')])] },
    ],
  });
}

/** The kitchen display's per-display settings overrides, read back from disk. */
function kitchenDisplay(config: ScreenConfiguration): DisplayNode | undefined {
  return config.displays?.find((d) => d.id === 'kitchen');
}

test('Identity subtab: renaming a display persists', async ({ page, request }) => {
  await putConfig(request, twoDisplayConfig());
  await page.goto('/editor/settings?section=display&id=kitchen&subtab=overview');

  const nameField = page.getByLabel('Display name');
  await expect(nameField).toHaveValue('Kitchen');

  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok(),
  );
  await nameField.fill('Kitchen Counter');
  await nameField.blur();
  await saved;

  await expect
    .poll(async () => kitchenDisplay(await getConfig(request))?.name)
    .toBe('Kitchen Counter');
});

test('Identity subtab: main display cannot be removed, others can', async ({ page, request }) => {
  await putConfig(request, twoDisplayConfig());

  // "main" is the hub kiosk — removeDisplay hard-blocks it, so the button
  // renders visible-but-disabled.
  await page.goto('/editor/settings?section=display&id=main&subtab=overview');
  await expect(page.getByRole('button', { name: /^Remove/ })).toBeDisabled();

  await page.goto('/editor/settings?section=display&id=kitchen&subtab=overview');
  await expect(page.getByRole('button', { name: /^Remove/ })).toBeEnabled();
});

test('Profile subtab: setting the active profile persists per-display', async ({ page, request }) => {
  const config = twoDisplayConfig();
  config.profiles = [{ id: 'p1', name: 'Evening', screenIds: [] }];
  await putConfig(request, config);
  await page.goto('/editor/settings?section=display&id=kitchen&subtab=overview');

  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok(),
  );
  await page.getByLabel('Active profile').selectOption('p1');
  await saved;

  await expect
    .poll(async () => kitchenDisplay(await getConfig(request))?.activeProfile)
    .toBe('p1');
});

test('Alerts card on the Overrides subtab: forking and resetting the per-display override', async ({ page, request }) => {
  await putConfig(request, twoDisplayConfig());
  await page.goto('/editor/settings?section=display&id=kitchen&subtab=overrides');

  // Inheriting by default — the fork button is labelled per-display, and the
  // form is dimmed (disabled) until forked. The merged Overrides subtab
  // renders an identical button on the sleep card, so scope to the alerts
  // card's test id.
  const alertsCard = page.getByTestId('alerts-override-card');
  const forkButton = alertsCard.getByRole('button', { name: 'Override for Kitchen', exact: true });
  const positionSelect = alertsCard.getByLabel('Position');
  await expect(positionSelect).toBeDisabled();

  await forkButton.click();
  // Alerts is a whole-block override written under `display.settings.alerts`;
  // the Position control is a native <select>, so edit that rather than the
  // range-slider duration field.
  await positionSelect.selectOption('bottom');

  await expect
    .poll(async () => kitchenDisplay(await getConfig(request))?.settings?.alerts?.position)
    .toBe('bottom');

  await alertsCard.getByRole('button', { name: 'Reset to default', exact: true }).click();

  await expect
    .poll(async () => kitchenDisplay(await getConfig(request))?.settings?.alerts)
    .toBeUndefined();
});

test('Overview subtab renders without error', async ({ page, request }) => {
  await putConfig(request, twoDisplayConfig());
  await page.goto('/editor/settings?section=display&id=kitchen&subtab=overview');

  // The header h1 also shows "Kitchen" on every subtab; assert the
  // Overview-specific "Overrides for Kitchen" panel heading instead so this
  // proves the Overview body rendered, not just the shared header.
  await expect(page.getByText('Overrides for Kitchen')).toBeVisible();
  await expect(page.getByText('Resolution')).toBeVisible();
});
