import { readFileSync } from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';
import { getAllModuleDefinitions } from '@/lib/module-registry';
import { MODULE_FIXTURES } from '../helpers/module-fixtures';

function builtinTypes(): string[] {
  return getAllModuleDefinitions()
    .map((d) => d.type)
    .filter((t) => !t.startsWith('plugin:'));
}

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
  const builtin = builtinTypes();

  const missing = builtin.filter((t) => !(t in MODULE_FIXTURES));
  expect(missing, `Built-in modules missing an E2E fixture: ${missing.join(', ')}`).toEqual([]);

  const stale = Object.keys(MODULE_FIXTURES).filter((t) => !builtin.includes(t as (typeof builtin)[number]));
  expect(stale, `Fixtures reference unknown module types: ${stale.join(', ')}`).toEqual([]);

  // Guards against a silent registry shrink (e.g. a bad merge dropping types).
  expect(builtin.length).toBe(41);
});

/**
 * PropertyPanel field-edit ratchet. Every built-in module type must have at
 * least one field-edit persistence test in config-editing.spec.ts. The tests
 * all construct their subject via `buildModuleInstance('<type>', ...)`, so the
 * set of covered types is parsed directly from the spec source — no
 * hand-maintained list to drift. Adding a module without a field-edit test
 * turns this red with the exact missing type named.
 */
test('every built-in module type has a PropertyPanel field-edit test', () => {
  const specSource = readFileSync(
    path.resolve(__dirname, '..', 'editor', 'config-editing.spec.ts'),
    'utf8',
  );
  const covered = new Set(
    [...specSource.matchAll(/buildModuleInstance\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
  );

  const missing = builtinTypes().filter((t) => !covered.has(t));
  expect(
    missing,
    `Built-in modules with no PropertyPanel field-edit test in config-editing.spec.ts: ${missing.join(', ')}`,
  ).toEqual([]);
});
