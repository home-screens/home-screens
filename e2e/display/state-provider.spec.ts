import { test, expect } from '../fixtures';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { putConfig } from '../helpers/api';
import { seedFixturePlugin, FIXTURE_PLUGIN_ID, FIXTURE_PLUGIN_TYPE } from '../helpers/fixture-plugin';
import type { ModuleInstance, ModuleVisibility } from '@/types/config';

/**
 * Demand-driven state providers, end to end on a real display.
 *
 * The fixture plugin is seeded with its PROVIDER_BUNDLE variant: the bundle
 * exports a `StateProvider` component (manifest `exports.stateProvider`) that
 * publishes every demanded key with `settings.publishValue` (default 'on').
 * The host's PluginServiceLayer computes the demand set from visibility
 * conditions and Text tokens and mounts the provider — so these specs place
 * ZERO fixture-plugin modules. Referencing a key is what makes it publish;
 * that inversion is the feature under test.
 */

const AUTO_KEY = 'plugin:e2e-fixture:auto.flag';
const LATER_KEY = 'plugin:e2e-fixture:later.flag';
const TOKEN_KEY = 'plugin:e2e-fixture:greeting';

function conditioned(id: string, content: string, sourceKey: string): ModuleInstance {
  const visibility: ModuleVisibility = {
    conditions: [{ kind: 'state', sourceKey, equals: 'on' }],
    whenUnknown: 'hide',
  };
  return textModule(content, { id, visibility });
}

test('a condition on a provider key publishes with zero plugin modules placed', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir, { stateProvider: true });

  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [
      textModule('ANCHOR', { id: 'anchor' }),
      conditioned('gated', 'DEMAND GATED', AUTO_KEY),
    ])],
  }));
  await expect(page.getByText('ANCHOR')).toBeVisible();

  // No fixture module is on any screen — the only possible producer is the
  // provider the host mounted from the demand set.
  await expect(page.getByText('DEMAND GATED')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(`[data-module-type="${FIXTURE_PLUGIN_TYPE}"]`)).toHaveCount(0);
});

test('adding a condition on a never-referenced key starts publishing within a config poll', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir, { stateProvider: true });

  const anchor = textModule('POLL ANCHOR', { id: 'anchor' });
  const first = conditioned('first', 'FIRST GATED', AUTO_KEY);
  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [anchor, first])],
  }));
  await expect(page.getByText('FIRST GATED')).toBeVisible({ timeout: 10_000 });

  // Reference a brand-new key. The display's 3s config poll picks it up, the
  // demand set grows, and the already-mounted provider publishes it — no
  // module placement, no reload, no user action.
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [anchor, first, conditioned('second', 'SECOND GATED', LATER_KEY)])],
  }));
  await expect(page.getByText('SECOND GATED')).toBeVisible({ timeout: 15_000 });
});

test('plugin settings reach the provider and shape what it publishes', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir, {
    stateProvider: true,
    settingsSchema: { type: 'object', properties: { publishValue: { type: 'string', title: 'Publish value' } } },
    settings: { publishValue: 'hello' },
  });

  // A Text token is also demand (extractSharedStateKeys feeds the demand set),
  // so this doubles as the token-driven-demand proof.
  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [
      textModule(`greeting=[{${TOKEN_KEY}}]`, { id: 'token-mod' }),
    ])],
  }));

  await expect(page.locator('[data-module-id="token-mod"]')).toContainText('greeting=[hello]', { timeout: 10_000 });
});

test('a live settings save reaches a running provider without a bundle reload', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir, {
    stateProvider: true,
    settingsSchema: { type: 'object', properties: { publishValue: { type: 'string', title: 'Publish value' } } },
    settings: { publishValue: 'hello' },
  });

  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [
      textModule(`greeting=[{${TOKEN_KEY}}]`, { id: 'token-mod' }),
    ])],
  }));
  await expect(page.locator('[data-module-id="token-mod"]')).toContainText('greeting=[hello]', { timeout: 10_000 });

  // Settings are deliberately excluded from the pluginHash — a save must ride
  // useLiveConfig's settings diff into the provider's prop, NOT the full
  // reload path. Any bundle refetch from here on means the reload path fired.
  let bundleFetches = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/plugins/bundle/')) bundleFetches += 1;
  });

  const res = await request.put(`/api/plugins/settings/${FIXTURE_PLUGIN_ID}`, {
    data: { settings: { publishValue: 'world' } },
  });
  expect(res.ok()).toBe(true);

  await expect(page.locator('[data-module-id="token-mod"]')).toContainText('greeting=[world]', { timeout: 15_000 });
  expect(bundleFetches).toBe(0);
});
