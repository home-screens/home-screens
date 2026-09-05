import type { Locator } from '@playwright/test';
import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { renderOnDisplay } from '../helpers/display';

/**
 * The sun arc and sun circle draw their labels inside a viewBox'd SVG, in
 * user-space units, and scale them by the module's Text size (`svgFontSize`).
 * The factor is `textScale` alone: a module that still carries only the old
 * pixel size renders its labels exactly as it always did. Scaling them by the
 * stored pixel value tripled every label on a 48px arc at upgrade, with the
 * label positions left where they were.
 */

function svgLabelSizes(mod: Locator) {
  return mod.locator('svg text').evaluateAll((els) =>
    els.map((el) => parseFloat(getComputedStyle(el).fontSize)).filter((n) => Number.isFinite(n)),
  );
}

for (const view of ['arc', 'circle'] as const) {
  test(`sunrise-sunset ${view}: an old pixel size leaves the SVG labels alone; Text size scales them`, async ({ page, request }) => {
    const legacy = buildModuleInstance('sunrise-sunset', { view });
    legacy.style = { ...legacy.style, fontSize: 48 };
    const display = await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'S1', [legacy])],
      settings: matrixSettings(),
    }));
    const mod = display.module('sunrise-sunset');
    await expect(mod.locator('svg text').first()).toBeAttached();
    const before = await svgLabelSizes(mod);
    expect(before.length).toBeGreaterThan(0);

    // The same module at 300% Text size: every label three times as large.
    const scaled = buildModuleInstance('sunrise-sunset', { view });
    scaled.style = { ...scaled.style, fontSize: 16, textScale: 300 };
    const display2 = await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'S1', [scaled])],
      settings: matrixSettings(),
    }));
    const mod2 = display2.module('sunrise-sunset');
    await expect(mod2.locator('svg text').first()).toBeAttached();
    const after = await svgLabelSizes(mod2);
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) {
      expect(after[i]).toBeCloseTo(before[i]! * 3, 1);
    }
    // And the legacy render was at the authored units: no label near 3x.
    const unscaled = buildModuleInstance('sunrise-sunset', { view });
    const display3 = await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'S1', [unscaled])],
      settings: matrixSettings(),
    }));
    const base = await svgLabelSizes(display3.module('sunrise-sunset'));
    expect(base).toEqual(before);
  });
}
