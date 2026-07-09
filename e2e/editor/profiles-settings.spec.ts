import { test, expect } from '../fixtures';
import { putConfig, getConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
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

test('renaming a profile commits and persists the new name', async ({ page, request }) => {
  await putConfig(request, configWithProfiles([{ id: 'p1', name: 'Evening', screenIds: [] }]));
  await page.goto('/editor/settings?section=defaults&page=profiles');

  const card = profileCard(page, 'Evening');
  await expect(card).toBeVisible();

  // The Pencil button swaps the name span for an inline input (renamingId set).
  // That removes the "Evening" text node, so the profileCard-by-text locator no
  // longer resolves — address the autofocused rename input at the page level
  // (it's the only textbox on the profiles page).
  await card.locator('button[title="Rename"]').click();
  const input = page.getByRole('textbox');
  await input.fill('Morning');
  // Enter → commitRename → updateProfile → the section's 500ms debounced PUT.
  await autosaved(page, async () => { await input.press('Enter'); });

  await expect(profileCard(page, 'Morning')).toBeVisible();
  await expect.poll(async () => (await getConfig(request)).profiles?.[0]?.name).toBe('Morning');
});

test('deleting a profile removes it after confirming the dialog', async ({ page, request }) => {
  await putConfig(request, configWithProfiles([
    { id: 'p1', name: 'Alpha Profile', screenIds: [] },
    { id: 'p2', name: 'Bravo Profile', screenIds: [] },
  ]));
  await page.goto('/editor/settings?section=defaults&page=profiles');

  await profileCard(page, 'Alpha Profile').locator('button[title="Delete profile"]').click();

  // ConfirmModal — a shared danger dialog (role=dialog). Its confirm button is
  // labeled with the profile page's deleteDialog.confirm ("Delete").
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await autosaved(page, async () => {
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  });

  await expect(profileCard(page, 'Alpha Profile')).toHaveCount(0);
  await expect.poll(async () => (await getConfig(request)).profiles?.map((p) => p.id)).toEqual(['p2']);
});

test('assigning then removing a screen updates the profile screen set', async ({ page, request }) => {
  const config = baseConfig({
    screens: [makeScreen('s-alpha', 'Alpha', []), makeScreen('s-bravo', 'Bravo', [])],
  });
  config.profiles = [{ id: 'p1', name: 'My Profile', screenIds: [] }];
  await putConfig(request, config);
  await page.goto('/editor/settings?section=defaults&page=profiles');

  const card = profileCard(page, 'My Profile');
  await expect(card).toBeVisible();
  // Expand the card body (the name button toggles it) to reveal the screen lists.
  await card.getByRole('button', { name: 'My Profile' }).click();

  // Screens start unassigned, so both appear as clickable "+ <name>" adders.
  await autosaved(page, async () => {
    await card.getByRole('button', { name: /Alpha/ }).click();
  });
  await expect.poll(async () => (await getConfig(request)).profiles?.[0]?.screenIds).toContain('s-alpha');

  // The now-included screen row carries an X remover (title="Remove from profile").
  await autosaved(page, async () => {
    await card.locator('button[title="Remove from profile"]').click();
  });
  await expect.poll(async () => (await getConfig(request)).profiles?.[0]?.screenIds).not.toContain('s-alpha');
});

test('enabling a profile schedule for today auto-activates it at display runtime', async ({ page, request }) => {
  // Editor-side schedule edit → display-side auto-activation, end to end. The
  // runtime half mirrors e2e/display/profiles-runtime.spec.ts: a window keyed
  // on today's day-of-week reliably brackets "now" against the browser's live
  // clock (both the editor and the display run in the same timezone here).
  const config = baseConfig({
    screens: [
      makeScreen('default-screen', 'Default', [textModule('DEFAULT SET SCREEN')]),
      makeScreen('profile-screen', 'Profile', [textModule('SCHEDULED PROFILE SCREEN')]),
    ],
  });
  config.profiles = [{ id: 'p1', name: 'Evening', screenIds: ['profile-screen'] }];
  await putConfig(request, config);
  await page.goto('/editor/settings?section=defaults&page=profiles');

  const card = profileCard(page, 'Evening');
  await card.getByRole('button', { name: 'Evening' }).click(); // expand

  // Toggle "Auto-activate on schedule" — seeds schedule.daysOfWeek to weekdays.
  await autosaved(page, async () => {
    await card.locator('label', { hasText: 'Auto-activate on schedule' }).getByRole('switch').click();
  });

  // Ensure today is one of the active days (the weekday default already covers
  // Mon–Fri; on a weekend we click today's chip to add it). Day chips render in
  // Sun..Sat order, so nth(getDay()) is today's button.
  const today = new Date().getDay();
  const dayButtons = card.locator('div.flex.gap-1 > button');
  await expect(dayButtons).toHaveCount(7);
  const todayBtn = dayButtons.nth(today);
  if (!(await todayBtn.getAttribute('class'))?.includes('bg-hs-accent')) {
    await autosaved(page, async () => { await todayBtn.click(); });
  }
  await expect
    .poll(async () => (await getConfig(request)).profiles?.[0]?.schedule?.daysOfWeek)
    .toContain(today);

  // The display auto-activates the scheduled profile: only its screen rotates,
  // and the default-set screen is filtered out of the DOM entirely.
  await page.goto('/display');
  await expect(page.getByText('SCHEDULED PROFILE SCREEN', { exact: true })).toBeVisible();
  await expect(page.getByText('DEFAULT SET SCREEN', { exact: true })).toHaveCount(0);
});
