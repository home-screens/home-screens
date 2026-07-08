import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, fixturesByKind, matrixSettings } from '../helpers/module-fixtures';

/**
 * Render matrix — network-free modules. Each renders from config / clock /
 * local calc with no data fetch, so a `stubModuleData` external-block catch-all
 * both isolates the render and proves the module made zero external calls
 * (asserted via `externalHits`).
 */
for (const fx of fixturesByKind('network-free')) {
  test(`network-free module renders: ${fx.type}`, async ({ page, request }) => {
    const stub = await stubModuleData(page); // blocks any non-app host
    const config = baseConfig({
      screens: [makeScreen('s1', 'S1', [buildModuleInstance(fx.type, fx.config)])],
      settings: matrixSettings(),
    });
    const display = await renderOnDisplay(page, request, config);

    await fx.expect(display.module(fx.type), page);
    expect(stub.externalHits, `${fx.type} must not call any external host`).toEqual([]);
  });
}
