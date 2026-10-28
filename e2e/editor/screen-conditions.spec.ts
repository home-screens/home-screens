import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { autosaved } from '../helpers/editor';

/**
 * Authoring a screen's own visibility conditions under Screen settings (the
 * property panel with no module selected). The runtime side lives in
 * display/shared-state.spec.ts; this file covers the editor form and the tab
 * badge. The conditions editor itself is the module one with screen wording,
 * so the per-field behaviour is covered by editor/visibility-conditions.spec.ts.
 */

test('turning on screen conditions and adding one persists screen.visibility and badges the tab', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('travel', 'Travel', [textModule('TRAVEL TIMES')])],
  }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await expect(page.getByText('Select a module to edit')).toBeVisible();

  // Both editors sit in Screen settings; the schedule one is still there,
  // under its own switch, and the conditions one reads "screen", not "module".
  await expect(page.getByRole('switch', { name: 'Only show at certain times' })).toBeVisible();
  await expect(page.getByTestId('screen-tab-conditional')).toHaveCount(0);

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show only when conditions match' }).click();
  });
  expect((await getConfig(request)).screens[0].visibility).toEqual({ conditions: [] });
  await expect(page.getByText('No conditions yet. The screen always shows until you add one.')).toBeVisible();

  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Add condition' }).click();
  });
  await page.getByLabel('What to check').fill('calendar.busy_now');
  await page.getByLabel('Value').fill('true');
  await page.getByLabel('Value').blur();

  await expect
    .poll(async () => (await getConfig(request)).screens[0].visibility?.conditions[0])
    .toMatchObject({ kind: 'state', sourceKey: 'calendar.busy_now', equals: 'true' });
  await expect(page.getByTestId('screen-tab-conditional')).toHaveCount(1);
  await expect(page.getByRole('option', { name: 'Leave the screen out' })).toHaveCount(1);

  // Switching it off removes the block and the badge.
  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show only when conditions match' }).click();
  });
  await expect.poll(async () => (await getConfig(request)).screens[0].visibility).toBeUndefined();
  await expect(page.getByTestId('screen-tab-conditional')).toHaveCount(0);
});
