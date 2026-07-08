import { test, expect } from '../fixtures';
import { getConfig } from '../helpers/api';
import { baseConfig } from '../helpers/config-fixtures';

test('sandboxed server serves the seeded fixture config', async ({ request }) => {
  const config = await getConfig(request);
  expect(config.version).toBe(baseConfig().version);
  expect(config.settings.telemetryEnabled).toBe(false);
  expect(config.screens[0].modules[0].type).toBe('text');
});
