import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import type { DisplayNode } from '@/types/config';

async function kitchenSettings(request: APIRequestContext) {
  const config = await getConfig(request);
  const displays = (config as unknown as { displays?: DisplayNode[] }).displays ?? [];
  return displays.find((d) => d.id === 'kitchen')?.settings ?? {};
}

test('Defaults › Weather: switching units persists to the shared config', async ({ page, request }) => {
  await putConfig(request, baseConfig()); // default units: imperial
  await page.goto('/editor/settings?section=defaults&page=weather');
  await expect(page.getByText('Units')).toBeVisible();

  await page.getByRole('button', { name: /^Metric/ }).click();

  await expect
    .poll(async () => (await getConfig(request)).settings.weather.units)
    .toBe('metric');
});

test.describe('per-display overrides', () => {
  function multiDisplayConfig() {
    return baseConfig({
      displays: [
        { id: 'main', name: 'Main', screens: [makeScreen('m1', 'M1', [textModule('MAIN')])] },
        { id: 'kitchen', name: 'Kitchen', screens: [makeScreen('k1', 'K1', [textModule('KIT')])] },
      ],
    });
  }

  /** The OverrideRow whose label is `label`, addressed via its label span's row ancestor. */
  function overrideRow(page: Page, label: string) {
    return page.getByText(label, { exact: true }).locator('xpath=ancestor::div[contains(@class,"px-4")][1]');
  }

  test('overriding a display field writes to the node, shows the backlink banner, and resets', async ({ page, request }) => {
    await putConfig(request, multiDisplayConfig());
    await page.goto('/editor/settings?section=display&id=kitchen&subtab=display');

    const row = overrideRow(page, 'Transition effect');
    await expect(row).toBeVisible();

    // Fork the field, then pick a distinct value.
    await row.getByRole('button', { name: 'Override', exact: true }).click();
    await row.locator('select').selectOption('crossfade');

    await expect
      .poll(async () => (await kitchenSettings(request)).transitionEffect)
      .toBe('crossfade');

    // The Defaults › Display page's backlink banner now lists the kitchen display.
    await page.goto('/editor/settings?section=defaults&page=display');
    await expect(page.locator('a[href*="section=display&id=kitchen"]')).toBeVisible();

    // Reset clears the override.
    await page.goto('/editor/settings?section=display&id=kitchen&subtab=display');
    const forkedRow = overrideRow(page, 'Transition effect');
    await forkedRow.getByRole('button', { name: 'Reset to default', exact: true }).click();

    await expect
      .poll(async () => (await kitchenSettings(request)).transitionEffect)
      .toBeUndefined();
  });
});
