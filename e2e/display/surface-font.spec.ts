import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { richWeather } from '../helpers/weather-payload';

/**
 * The display must render in the app's own typeface.
 *
 * `globals.css` shipped the Next.js scaffold's `body { font-family: Arial,
 * Helvetica, sans-serif }`, and only the editor and auth layouts wrapped their
 * tree in Tailwind's `font-sans`. Every module on /display, /remote and
 * /chores therefore inherited Arial while the editor previewed Inter — and a
 * Pi has no Arial at all, so fontconfig substituted Liberation Sans, which
 * carries no weight below 400 and different metrics.
 *
 * That is not only a cosmetic difference. `useFitScale` bisects against
 * measured text, so the two surfaces settled on different scale factors for
 * identical config (0.943 on the display vs 0.830 in the editor) and the
 * editor stopped being a faithful preview.
 *
 * These assert the rendered face, not the declared stack: `CSS.getPlatformFonts
 * ForNode` reports what Chromium actually rasterized, which is the only thing
 * that would have caught the original bug.
 */

/** The font families Chromium actually rasterized for `selector`. */
async function renderedFonts(page: Page, selector: string): Promise<string[]> {
  const client = await page.context().newCDPSession(page);
  await client.send('DOM.enable');
  await client.send('CSS.enable');
  const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  expect(nodeId, `${selector} not found`).toBeTruthy();
  const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
  return fonts.map((f) => f.familyName);
}

test.describe('the display renders in the app font', () => {
  test.beforeEach(async ({ page, request }) => {
    await stubModuleData(page, { overrides: { weather: richWeather() } });
    await putConfig(request, baseConfig({
      screens: [makeScreen('s1', 'S1', [buildModuleInstance('fullscreen-weather', { theme: 'linen', view: 'panorama' })])],
      settings: matrixSettings(),
    }));
  });

  test('module text on /display rasterizes as Inter, not a system fallback', async ({ page }) => {
    await page.goto('/display');
    const root = page.locator('[data-testid="fullscreen-weather"]');
    await expect(root).toBeVisible();
    await expect(root).toContainText('°');

    const fonts = await renderedFonts(page, '[data-testid="fsw-hero-temp"]');
    expect(fonts, `hero rendered in ${fonts.join('+')}`).toContain('Inter');
    for (const banned of ['Arial', 'Liberation Sans', 'Helvetica', 'Nimbus Sans', 'Times New Roman']) {
      expect(fonts, `hero fell back to ${banned}`).not.toContain(banned);
    }
  });

  test('the display body never inherits the scaffold Arial stack', async ({ page }) => {
    await page.goto('/display');
    await expect(page.locator('[data-testid="fullscreen-weather"]')).toBeVisible();
    // getComputedStyle resolves the var(), so this reads as the next/font
    // family name plus its metric-matched fallback, e.g.
    // `inter, "inter Fallback", system-ui, sans-serif`.
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(family).toMatch(/inter/i);
    expect(family, 'the display still inherits the scaffold Arial stack').not.toMatch(/^Arial/);
  });

  test('/remote inherits the same stack as the display', async ({ page }) => {
    await page.goto('/remote');
    await page.waitForLoadState('domcontentloaded');
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(family).toMatch(/inter/i);
    expect(family, '/remote still inherits the scaffold Arial stack').not.toMatch(/^Arial/);
  });
});
