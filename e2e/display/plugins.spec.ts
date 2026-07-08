import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance } from '@/types/config';
import {
  seedFixturePlugin,
  FIXTURE_PLUGIN_ID,
  FIXTURE_PLUGIN_TYPE,
  FIXTURE_STATE_KEY,
} from '../helpers/fixture-plugin';

function pluginModule(config: Record<string, unknown> = {}): ModuleInstance {
  return {
    id: 'e2e-plugin-1',
    type: FIXTURE_PLUGIN_TYPE,
    position: { x: 0, y: 0 },
    size: { w: 320, h: 200 },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    config: { label: 'E2E PLUGIN', ...config },
  } as ModuleInstance;
}

// A fresh worker server per file; seed the plugin before any navigation so the
// first /api/plugins/installed read (on page load) picks it up.
test.beforeEach(async ({ sandboxDir }) => {
  seedFixturePlugin(sandboxDir);
});

test('an installed plugin renders on the display', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [pluginModule({ label: 'PLUGIN RENDER OK' })])],
  }));
  await page.goto('/display');

  // The loader fetches manifest + bundle and registers the component; wait it out.
  await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();
  await expect(page.getByText('PLUGIN RENDER OK')).toBeVisible();
});

test('a plugin-published state key gates a conditioned module', async ({ page, request }) => {
  const gated = textModule('CONDITIONED CONTENT', {
    id: 'gated',
    visibility: { conditions: [{ kind: 'state', sourceKey: FIXTURE_STATE_KEY, equals: 'on' }], whenUnknown: 'hide' },
  });
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [pluginModule(), gated])],
  }));
  await page.goto('/display');

  // The plugin publishes `flag = on` on mount, which satisfies the condition.
  await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();
  await expect(page.getByText('CONDITIONED CONTENT')).toBeVisible();
});

test('the plugin appears in the editor palette', async ({ page, request }) => {
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [])] }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await page.getByPlaceholder('Search modules…').fill('E2E Fixture');
  await expect(page.getByTestId(`palette-${FIXTURE_PLUGIN_TYPE}`)).toBeVisible();
});

test('the proxy rejects a request to a non-allowlisted domain (SSRF guard)', async ({ request }) => {
  // No page needed — the proxy reads allowedDomains from the on-disk manifest.
  const res = await request.post(`/api/plugins/proxy/${FIXTURE_PLUGIN_ID}`, {
    data: { url: 'https://evil.example.org/steal' },
  });
  // allowedDomains is ['api.example.com'], so a different host is refused.
  expect(res.ok()).toBe(false);
  expect(res.status()).toBeGreaterThanOrEqual(400);
});
