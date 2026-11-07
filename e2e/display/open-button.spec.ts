import { test, expect } from '../fixtures';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { renderOnDisplay } from '../helpers/display';

/**
 * A module's open button and a screen that shows only when opened: the
 * button carries the target screen's name, a tap shows that screen with a
 * back chip, the screen never takes a turn of its own, and the display goes
 * back where it came from after the screen's quiet time or on the chip.
 */

function config(goBackAfterMs: number) {
  return baseConfig({
    screens: [
      makeScreen('kitchen', 'Kitchen', [
        textModule('KITCHEN', { position: { x: 100, y: 100 } }),
        {
          ...buildModuleInstance('meal-planner'),
          position: { x: 100, y: 400 },
          size: { w: 880, h: 700 },
          openButtonScreen: 'recipes',
        },
      ]),
      makeScreen('weather', 'Weather', [textModule('WEATHER PAGE', { position: { x: 100, y: 100 } })]),
      makeScreen('recipes', 'Recipe Book', [
        textModule('RECIPE BOOK', { position: { x: 100, y: 100 } }),
        // Reaches the frame's bottom: it gives up the strip the back chip sits on.
        textModule('LAST ROW', { position: { x: 0, y: 1700 }, size: { w: 1080, h: 220 } }),
      ], { rotation: 'opened', goBackAfterMs }),
    ],
    settings: { rotationIntervalMs: 60_000 },
  });
}

test('the button names its screen, opens it with a back chip, and the chip returns', async ({ page, request }) => {
  await renderOnDisplay(page, request, config(60_000));
  await expect(page.getByText('KITCHEN', { exact: true })).toBeVisible();

  // The opened-only screen has no dot: two screens rotate.
  const dots = page.getByTestId('pagination-dots').getByRole('button');
  await expect(dots).toHaveCount(2);

  const button = page.getByTestId('open-screen-button');
  await expect(button).toHaveAttribute('aria-label', 'Open Recipe Book');
  await expect(button).toContainText('Recipe Book');
  // The card keeps its content clear of the pill: its bottom padding grows
  // by the pill's height, so the content box ends above the pill.
  const card = page.locator('[data-module-type="meal-planner"] [data-module-card]');
  const padding = await card.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { top: parseFloat(cs.paddingTop), bottom: parseFloat(cs.paddingBottom) };
  });
  const pill = (await button.boundingBox())!;
  expect(padding.bottom).toBeGreaterThanOrEqual(padding.top + pill.height);

  await button.click();
  await expect(page.getByText('RECIPE BOOK', { exact: true })).toBeVisible();
  await expect(page.getByText('KITCHEN', { exact: true })).toBeHidden();
  const chip = page.getByRole('button', { name: 'Back to Kitchen' });
  await expect(chip).toBeVisible();
  await expect(page.getByTestId('pagination-dots')).toBeHidden();
  // Drawn inside the display frame, so it scales with the wall: at 1080 wide
  // it is the frame's own 72 px tall, inset from the bottom-left corner.
  const chipBox = (await chip.boundingBox())!;
  expect(Math.round(chipBox.height)).toBe(72);
  expect(chipBox.x).toBeGreaterThan(30);
  const lastRow = (await page.locator('[data-module-id="text-last-row"]').boundingBox())!;
  expect(lastRow.y + lastRow.height).toBeLessThanOrEqual(chipBox.y);
  // The status report has no rotation index for a screen with no turn.
  const status = await request.get('/api/display/status').then((r) => r.json());
  expect(status.currentScreen).toMatchObject({ id: 'recipes', index: -1 });

  await chip.click();
  await expect(page.getByText('KITCHEN', { exact: true })).toBeVisible();
  await expect(page.getByText('RECIPE BOOK', { exact: true })).toBeHidden();
  await expect(dots).toHaveCount(2);
});

test('the quiet time takes the display back on its own, and a touch starts it again', async ({ page, request }) => {
  await renderOnDisplay(page, request, config(2_000));
  await page.getByTestId('open-screen-button').click();
  await expect(page.getByText('RECIPE BOOK', { exact: true })).toBeVisible();

  // A touch a second in restarts the count: still up after the original
  // two seconds would have passed.
  await page.waitForTimeout(1_200);
  await page.getByText('RECIPE BOOK', { exact: true }).click();
  await page.waitForTimeout(1_200);
  await expect(page.getByText('RECIPE BOOK', { exact: true })).toBeVisible();

  await expect(page.getByText('KITCHEN', { exact: true })).toBeVisible({ timeout: 4_000 });
  await expect(page.getByText('RECIPE BOOK', { exact: true })).toBeHidden();
});

test('a quiet time of 0 stays until someone moves on, and a flick means back', async ({ page, request }) => {
  await renderOnDisplay(page, request, config(0));
  await page.getByTestId('open-screen-button').click();
  await expect(page.getByText('RECIPE BOOK', { exact: true })).toBeVisible();
  await page.waitForTimeout(2_500);
  await expect(page.getByText('RECIPE BOOK', { exact: true })).toBeVisible();

  // A sideways flick on an opened screen goes back where the display came
  // from, never to the next screen in the rotation.
  await page.mouse.move(800, 1000);
  await page.mouse.down();
  await page.mouse.move(300, 1000, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText('KITCHEN', { exact: true })).toBeVisible();
  await expect(page.getByText('WEATHER PAGE', { exact: true })).toBeHidden();
});

test('Escape goes back, and a quick second tap on the button does nothing on the screen it opened', async ({ page, request }) => {
  await renderOnDisplay(page, request, config(60_000));
  const button = page.getByTestId('open-screen-button');
  await button.dblclick();
  await expect(page.getByText('RECIPE BOOK', { exact: true })).toBeVisible();
  // The second click landed inside the guard: still on the book, chip up.
  await expect(page.getByRole('button', { name: 'Back to Kitchen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('KITCHEN', { exact: true })).toBeVisible();
});

test('the chip carries a line that empties over the last seconds', async ({ page, request }) => {
  await renderOnDisplay(page, request, config(60_000));
  await page.getByTestId('open-screen-button').click();
  await expect(page.getByTestId('opened-screen-leaving')).toBeAttached();
});

test('a phone command reaches a screen that shows only when opened', async ({ page, request }) => {
  await renderOnDisplay(page, request, config(60_000));
  const res = await request.post('/api/display/goto-screen', { data: { screen: 'Recipe Book' } });
  expect(res.ok()).toBe(true);
  await expect(page.getByText('RECIPE BOOK', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Back to Kitchen' })).toBeVisible();
});
