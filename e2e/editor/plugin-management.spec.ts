import { promises as fs } from 'fs';
import path from 'path';
import { test, expect } from '../fixtures';
import { putConfig, getConfig } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance } from '@/types/config';
import { seedFixturePlugin, FIXTURE_PLUGIN_ID, FIXTURE_PLUGIN_TYPE } from '../helpers/fixture-plugin';

const SECRET_KEY = 'apiKey';
const SECRET_LABEL = 'API Key';
const SECRET_VALUE = 'sk-e2e-test-value';

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

// ---------------------------------------------------------------------------
// Install-from-URL modal
// ---------------------------------------------------------------------------

// The full happy-path install (Step 1 in the plan) is intentionally omitted:
// `/api/plugins/install-external` downloads and extracts a real signed .tar.gz
// server-side, and the outbound fetch the route handler makes is not
// interceptable by Playwright's page.route (which only covers browser-issued
// requests). Producing a valid installable tarball fixture is disproportionate
// to the coverage gained, so per the plan we cover the error path only.

test('a failed install-from-url shows the error state and can retry', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await page.getByRole('button', { name: 'Plugins' }).click();
  await page.getByRole('button', { name: /install from url/i }).click();

  const modal = page.getByRole('dialog', { name: 'Install plugin from URL' });
  await expect(modal).toBeVisible();

  // `.invalid` is a reserved TLD (RFC 6761) that never resolves, so the route's
  // SSRF DNS guard rejects it deterministically with no real network egress.
  await modal.getByPlaceholder(/plugin\.tar\.gz/i).fill('https://plugin.invalid/nonexistent.tar.gz');
  await modal.getByRole('button', { name: 'Install' }).click();

  // Error state exposes a "Try again" button that returns to the entry step.
  await expect(modal.getByRole('button', { name: 'Try again' })).toBeVisible();
  await modal.getByRole('button', { name: 'Try again' }).click();
  await expect(modal.getByPlaceholder(/plugin\.tar\.gz/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Plugin secrets
// ---------------------------------------------------------------------------

test.describe('plugin secrets', () => {
  test.beforeEach(async ({ sandboxDir }) => {
    seedFixturePlugin(sandboxDir, {
      secrets: [{ key: SECRET_KEY, label: SECRET_LABEL, required: true }],
    });
  });

  test('entering a plugin secret persists to disk (not config.json) and stays masked', async ({
    page,
    request,
    sandboxDir,
  }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('s1', 'S1', [pluginModule()])],
    }));
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();

    // Select the plugin module so its PropertyPanel renders.
    await page.locator('[data-module-id="e2e-plugin-1"]').click();

    // Expand the collapsed Secrets accordion.
    await page.getByRole('button', { name: 'Secrets' }).click();

    // The secret input is a password field (label rendered as a sibling span,
    // not an associated <label>), located by its "Enter <label>" placeholder.
    const secretInput = page.getByPlaceholder(`Enter ${SECRET_LABEL.toLowerCase()}`);
    await expect(secretInput).toBeVisible();
    // Masked at rest: the browser never renders the typed value as plain text.
    await expect(secretInput).toHaveAttribute('type', 'password');

    const savePut = page.waitForResponse(
      (r) => r.url().includes(`/api/plugins/secrets/${FIXTURE_PLUGIN_ID}`)
        && r.request().method() === 'PUT'
        && r.ok(),
    );
    await secretInput.fill(SECRET_VALUE);
    // Save button is the sibling of the input inside the field row.
    await secretInput.locator('..').getByRole('button', { name: 'Save' }).click();
    await savePut;

    await expect(page.getByText('Saved successfully')).toBeVisible();
    // On success the field clears — the raw value is never left in the DOM.
    await expect(secretInput).toHaveValue('');

    // Persistence: the value lands in data/plugin-secrets/<id>.json, NOT config.
    const secretsFile = path.join(sandboxDir, 'data', 'plugin-secrets', `${FIXTURE_PLUGIN_ID}.json`);
    const stored = JSON.parse(await fs.readFile(secretsFile, 'utf-8'));
    expect(stored[SECRET_KEY]).toBe(SECRET_VALUE);

    const config = await getConfig(request);
    expect(JSON.stringify(config)).not.toContain(SECRET_VALUE);

    // The status endpoint reports the key as configured but never echoes the
    // raw value back to the client.
    const statusRes = await request.get(`/api/plugins/secrets/${FIXTURE_PLUGIN_ID}`);
    expect(statusRes.ok()).toBe(true);
    const status = await statusRes.json();
    expect(status.keys[SECRET_KEY]).toBe(true);
    expect(JSON.stringify(status)).not.toContain(SECRET_VALUE);
  });
});
