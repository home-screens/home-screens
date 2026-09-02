import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance, ScreenConfiguration } from '@/types/config';

function clockModule(id: string): ModuleInstance {
  return {
    id,
    type: 'clock',
    position: { x: 100, y: 100 },
    size: { w: 400, h: 200 },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    config: {},
  };
}

/** One display pool: Morning (2 clocks + text), Family Calendar (text), Clock wall (text only). */
function legacyConfig(): ScreenConfiguration {
  return baseConfig({
    screens: [
      makeScreen('morning', 'Morning', [clockModule('clock-a'), clockModule('clock-b'), textModule('MORNING TEXT')]),
      makeScreen('family', 'Family Calendar', [textModule('FAMILY TEXT')]),
      makeScreen('wall', 'Clock wall', [textModule('WALL TEXT')]),
    ],
  });
}

function twoDisplayConfig(): ScreenConfiguration {
  return baseConfig({
    displays: [
      {
        id: 'main', name: 'Kitchen',
        screens: [makeScreen('k-home', 'Home', [textModule('KITCHEN HOME')])],
      },
      {
        id: 'hall', name: 'Hallway',
        screens: [
          makeScreen('h-photos', 'Photos', [textModule('HALL PHOTOS')]),
          makeScreen('h-clocks', 'Clocks', [clockModule('hall-clock')]),
        ],
      },
    ],
  });
}

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
}

async function openSearch(page: Page): Promise<void> {
  await page.getByTestId('screen-search-button').click();
  await expect(page.getByTestId('screen-search-input')).toBeFocused();
}

const activeTab = (page: Page) => page.locator('[data-active="true"]');

test.describe('screen search', () => {
  test.beforeEach(async ({ page, request }) => {
    await putConfig(request, legacyConfig());
    await openEditor(page);
  });

  test('lists every screen holding a matching module, with a count for repeats', async ({ page }) => {
    await openSearch(page);
    await page.getByTestId('screen-search-input').fill('clock');

    const results = page.getByTestId('screen-search-result');
    await expect(results).toHaveCount(2);
    // Morning has two clocks (module match); Clock wall matches by name only.
    await expect(results.nth(0)).toHaveAttribute('data-screen-id', 'morning');
    await expect(results.nth(0)).toContainText('Clock');
    await expect(results.nth(0)).toContainText('×2');
    await expect(results.nth(0)).toContainText('this screen');
    await expect(results.nth(1)).toHaveAttribute('data-screen-id', 'wall');
    await expect(results.nth(1).locator('mark')).toHaveText('Clock');
    // Name-only matches carry no module chips.
    await expect(results.nth(1).locator('span.rounded-full')).toHaveCount(0);
  });

  test('clicking a result switches the editor to that screen', async ({ page }) => {
    await expect(activeTab(page)).toHaveText(/Morning/);
    await openSearch(page);
    await page.getByTestId('screen-search-input').fill('family');
    await page.getByTestId('screen-search-result').first().click();

    await expect(page.getByTestId('screen-search-popover')).toHaveCount(0);
    await expect(activeTab(page)).toHaveText(/Family Calendar/);
    await expect(page.locator('[data-module-id="text-family-text"]')).toBeVisible();
    await expect(page).toHaveURL(/screen=family/);
  });

  test('keyboard: Cmd/Ctrl+K opens, arrows move, Enter goes, Escape closes', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByTestId('screen-search-input')).toBeFocused();

    await page.keyboard.type('clock');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('screen-search-result').nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(activeTab(page)).toHaveText(/Clock wall/);

    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByTestId('screen-search-popover')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('screen-search-popover')).toHaveCount(0);
  });

  test('Escape still closes after clicking a non-focusable part of the popover', async ({ page }) => {
    await openSearch(page);
    await page.getByTestId('screen-search-input').fill('clock');
    // Click the footer text: the popover stays open but the input loses focus.
    await page.getByTestId('screen-search-popover').getByText('2 screens').click();
    await expect(page.getByTestId('screen-search-input')).not.toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('screen-search-popover')).toHaveCount(0);
  });

  test('closing hands focus back to the search button', async ({ page }) => {
    await openSearch(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('screen-search-button')).toBeFocused();
  });

  test('Cmd/Ctrl+K stays out of a tab rename in progress', async ({ page }) => {
    await activeTab(page).dblclick();
    const rename = activeTab(page).locator('input');
    await expect(rename).toBeFocused();
    await rename.fill('Kit');
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByTestId('screen-search-popover')).toHaveCount(0);
    await expect(rename).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(activeTab(page)).toHaveText(/Morning/);
  });

  test('opening search closes the add-screen menu, and vice versa', async ({ page }) => {
    await page.getByLabel('Add screen').click();
    const addMenu = page.getByText('Blank Screen');
    await expect(addMenu).toBeVisible();
    await page.getByTestId('screen-search-button').click();
    await expect(addMenu).toHaveCount(0);
    await expect(page.getByTestId('screen-search-popover')).toBeVisible();

    await page.getByLabel('Add screen').click();
    await expect(page.getByTestId('screen-search-popover')).toHaveCount(0);
    await expect(page.getByText('Blank Screen')).toBeVisible();
  });

  test('shows a plain no-match message naming the query', async ({ page }) => {
    await openSearch(page);
    await page.getByTestId('screen-search-input').fill('zzzz');
    await expect(page.getByTestId('screen-search-empty')).toContainText('“zzzz”');
    await expect(page.getByTestId('screen-search-result')).toHaveCount(0);
  });
});

test.describe('screen search across displays', () => {
  test.beforeEach(async ({ page, request }) => {
    await putConfig(request, twoDisplayConfig());
    await openEditor(page);
  });

  test('finds screens on other displays and switches display then screen', async ({ page }) => {
    await expect(page.locator('[data-module-id="text-kitchen-home"]')).toBeVisible();
    await openSearch(page);
    await page.getByTestId('screen-search-input').fill('clock');

    const result = page.getByTestId('screen-search-result');
    await expect(result).toHaveCount(1);
    await expect(result).toHaveAttribute('data-display-id', 'hall');
    await expect(result).toContainText('Hallway');
    await result.click();

    await expect(page.getByTestId('display-switcher')).toContainText('Hallway');
    await expect(activeTab(page)).toHaveText(/Clocks/);
    await expect(page.locator('[data-module-id="hall-clock"]')).toBeVisible();
    await expect(page).toHaveURL(/display=hall/);
    await expect(page).toHaveURL(/screen=h-clocks/);
  });

  test('a tab context menu opened before the switch does not survive it', async ({ page }) => {
    await activeTab(page).click({ button: 'right' });
    await expect(page.getByText('Move Left')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type('clock');
    await page.keyboard.press('Enter');
    await expect(activeTab(page)).toHaveText(/Clocks/);
    await expect(page.getByText('Move Left')).toHaveCount(0);
  });
});
