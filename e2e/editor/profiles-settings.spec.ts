import { test, expect } from '../fixtures';
import { putConfig, getConfig } from '../helpers/api';
import { baseConfig } from '../helpers/config-fixtures';
import { autosaved } from '../helpers/editor';
import type { Profile, ScreenConfiguration } from '@/types/config';

/**
 * Editor › Defaults › Profiles (`ProfilesSection`). Distinct from
 * e2e/remote/profiles.spec.ts, which only exercises the /remote switcher.
 * The section auto-saves every profile mutation via a 500ms `useDebouncedSave`
 * (no Save button), so each action is wrapped in `autosaved` to await the PUT.
 *
 * `BaseConfigOverrides` has no `profiles` field, so profiles are attached to
 * the built config rather than passed to `baseConfig`.
 */
function configWithProfiles(profiles: Profile[]): ScreenConfiguration {
  const config = baseConfig();
  config.profiles = profiles;
  return config;
}

/** A profile card, addressed via its name span's `rounded-lg` root ancestor. */
function profileCard(page: import('@playwright/test').Page, name: string) {
  return page
    .getByText(name, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
}

test('adding a profile persists and appears in the active-profile select', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=profiles');
  await expect(page.getByRole('button', { name: 'Add Profile' })).toBeVisible();

  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Add Profile' }).click();
  });

  // The new card renders the default name, and the active-profile select
  // (only shown once profiles exist) now offers it as an option.
  await expect(profileCard(page, 'Profile 1')).toBeVisible();
  await expect(page.getByLabel('Active Profile').locator('option', { hasText: 'Profile 1' })).toHaveCount(1);

  const config = await getConfig(request);
  expect(config.profiles?.[0]?.name).toBe('Profile 1');
});

test('picking an active profile persists settings.activeProfile', async ({ page, request }) => {
  await putConfig(request, configWithProfiles([{ id: 'p1', name: 'Evening', screenIds: [] }]));
  await page.goto('/editor/settings?section=defaults&page=profiles');

  await autosaved(page, async () => {
    await page.getByLabel('Active Profile').selectOption('p1');
  });

  await expect.poll(async () => (await getConfig(request)).settings.activeProfile).toBe('p1');
});

test('reordering profiles via drag persists the new order', async ({ page, request }) => {
  await putConfig(request, configWithProfiles([
    { id: 'p1', name: 'First', screenIds: [] },
    { id: 'p2', name: 'Second', screenIds: [] },
  ]));
  await page.goto('/editor/settings?section=defaults&page=profiles');

  const first = profileCard(page, 'First');
  const second = profileCard(page, 'Second');
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();

  // The drag handle is the first button in each card (dnd-kit's listeners live
  // on the GripVertical button, not on the card root).
  const handle = first.locator('button').first();
  const handleBox = (await handle.boundingBox())!;
  const secondBox = (await second.boundingBox())!;
  if (!handleBox || !secondBox) throw new Error('profile card / handle not found');

  // PointerSensor activates after >5px of travel; move past Second's midpoint so
  // closestCenter picks it as the drop target and verticalListSortingStrategy swaps.
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 12, { steps: 5 });
  await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2 + 8, { steps: 10 });
  await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height, { steps: 5 });
  await page.mouse.up();

  await expect
    .poll(async () => (await getConfig(request)).profiles?.map((p) => p.id))
    .toEqual(['p2', 'p1']);
});
