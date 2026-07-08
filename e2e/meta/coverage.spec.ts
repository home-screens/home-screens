import { test, expect } from '@playwright/test';
import { getAllModuleDefinitions } from '@/lib/module-registry';
import { MODULE_FIXTURES } from '../helpers/module-fixtures';

/**
 * Coverage ratchet. Every built-in module type must have a row in the E2E
 * fixture registry (e2e/helpers/module-fixtures.ts), and the registry must not
 * carry fixtures for types that no longer exist. Adding a new module without a
 * fixture — or deleting a module without pruning its fixture — turns this red.
 *
 * This is a pure assertion (no browser/server) — it uses the base Playwright
 * `test`, not the server-booting fixture.
 */
test('every built-in module type has an E2E fixture, and no fixture is stale', () => {
  const builtin = getAllModuleDefinitions()
    .map((d) => d.type)
    .filter((t) => !t.startsWith('plugin:'));

  const missing = builtin.filter((t) => !(t in MODULE_FIXTURES));
  expect(missing, `Built-in modules missing an E2E fixture: ${missing.join(', ')}`).toEqual([]);

  const stale = Object.keys(MODULE_FIXTURES).filter((t) => !builtin.includes(t as (typeof builtin)[number]));
  expect(stale, `Fixtures reference unknown module types: ${stale.join(', ')}`).toEqual([]);

  // Guards against a silent registry shrink (e.g. a bad merge dropping types).
  expect(builtin.length).toBe(41);
});
