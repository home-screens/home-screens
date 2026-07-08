import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import type { ScreenConfiguration } from '@/types/config';

/** Single-display config with two profiles, each scoped to one screen. */
function profileConfig(activeProfile?: string): ScreenConfiguration {
  const cfg = baseConfig({
    screens: [
      makeScreen('s1', 'Screen One', [textModule('SCREEN ONE')]),
      makeScreen('s2', 'Screen Two', [textModule('SCREEN TWO')]),
    ],
    settings: activeProfile ? { activeProfile } : {},
  }) as ScreenConfiguration & { profiles?: unknown };
  cfg.profiles = [
    { id: 'p1', name: 'Morning', screenIds: ['s1'] },
    { id: 'p2', name: 'Evening', screenIds: ['s2'] },
  ];
  return cfg;
}

test('the profile switcher activates a profile and persists it to config', async ({ page, request }) => {
  await putConfig(request, profileConfig());
  await page.goto('/remote');

  await expect(page.getByRole('button', { name: 'Morning' })).toBeVisible();
  await page.getByRole('button', { name: 'Evening' }).click();

  await expect
    .poll(async () => (await getConfig(request)).settings.activeProfile)
    .toBe('p2');
});

test('the display resolves the active profile screens', async ({ page, request }) => {
  // p2 (Evening) is scoped to s2 only, so the display must show s2 and hide s1.
  await putConfig(request, profileConfig('p2'));
  await page.goto('/display');

  await expect(page.getByText('SCREEN TWO')).toBeVisible();
  await expect(page.getByText('SCREEN ONE')).toBeHidden();
});
