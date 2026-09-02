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

test('the switcher offers All screens, never toggles off silently, and says what it did', async ({ page, request }) => {
  await putConfig(request, profileConfig('p1'));
  await page.goto('/remote');

  // Scoped to the switcher: the confirmation toast is a button too, and its
  // text names the profile.
  const chips = page.getByTestId('profile-switcher');
  const morning = chips.getByRole('button', { name: /Morning/ });
  await expect(morning).toHaveAttribute('aria-pressed', 'true');
  // Tapping the active chip is a no-op: no request, no silent "none".
  await morning.click();
  await expect(morning).toHaveAttribute('aria-pressed', 'true');
  expect((await getConfig(request)).settings.activeProfile).toBe('p1');

  await chips.getByRole('button', { name: 'Evening' }).click();
  await expect(page.getByTestId('remote-toast')).toHaveText('The display switched to Evening');
  await expect(chips.getByRole('button', { name: /Evening/ })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await getConfig(request)).settings.activeProfile).toBe('p2');

  // "All screens" is the explicit way to run with no profile.
  await chips.getByRole('button', { name: 'All screens' }).click();
  await expect(page.getByTestId('remote-toast')).toHaveText('The display is showing all screens');
  await expect.poll(async () => (await getConfig(request)).settings.activeProfile).toBeUndefined();
});

test('the display resolves the active profile screens', async ({ page, request }) => {
  // p2 (Evening) is scoped to s2 only, so the display must show s2 and hide s1.
  await putConfig(request, profileConfig('p2'));
  // Drain any command left in the legacy __default__ queue by an earlier
  // same-worker test (e.g. a broadcast sleep). A real kiosk polling here would
  // otherwise consume it, go asleep/reload, and poison downstream tests.
  await request.get('/api/display/commands');
  await page.goto('/display');

  await expect(page.getByText('SCREEN TWO')).toBeVisible();
  await expect(page.getByText('SCREEN ONE')).toBeHidden();
});
