import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';
import { getAllModuleDefinitions } from '@/lib/module-registry';
import { DEFAULT_PAGE_IDS, PER_DISPLAY_SUBTABS } from '@/lib/settings-route';
import { LOCALES } from '@/i18n/manifest';
import { MODULE_FIXTURES } from '../helpers/module-fixtures';
import { VIEW_MATRIX } from '../helpers/view-matrix';
import { CONFIG_VARIANTS } from '../helpers/config-variants';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function builtinTypes(): string[] {
  return getAllModuleDefinitions()
    .map((d) => d.type)
    .filter((t) => !t.startsWith('plugin:'));
}

/** kebab module type → Pascal identifier, e.g. `stock-ticker` → `StockTicker`. */
const toPascal = (kebab: string): string =>
  kebab.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');

/** Pascal identifier → kebab module type, e.g. `StockTicker` → `stock-ticker`. */
const toKebab = (pascal: string): string =>
  pascal.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * Parse every `*View` / `*ViewMode` string-literal union out of src/types/config.ts.
 * Returns a map of union type name → set of its member strings. Multi-line unions
 * (ClockView, ShapeView) are handled by consuming up to the terminating `;`.
 */
function parseConfigViewUnions(): Map<string, Set<string>> {
  const src = readFileSync(path.resolve(REPO_ROOT, 'src/types/config.ts'), 'utf8');
  const unions = new Map<string, Set<string>>();
  const re = /\btype\s+([A-Za-z0-9]+View(?:Mode)?)\s*=\s*([\s\S]*?);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const members = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    if (members.length) unions.set(m[1], new Set(members));
  }
  return unions;
}

/** Resolve a module type to its config view union via the naming convention. */
function viewTypeForModule(moduleType: string, unions: Map<string, Set<string>>): string | null {
  const base = toPascal(moduleType);
  if (unions.has(`${base}View`)) return `${base}View`;
  if (unions.has(`${base}ViewMode`)) return `${base}ViewMode`;
  return null;
}

/** Recursively list every file under `dir`. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
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

/**
 * View drift ratchet. module-views.spec.ts's `VIEW_MATRIX` renders each
 * multi-view module in every one of its views, but that list is hand-maintained
 * and its own comment admits the coverage ratchet "doesn't police views". This
 * closes that gap: for every module already in the matrix, assert each member of
 * its config `*View` union appears in the matrix — so adding a view to
 * src/types/config.ts without a matching matrix row (an untested view) turns red.
 *
 * The module→union link is the project's naming convention (`clock` → ClockView,
 * `calendar` → CalendarViewMode), so there's no second list to drift.
 */
test('every VIEW_MATRIX module renders all of its config-declared views', () => {
  const unions = parseConfigViewUnions();

  const missing: string[] = [];
  for (const spec of VIEW_MATRIX) {
    const viewType = viewTypeForModule(spec.type, unions);
    if (!viewType) continue;
    const rowViews = new Set(spec.views);
    for (const view of unions.get(viewType)!) {
      if (!rowViews.has(view)) missing.push(`${spec.type} · ${view}`);
    }
  }
  expect(
    missing,
    `Views declared in src/types/config.ts but absent from that module's row in the VIEW_MATRIX (add the view to its row in e2e/helpers/view-matrix.ts so it is render-tested): ${missing.join(', ')}`,
  ).toEqual([]);
});

/**
 * Modules whose extra views are deliberately only smoke-tested at their default
 * view (via the render matrix), not exhaustively in VIEW_MATRIX. These are a known
 * coverage gap, not an oversight to hide: listing one here is an explicit decision
 * that its non-default views ride the default-view render test alone. A NEW
 * multi-view module cannot be added without either a VIEW_MATRIX row or a
 * deliberate entry here.
 */
const SINGLE_VIEW_TESTED_MODULES = new Set<string>([]);

/**
 * View completeness ratchet. Every `*View` union in config must map to a module
 * that is either exhaustively view-tested (in VIEW_MATRIX) or explicitly
 * allowlisted above. Adding a multi-view module without wiring up either turns red
 * with the module named.
 */
test('every multi-view module is in VIEW_MATRIX or explicitly allowlisted', () => {
  const unions = parseConfigViewUnions();
  const matrixModules = new Set<string>(VIEW_MATRIX.map((spec) => spec.type));

  const uncovered: string[] = [];
  for (const viewType of unions.keys()) {
    const moduleType = toKebab(viewType.replace(/ViewMode$/, '').replace(/View$/, ''));
    if (matrixModules.has(moduleType) || SINGLE_VIEW_TESTED_MODULES.has(moduleType)) continue;
    uncovered.push(`${moduleType} (${viewType})`);
  }
  expect(
    uncovered,
    `Modules with a *View union but no VIEW_MATRIX coverage and not in SINGLE_VIEW_TESTED_MODULES: ${uncovered.join(', ')}`,
  ).toEqual([]);

  // Keep the allowlist honest: an entry that VIEW_MATRIX now covers is dead weight.
  const stale = [...SINGLE_VIEW_TESTED_MODULES].filter((m) => matrixModules.has(m));
  expect(
    stale,
    `SINGLE_VIEW_TESTED_MODULES entries now covered by VIEW_MATRIX — remove them: ${stale.join(', ')}`,
  ).toEqual([]);
});

/**
 * API routes that are intentionally not test-referenced. Empty today: Tasks 1-4
 * of the coverage plan brought every route under some unit or e2e reference. An
 * entry here is a deliberate "this route stays dark" decision (e.g. a destructive
 * hardware path with no safe way to exercise in CI) — keyed by API path.
 */
const ROUTE_TEST_ALLOWLIST = new Set<string>([]);

/**
 * Route coverage ratchet. Every `src/app/api/**\/route.ts` must be referenced by
 * at least one test (a colocated unit test or an e2e spec). "Referenced" means the
 * route's API path stem appears at a path/glob/string boundary somewhere in the
 * test corpus — reasonably reliable, not a proof of depth. A new route with no
 * test of any kind turns this red with its path named.
 */
test('every API route.ts has at least one test reference', () => {
  const routeFiles = walk(path.resolve(REPO_ROOT, 'src/app/api')).filter((f) =>
    f.endsWith('/route.ts'),
  );

  const corpusFiles = [
    ...walk(path.resolve(REPO_ROOT, 'src')).filter(
      (f) => f.includes('/__tests__/') && f.endsWith('.ts'),
    ),
    ...walk(path.resolve(REPO_ROOT, 'e2e')).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('/coverage.spec.ts'),
    ),
  ];
  const corpus = corpusFiles.map((f) => readFileSync(f, 'utf8')).join('\n\n');

  const apiPaths = routeFiles.map(
    (f) =>
      '/' +
      path
        .relative(path.resolve(REPO_ROOT, 'src/app'), f)
        .replace(/\/route\.ts$/, ''),
  );

  const dark: string[] = [];
  for (const apiPath of apiPaths) {
    if (ROUTE_TEST_ALLOWLIST.has(apiPath)) continue;
    // Match the static prefix; a dynamic segment ([id]) is filled at runtime,
    // so stop the stem there and let the `/` boundary cover the injected value.
    const stem = apiPath.replace(/\/\[[^\]]*\].*/, '');
    const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundary = new RegExp(`${escaped}(?=$|[\\s'"\`?)/*])`, 'm');
    if (!boundary.test(corpus)) dark.push(apiPath);
  }
  expect(
    dark,
    `API routes with no test reference (add a unit or e2e test, or allowlist if intentionally untested): ${dark.join(', ')}`,
  ).toEqual([]);

  // Keep the allowlist honest: an entry that no longer maps to a real route rots.
  const stale = [...ROUTE_TEST_ALLOWLIST].filter((p) => !apiPaths.includes(p));
  expect(
    stale,
    `ROUTE_TEST_ALLOWLIST entries that no longer match any route.ts — remove them: ${stale.join(', ')}`,
  ).toEqual([]);
});

/**
 * Module types that deliberately have NO row in CONFIG_VARIANTS
 * (e2e/helpers/config-variants.ts). The variant matrix flips one
 * rendering-affecting config field per row and asserts the render changed;
 * a module lands here only when it has no field that produces a
 * client-observable render difference the harness can drive. Each entry is
 * a decision, not an omission — a NEW module with a rendering-affecting
 * field must get a variant row, not an allowlist entry.
 */
const CONFIG_VARIANT_FREE_MODULES = new Set<string>([
  // weatherAware branches on a shared-state weather producer that the render
  // harness has no way to seed, so no field flip changes what renders.
  'greeting',
  // `leagues` only rewrites the fetch URL — the stubbed response, and thus the
  // rendered table, is identical regardless of which leagues are selected.
  'sports',
  // No rendering-affecting config field identified (all config tunes the
  // upstream fetch, not the client render).
  'traffic',
]);

/**
 * Config-variant coverage ratchet. Every built-in module type must have at
 * least one CONFIG_VARIANTS row (exercising a non-default, non-view config
 * field at runtime) or sit on the allowlist above. Adding a module with
 * rendering-affecting config but no variant row turns this red with the type
 * named — the render matrices only cover each module's defaultConfig, so this
 * is the only thing policing the rest of the config surface.
 */
test('every built-in module type has a config-variant row or is explicitly allowlisted', () => {
  const covered = new Set(CONFIG_VARIANTS.map((v) => v.type));

  const missing = builtinTypes().filter(
    (t) => !covered.has(t as (typeof CONFIG_VARIANTS)[number]['type']) && !CONFIG_VARIANT_FREE_MODULES.has(t),
  );
  expect(
    missing,
    `Built-in modules with no CONFIG_VARIANTS row (add one to e2e/helpers/config-variants.ts, or allowlist in CONFIG_VARIANT_FREE_MODULES if genuinely variant-free): ${missing.join(', ')}`,
  ).toEqual([]);

  // Keep the allowlist honest: an entry that now HAS a variant row is dead weight.
  const stale = [...CONFIG_VARIANT_FREE_MODULES].filter((m) =>
    covered.has(m as (typeof CONFIG_VARIANTS)[number]['type']),
  );
  expect(
    stale,
    `CONFIG_VARIANT_FREE_MODULES entries now covered by a CONFIG_VARIANTS row — remove them: ${stale.join(', ')}`,
  ).toEqual([]);

  // An allowlisted entry must name a real built-in type (guards against a rename
  // leaving a dead allowlist entry that would silently excuse a future module).
  const unknown = [...CONFIG_VARIANT_FREE_MODULES].filter((m) => !builtinTypes().includes(m));
  expect(
    unknown,
    `CONFIG_VARIANT_FREE_MODULES entries that are not built-in module types — remove them: ${unknown.join(', ')}`,
  ).toEqual([]);
});

/**
 * Settings-page coverage ratchet. Every Defaults page id and every per-display
 * subtab id (both exported from src/lib/settings-route.ts, the routing source of
 * truth) must be referenced by at least one e2e/editor/*.spec.ts. Specs navigate
 * to these surfaces via the canonical query shape — `?section=defaults&page=<id>`
 * and `?section=display&id=…&subtab=<id>` — so a `page=<id>` / `subtab=<id>`
 * boundary scan of the editor spec corpus is the reliable reference marker
 * (mirrors the route ratchet's path-stem boundary technique). A new settings
 * page or subtab that no editor spec visits turns this red with its id named —
 * it cannot land dark.
 */
test('every settings Defaults page and per-display subtab is referenced by an editor spec', () => {
  const editorSpecs = walk(path.resolve(REPO_ROOT, 'e2e/editor')).filter((f) =>
    f.endsWith('.spec.ts'),
  );
  const corpus = editorSpecs.map((f) => readFileSync(f, 'utf8')).join('\n\n');

  // `(?![\w-])` stops `page=network` from matching `page=networking` and keeps
  // each id anchored to a real query value rather than an incidental substring.
  const referenced = (param: string, id: string): boolean =>
    new RegExp(`${param}=${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(corpus);

  const darkPages = DEFAULT_PAGE_IDS.filter((id) => !referenced('page', id));
  expect(
    darkPages,
    `Settings Defaults pages with no e2e/editor/*.spec.ts reference (navigate to ?section=defaults&page=<id> in a spec): ${darkPages.join(', ')}`,
  ).toEqual([]);

  const darkSubtabs = PER_DISPLAY_SUBTABS.filter((id) => !referenced('subtab', id));
  expect(
    darkSubtabs,
    `Per-display subtabs with no e2e/editor/*.spec.ts reference (navigate to ?section=display&id=…&subtab=<id> in a spec): ${darkSubtabs.join(', ')}`,
  ).toEqual([]);
});

/**
 * Locale coverage ratchet. Every locale registered in src/i18n/manifest.ts must
 * appear in e2e/editor/i18n.spec.ts, which loops over `Object.keys(LOCALES)` and
 * asserts translated editor chrome per locale via its `LOCALE_CHROME` table.
 * The spec's own `toBeDefined()` guard catches a missing table row at runtime,
 * but only when the suite runs; this static scan turns red at the meta layer the
 * moment a locale is added to the manifest without a matching reference in the
 * i18n spec, so a new locale cannot ship untested.
 */
test('every manifest locale is referenced in i18n.spec.ts', () => {
  const specSource = readFileSync(
    path.resolve(REPO_ROOT, 'e2e/editor/i18n.spec.ts'),
    'utf8',
  );

  const missing = Object.keys(LOCALES).filter(
    (tag) =>
      !new RegExp(`(?<![\\w-])${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(
        specSource,
      ),
  );
  expect(
    missing,
    `Manifest locales with no reference in e2e/editor/i18n.spec.ts (add a LOCALE_CHROME row so the locale loop covers it): ${missing.join(', ')}`,
  ).toEqual([]);
});
