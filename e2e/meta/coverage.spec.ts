import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';
import { getAllModuleDefinitions, getModuleDefinition } from '@/lib/module-registry';
import { DEFAULT_PAGE_IDS, PER_DISPLAY_SUBTABS } from '@/lib/settings-route';
import { LOCALES } from '@/i18n/manifest';
import { MODULE_FIXTURES } from '../helpers/module-fixtures';
import { VIEW_MATRIX } from '../helpers/view-matrix';
import { CONFIG_VARIANTS } from '../helpers/config-variants';
import { EMPTY_STATE_FIXTURES } from '../helpers/empty-state-fixtures';

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
  expect(builtin.length).toBe(43);
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
 * Per-route decisions for routes that are neither E2E-exercised nor covered by
 * a colocated handler unit test. Two kinds of entry:
 *   - a permanent decision: why this route deliberately stays dark (real OS
 *     mutation, dev-mode only, real third-party OAuth) — auditable, never burns.
 *   - 'needs-wrapper-test': a burn-down marker; the route needs a colocated
 *     __tests__/route.test.ts and this entry is deleted when it lands.
 */
const ROUTE_DECISIONS: Record<string, string> = {
  // Real Google OAuth device flow — unreachable without live Google credentials.
  '/api/auth/google/device': 'requires a real Google OAuth exchange; no safe CI path',
  '/api/auth/google/status': 'requires a real Google OAuth exchange; no safe CI path',
  // Phase-5 burn-down: these need a colocated __tests__/route.test.ts.
};

/**
 * Route-exercise ratchet. The old bar ("path stem appears anywhere in the test
 * corpus") let a `page.route` stub string count as coverage. The new bar
 * classifies every `src/app/api/**\/route.ts` as one of:
 *   (a) E2E-exercised — its path appears in the e2e corpus EXCLUDING stub match
 *       sites (helpers/stubs.ts and any line calling `page.route(`), so the
 *       reference implies a real request reaching the sandbox handler;
 *   (b) unit-tested — a colocated `__tests__/route.test.ts` exists; or
 *   (c) an explicit ROUTE_DECISIONS entry with a written reason.
 * A new route matching none of these turns red with its path named.
 */
test('every API route is E2E-exercised, unit-tested, or an explicit decision', () => {
  const routeFiles = walk(path.resolve(REPO_ROOT, 'src/app/api')).filter((f) =>
    f.endsWith('/route.ts'),
  );

  // Spec files that stub EVERY api call they reference at the browser boundary
  // (their own header documents that the real server never receives the call).
  // Excluded from the corpus wholesale — a path reference inside one is a stub
  // match/assertion site, not evidence the handler ran.
  const STUB_ONLY_SPECS = ['e2e/editor/network-system.spec.ts'];

  // e2e corpus with stub match sites removed: drop helpers/stubs.ts and the
  // stub-only suites entirely, and strip every line that registers a
  // page.route interception glob.
  const corpusFiles = walk(path.resolve(REPO_ROOT, 'e2e')).filter(
    (f) =>
      f.endsWith('.ts') &&
      !f.endsWith('/coverage.spec.ts') &&
      !f.endsWith('/stubs.ts') &&
      !STUB_ONLY_SPECS.some((s) => f.endsWith(s.replace(/^e2e/, ''))),
  );
  const corpus = corpusFiles
    .map((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .filter((line) => !line.includes('page.route(') && !line.includes('.unroute('))
        .join('\n'),
    )
    .join('\n\n');

  const classify = (routeFile: string): { apiPath: string; covered: boolean } => {
    const apiPath =
      '/' + path.relative(path.resolve(REPO_ROOT, 'src/app'), routeFile).replace(/\/route\.ts$/, '');
    if (existsSync(path.join(path.dirname(routeFile), '__tests__', 'route.test.ts'))) {
      return { apiPath, covered: true };
    }
    // Match the static prefix; a dynamic segment ([id]) is filled at runtime,
    // so stop the stem there and let the `/` boundary cover the injected value.
    const stem = apiPath.replace(/\/\[[^\]]*\].*/, '');
    const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundary = new RegExp(`${escaped}(?=$|[\\s'"\`?)/*])`, 'm');
    return { apiPath, covered: boundary.test(corpus) };
  };

  const results = routeFiles.map(classify);
  const dark = results
    .filter((r) => !r.covered && !(r.apiPath in ROUTE_DECISIONS))
    .map((r) => r.apiPath);
  expect(
    dark,
    `API routes with no real E2E exercise and no colocated __tests__/route.test.ts — add one, or record a decision:\n${dark.map((p) => `  '${p}': 'needs-wrapper-test',`).join('\n')}`,
  ).toEqual([]);

  // Keep the decisions honest: an entry whose route is now covered (or gone) rots.
  const apiPaths = results.map((r) => r.apiPath);
  const staleGone = Object.keys(ROUTE_DECISIONS).filter((p) => !apiPaths.includes(p));
  expect(
    staleGone,
    `ROUTE_DECISIONS entries that no longer match any route.ts — remove them: ${staleGone.join(', ')}`,
  ).toEqual([]);
  const staleCovered = results
    .filter((r) => r.covered && r.apiPath in ROUTE_DECISIONS)
    .map((r) => r.apiPath);
  expect(
    staleCovered,
    `ROUTE_DECISIONS entries now covered by a real test — remove them: ${staleCovered.join(', ')}`,
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

// ===========================================================================
// Config-field coverage ratchet
// ===========================================================================

/** Module types whose config interface name breaks the `<Pascal>Config` convention. */
const CONFIG_INTERFACE_OVERRIDES: Record<string, string> = {
  'qr-code': 'QRCodeConfig',
};

const moduleConfigInterface = (type: string): string =>
  CONFIG_INTERFACE_OVERRIDES[type] ?? `${toPascal(type)}Config`;

const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/**
 * Parse each built-in module's config interface out of src/types/config.ts
 * (same source-scraping technique as the view ratchet). Returns module type →
 * { fields, body } where `fields` are the interface's top-level keys and
 * `body` is the comment-stripped interface text (used by the discriminator
 * guard to detect which named unions a config references).
 */
function parseModuleConfigInterfaces(): Map<string, { fields: Set<string>; body: string }> {
  const src = readFileSync(path.resolve(REPO_ROOT, 'src/types/config.ts'), 'utf8');
  const out = new Map<string, { fields: Set<string>; body: string }>();
  for (const type of builtinTypes()) {
    const iface = moduleConfigInterface(type);
    const m = src.match(new RegExp(`(?:export )?interface ${iface}\\s*\\{`));
    if (!m || m.index === undefined) continue; // asserted below
    let depth = 0;
    let end = -1;
    for (let i = m.index + m[0].length - 1; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = stripComments(src.slice(m.index + m[0].length, end));
    const fields = new Set<string>();
    let d = 0;
    for (const line of body.split('\n')) {
      if (d === 0) {
        const fm = line.match(/^\s*(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)\??:/);
        if (fm) fields.add(fm[1]);
      }
      for (const ch of line) { if (ch === '{') d++; else if (ch === '}') d--; }
    }
    out.set(type, { fields, body });
  }
  return out;
}

/** Every config field exercised at display runtime by some registry row. */
function runtimeExercisedFields(): Map<string, Set<string>> {
  const covered = new Map<string, Set<string>>();
  const add = (type: string, field: string) => {
    if (!covered.has(type)) covered.set(type, new Set());
    covered.get(type)!.add(field);
  };
  for (const v of CONFIG_VARIANTS) for (const k of Object.keys(v.config)) add(v.type, k);
  for (const s of VIEW_MATRIX) {
    add(s.type, s.key);
    for (const k of Object.keys(s.config ?? {})) add(s.type, k);
  }
  for (const f of Object.values(MODULE_FIXTURES)) {
    for (const k of Object.keys(f.config ?? {})) add(f.type, k);
  }
  return covered;
}

type FieldDecision =
  | 'fetch-only'        // only rewrites the upstream fetch; stubbed render is identical
  | 'timing-only'       // only changes an interval/duration; no assertable render delta
  | 'style-only'        // pure visual amplitude/spacing with no stable DOM marker
  | 'covered-by-view'   // the view ratchet / view matrix exercises it exhaustively
  | 'covered-elsewhere' // a non-matrix spec exercises it (name the spec in a comment)
  | 'not-observable'    // no deterministic client-observable render difference exists
  | 'deferred';         // known gap awaiting a variant row — burn these to zero

/**
 * Fields with an explicit coverage decision instead of a CONFIG_VARIANTS row,
 * keyed `<module-type>.<field>`. 'deferred' entries are the Phase-1 burn-down
 * list: delete each as its variant row lands. Every other reason is a durable,
 * auditable decision. A NEW field on any module config lands red here unless
 * it gets a row or a reasoned entry.
 */
const FIELD_DECISIONS: Record<string, FieldDecision> = {
  'affirmations.rotationIntervalMs': 'timing-only',
  'affirmations.timeAware': 'not-observable',
  'affirmations.weatherAware': 'not-observable',
  'air-quality.refreshIntervalMs': 'timing-only',
  'calendar.eventTapDetails': 'covered-elsewhere', // interactive.spec.ts
  'calendar.eventTapStyle': 'covered-elsewhere', // interactive.spec.ts
  'chore-chart.allowDisplayComplete': 'covered-elsewhere',
  'chore-chart.showStreaks': 'not-observable',
  'countdown.holidayCountry': 'not-observable',
  'crypto.ids': 'fetch-only',
  'crypto.refreshIntervalMs': 'timing-only',
  'dad-joke.refreshIntervalMs': 'timing-only',
  'display-control.allowRetargeting': 'covered-elsewhere',
  'display-control.defaultTarget': 'covered-elsewhere',
  'fullscreen-calendar.dimPastEvents': 'timing-only',
  'fullscreen-calendar.eventTapDetails': 'covered-elsewhere', // interactive.spec.ts
  'fullscreen-calendar.eventTapStyle': 'covered-elsewhere', // interactive.spec.ts
  'fullscreen-calendar.weekCollapsePastDays': 'timing-only',
  'fullscreen-chore-chart.allowDisplayComplete': 'covered-elsewhere',
  'fullscreen-chore-chart.density': 'style-only',
  'fullscreen-chore-chart.typographySize': 'style-only',
  'fullscreen-meal-planner.density': 'style-only',
  'fullscreen-meal-planner.tapRecipeAction': 'covered-elsewhere',
  'fullscreen-meal-planner.typographySize': 'style-only',
  'fullscreen-photo.directory': 'fetch-only',
  'fullscreen-photo.immichAlbumId': 'fetch-only',
  'fullscreen-photo.immichCount': 'fetch-only',
  'fullscreen-photo.immichFavoritesOnly': 'fetch-only',
  'fullscreen-photo.immichPersonId': 'fetch-only',
  'fullscreen-photo.intervalMs': 'timing-only',
  'fullscreen-photo.maxVideoDurationMs': 'timing-only',
  'fullscreen-photo.shuffle': 'not-observable',
  'history.refreshIntervalMs': 'timing-only',
  'history.rotationIntervalMs': 'timing-only',
  'history.sourceMuffinLabs': 'fetch-only',
  'history.sourceWikipedia': 'fetch-only',
  'iframe.refreshIntervalMs': 'timing-only',
  'meal-planner.tapRecipeAction': 'covered-elsewhere',
  'news.feedUrl': 'fetch-only',
  'news.refreshIntervalMs': 'timing-only',
  'photo-slideshow.directory': 'fetch-only',
  'photo-slideshow.immichAlbumId': 'fetch-only',
  'photo-slideshow.immichCount': 'fetch-only',
  'photo-slideshow.immichFavoritesOnly': 'fetch-only',
  'photo-slideshow.immichPersonId': 'fetch-only',
  'photo-slideshow.maxVideoDurationMs': 'timing-only',
  'photo-slideshow.refreshIntervalMs': 'timing-only',
  'qr-code.hiddenNetwork': 'not-observable',
  // Force-advance cap; the timer behavior is covered by jsdom unit tests
  // (VideoLayer.test.tsx force-advance) — no stable E2E render marker exists.
  'video.maxDurationMs': 'timing-only',
  'quote.refreshIntervalMs': 'timing-only',
  'rain-map.animationSpeedMs': 'timing-only',
  'rain-map.extraDelayLastFrameMs': 'timing-only',
  'rain-map.refreshIntervalMs': 'timing-only',
  'sports.leagues': 'fetch-only',
  'sports.refreshIntervalMs': 'timing-only',
  'standings.refreshIntervalMs': 'timing-only',
  'stock-ticker.refreshIntervalMs': 'timing-only',
  'stock-ticker.symbols': 'fetch-only',
  'todo.interactive': 'covered-elsewhere',
  'todoist.refreshIntervalMs': 'timing-only',
  'traffic.refreshIntervalMs': 'timing-only',
  'weather.provider': 'fetch-only',
};

test('every module config field has a variant row or an explicit decision', () => {
  const interfaces = parseModuleConfigInterfaces();
  const exercised = runtimeExercisedFields();

  // The parser must resolve an interface for every module — a rename or a new
  // module breaking the <Pascal>Config convention fails loudly, not silently.
  const unparsed = builtinTypes().filter((t) => !interfaces.has(t));
  expect(
    unparsed,
    `Module types whose config interface could not be parsed from src/types/config.ts (add a CONFIG_INTERFACE_OVERRIDES entry if the name is irregular): ${unparsed.join(', ')}`,
  ).toEqual([]);

  const missing: string[] = [];
  for (const [type, { fields }] of interfaces) {
    for (const field of fields) {
      if (exercised.get(type)?.has(field)) continue;
      if (`${type}.${field}` in FIELD_DECISIONS) continue;
      missing.push(`${type}.${field}`);
    }
  }
  expect(
    missing,
    `Config fields with no CONFIG_VARIANTS row and no FIELD_DECISIONS entry:\n${missing.map((f) => `  '${f}': 'deferred',`).join('\n')}`,
  ).toEqual([]);

  // Keep decisions honest: entries must name a real field and must not shadow
  // a field that now has a variant row.
  const staleUnknown = Object.keys(FIELD_DECISIONS).filter((key) => {
    const [type, field] = key.split('.');
    return !interfaces.get(type)?.fields.has(field);
  });
  expect(
    staleUnknown,
    `FIELD_DECISIONS entries that name no existing module config field — remove them: ${staleUnknown.join(', ')}`,
  ).toEqual([]);
  const staleCovered = Object.keys(FIELD_DECISIONS).filter((key) => {
    const [type, field] = key.split('.');
    return exercised.get(type)?.has(field);
  });
  expect(
    staleCovered,
    `FIELD_DECISIONS entries now covered by a variant row — remove them: ${staleCovered.join(', ')}`,
  ).toEqual([]);
});

// ===========================================================================
// Discriminator-union ratchet
// ===========================================================================

/**
 * Mode-like config fields beyond the `*View` naming convention whose members
 * must EACH have a CONFIG_VARIANTS row (the way views each have a VIEW_MATRIX
 * entry). `union` names a string-literal union in src/types/config.ts;
 * `members` declares them inline for anonymous unions.
 */
const EXTRA_DISCRIMINATORS: Array<{ type: string; key: string; union?: string; members?: string[] }> = [
  { type: 'clock', key: 'elapsedFormat', union: 'ElapsedFormat' },
  { type: 'clock', key: 'elapsedPrecision', union: 'ElapsedPrecision' },
  { type: 'countdown', key: 'format', union: 'CountdownFormat' },
  { type: 'countdown', key: 'precision', union: 'CountdownPrecision' },
  { type: 'text', key: 'effect', union: 'TextEffect' },
  { type: 'text', key: 'orientation', members: ['horizontal', 'vertical', 'sideways'] },
  { type: 'icon', key: 'animation', union: 'IconAnimation' },
  { type: 'icon', key: 'style', union: 'IconStyle' },
  { type: 'fullscreen-photo', key: 'transition', union: 'FullscreenPhotoTransition' },
  { type: 'fullscreen-weather', key: 'skyLayer', union: 'FullscreenWeatherSky' },
  { type: 'qr-code', key: 'mode', union: 'QRCodeMode' },
  { type: 'shape', key: 'endStyle', union: 'ShapeEndStyle' },
  { type: 'shape', key: 'gridPattern', union: 'ShapeGridPattern' },
  { type: 'shape', key: 'fillMode', union: 'ShapeFillMode' },
  { type: 'shape', key: 'frameStyle', union: 'ShapeFrameStyle' },
  { type: 'calendar', key: 'startDay', union: 'WeekStartDay' },
  { type: 'calendar', key: 'gridTheme', union: 'CalendarGridTheme' },
  { type: 'sunrise-sunset', key: 'theme', union: 'SunriseSunsetTheme' },
  { type: 'fullscreen-calendar', key: 'startDay', union: 'WeekStartDay' },
  { type: 'fullscreen-calendar', key: 'scheduleStartAnchor', union: 'ScheduleStartAnchor' },
  { type: 'multi-month', key: 'startDay', union: 'WeekStartDay' },
  { type: 'chore-chart', key: 'weekStartDay', union: 'WeekStartDay' },
  { type: 'fullscreen-chore-chart', key: 'weekStartDay', union: 'WeekStartDay' },
];

/**
 * Members of EXTRA_DISCRIMINATORS unions not yet exercised by a variant row —
 * the burn-down list, keyed `<type>.<key>=<member>`. Delete entries as rows
 * land; a NEW member of any listed union turns red here immediately.
 */
const DISCRIMINATOR_MEMBER_PENDING = new Set<string>([
]);

/**
 * Named string-literal unions referenced by a module config interface that are
 * deliberately NOT member-exhaustive, with the reason. These fields answer to
 * the field-level ratchet (one variant row proves the field renders), not the
 * member-exhaustive bar reserved for genuine render-mode discriminators.
 */
const DISCRIMINATOR_UNION_DECISIONS: Record<string, string> = {
  AffirmationsCategory: 'content-pool selection, not a render mode',
  CalendarDensity: 'spacing scale, not a render mode; field-level row suffices',
  EventOverlapMode: 'two layout strategies; field-level row (columns vs stacked) covers both',
  EventTapStyle: 'tap overlay style exercised in interactive.spec.ts, not a static render mode',
  FullscreenTypographySize: 'CSS type scale, not render modes; field-level row (2 sizes) suffices',
  GarbageFrequency: 'weekly/biweekly cadence; the biweekly variant row covers the non-default member',
  IconFlip: 'mirror transform of the same glyph, not a distinct render path; field-level row suffices',
  RainMapStyle: 'two basemap tile sets; the standard variant row plus default dark covers both',
  RecipeTapAction: 'tap behavior exercised in interactive.spec.ts, not a static render mode',
  ShapeArrowDirection: 'rotation transform of one arrow renderer; field-level row suffices',
  ShapeLineStyle: 'stroke dash pattern; field-level row (dashed) suffices',
  ShapeOrientation: 'axis transform of the same line renderer; field-level row (vertical) suffices',
  SlideshowMediaTypes: 'source-mix selection, not a render mode; the media-videos variant rows prove the video pipeline and photos is the default matrix render',
  StandingsGrouping: 'grouping strategies share the table renderer; field-level rows suffice',
  TextDecoration: 'CSS text-decoration values; field-level row suffices',
  TextRevealOnRotation: 'reveal animation flavors on the rotation feature; field-level row suffices',
  TextWrapMode: 'CSS wrap strategies; field-level row suffices',
  AgendaSeparators: 'boundary-marker density; the weeks-and-months row renders both separator kinds, weeks shares the week-rule path, none is the default matrix render',
  CalendarLegendPlacement: 'placement of one legend row; both modules carry legend-header and legend-footer variant rows, off is the default matrix render',
  TodayHighlightStyle: 'styling intensity levels; field-level row (off) suffices',
  WeatherPlacement: 'placement of one weather readout; the off/days/events rows cover the three render paths, header is the default matrix render and days-and-events unions the days+events paths',
  TodoistGroupBy: 'grouping strategies share the list renderer; field-level row (project) suffices',
  TodoistSortBy: 'ordering only; field-level row suffices',
  WeatherIconSet: 'two icon sets; the outline variant row plus default color covers both',
  WeatherProviderOption: 'fetch routing only — the stub serves every provider the same body',
  WifiAuthType: 'encoded WIFI: payload data, not a render mode; field-level rows cover it',
};

/** All named string-literal unions in src/types/config.ts (exported or not). */
function parseAllStringUnions(): Map<string, string[]> {
  const src = readFileSync(path.resolve(REPO_ROOT, 'src/types/config.ts'), 'utf8');
  const unions = new Map<string, string[]>();
  const re = /\btype\s+([A-Za-z0-9_]+)\s*=\s*([^;]*?);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const rhs = stripComments(m[2]);
    const members = [...rhs.matchAll(/'([^']+)'/g)].map((x) => x[1]);
    // Only pure string-literal unions: nothing left after removing literals,
    // pipes, and whitespace (rejects template-literal and mixed unions).
    if (members.length && rhs.replace(/'[^']*'/g, '').replace(/[|\s]/g, '') === '') {
      unions.set(m[1], members);
    }
  }
  return unions;
}

test('every extra discriminator member has a variant row or a pending entry', () => {
  const unions = parseAllStringUnions();

  const missing: string[] = [];
  const staleUnion: string[] = [];
  for (const d of EXTRA_DISCRIMINATORS) {
    const members = d.union ? unions.get(d.union) : d.members;
    if (!members) { staleUnion.push(`${d.type}.${d.key} (${d.union})`); continue; }
    const def = getModuleDefinition(d.type as Parameters<typeof getModuleDefinition>[0]);
    const defaultValue = def?.defaultConfig?.[d.key];
    for (const member of members) {
      // The registry default renders in the static matrix, so it is covered.
      if (member === defaultValue) continue;
      const hasRow = CONFIG_VARIANTS.some((v) => v.type === d.type && v.config[d.key] === member);
      if (hasRow) continue;
      if (DISCRIMINATOR_MEMBER_PENDING.has(`${d.type}.${d.key}=${member}`)) continue;
      missing.push(`${d.type}.${d.key}=${member}`);
    }
  }
  expect(staleUnion, `EXTRA_DISCRIMINATORS entries naming a union that no longer parses: ${staleUnion.join(', ')}`).toEqual([]);
  expect(
    missing,
    `Discriminator members with no CONFIG_VARIANTS row (add a row, or add to DISCRIMINATOR_MEMBER_PENDING as a burn-down entry):\n${missing.map((f) => `  '${f}',`).join('\n')}`,
  ).toEqual([]);

  // Burn-down hygiene: a pending entry whose row landed (or whose member is
  // gone) must be deleted.
  const memberExists = (entry: string): boolean => {
    const [typeKey, member] = entry.split('=');
    const [type, key] = typeKey.split('.');
    const d = EXTRA_DISCRIMINATORS.find((x) => x.type === type && x.key === key);
    const members = d ? (d.union ? unions.get(d.union) : d.members) : undefined;
    return !!members?.includes(member);
  };
  const stalePending = [...DISCRIMINATOR_MEMBER_PENDING].filter((entry) => {
    const [typeKey, member] = entry.split('=');
    const [type, key] = typeKey.split('.');
    const covered = CONFIG_VARIANTS.some((v) => v.type === type && v.config[key] === member);
    return covered || !memberExists(entry);
  });
  expect(
    stalePending,
    `DISCRIMINATOR_MEMBER_PENDING entries now covered (or naming a gone member) — remove them: ${stalePending.join(', ')}`,
  ).toEqual([]);
});

test('every string union referenced by a module config is enumerated or decided', () => {
  const unions = parseAllStringUnions();
  const interfaces = parseModuleConfigInterfaces();

  const unenumerated: string[] = [];
  for (const [type, { body }] of interfaces) {
    const pascal = toPascal(type);
    for (const [union] of unions) {
      if (!new RegExp(`\\b${union}\\b`).test(body)) continue;
      const isViewConvention = union === `${pascal}View` || union === `${pascal}ViewMode`;
      const isExtra = EXTRA_DISCRIMINATORS.some((d) => d.type === type && d.union === union);
      const isDecided = union in DISCRIMINATOR_UNION_DECISIONS;
      if (!isViewConvention && !isExtra && !isDecided) unenumerated.push(`${type} → ${union}`);
    }
  }
  expect(
    unenumerated,
    `String-literal unions used by a module config that are neither view-convention, EXTRA_DISCRIMINATORS, nor DISCRIMINATOR_UNION_DECISIONS:\n${unenumerated.map((u) => `  ${u}`).join('\n')}`,
  ).toEqual([]);

  // A decision for a union no module config references anymore is dead weight.
  const referenced = new Set<string>();
  for (const { body } of interfaces.values()) {
    for (const [union] of unions) if (new RegExp(`\\b${union}\\b`).test(body)) referenced.add(union);
  }
  const staleDecisions = Object.keys(DISCRIMINATOR_UNION_DECISIONS).filter((u) => !referenced.has(u));
  expect(
    staleDecisions,
    `DISCRIMINATOR_UNION_DECISIONS entries no module config references — remove them: ${staleDecisions.join(', ')}`,
  ).toEqual([]);
});

// ===========================================================================
// Empty/error-state ratchet
// ===========================================================================

/**
 * Modules whose component uses an empty-state (found by the static scan below)
 * that do not yet have an EMPTY_STATE_FIXTURES row. Burn-down list — delete
 * entries as rows land in e2e/helpers/empty-state-fixtures.ts. `weather` is a
 * durable exception: its per-view WeatherEmptyState branches are covered by the
 * RESILIENCE matrix in modules-data.spec.ts, not the empty-state spec.
 */
const EMPTY_STATE_PENDING = new Set<string>([
  // Durable exception, not burn-down: weather's per-view WeatherEmptyState
  // branches are covered by the RESILIENCE matrix in modules-data.spec.ts.
  'weather',
]);

/** Empty-state components a module render can reach. */
const EMPTY_STATE_TOKENS = /\b(ModuleEmptyState|LocationRequired|WeatherEmptyState)\b/;

/**
 * module type → source text of its component (the single file for flat
 * modules, the whole directory for subdirectory modules), parsed from the
 * dynamic-import map in src/lib/module-components.ts so there is no second
 * hand-maintained list.
 */
function moduleComponentSources(): Map<string, string> {
  const src = readFileSync(path.resolve(REPO_ROOT, 'src/lib/module-components.ts'), 'utf8');
  const out = new Map<string, string>();
  const re = /['"]?([a-z0-9-]+)['"]?:\s*dynamic\(\(\)\s*=>\s*import\('@\/components\/modules\/([^']+)'\)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const [, type, importPath] = m;
    const modulesRoot = path.resolve(REPO_ROOT, 'src/components/modules');
    const flat = path.join(modulesRoot, `${importPath}.tsx`);
    // A subdirectory module (a slashed import path, or a directory import
    // resolving to index.tsx) scans its whole directory; a flat `<Name>.tsx`
    // file scans alone.
    const files = !importPath.includes('/') && existsSync(flat)
      ? [flat]
      : walk(path.join(modulesRoot, importPath.split('/')[0])).filter((f) => f.endsWith('.tsx'));
    out.set(type, files.map((f) => readFileSync(f, 'utf8')).join('\n\n'));
  }
  return out;
}

test('every module with an empty state has an empty-state fixture or a pending entry', () => {
  const sources = moduleComponentSources();
  // The parse must see every built-in type or the scan is silently partial.
  expect([...sources.keys()].sort()).toEqual([...builtinTypes()].sort());

  const withEmptyState = [...sources.entries()]
    .filter(([, text]) => EMPTY_STATE_TOKENS.test(text))
    .map(([type]) => type);
  const fixtureTypes = new Set(EMPTY_STATE_FIXTURES.map((f) => f.type));

  const missing = withEmptyState.filter((t) => !fixtureTypes.has(t as never) && !EMPTY_STATE_PENDING.has(t));
  expect(
    missing,
    `Modules rendering an empty state with no EMPTY_STATE_FIXTURES row (add one in e2e/helpers/empty-state-fixtures.ts):\n${missing.map((t) => `  '${t}',`).join('\n')}`,
  ).toEqual([]);

  // Hygiene: pending entries whose row landed, and fixture rows for modules
  // that no longer render an empty state, both rot.
  const stalePending = [...EMPTY_STATE_PENDING].filter(
    (t) => fixtureTypes.has(t as never) || !withEmptyState.includes(t),
  );
  expect(
    stalePending,
    `EMPTY_STATE_PENDING entries now covered or no longer applicable — remove them: ${stalePending.join(', ')}`,
  ).toEqual([]);
  // Fixture rows may legitimately exist for modules whose empty render is
  // hand-rolled (chore-chart, meal-planner) rather than via the shared
  // components, so only rows naming an unknown module type are stale.
  const staleFixtures = [...fixtureTypes].filter((t) => !builtinTypes().includes(t));
  expect(
    staleFixtures,
    `EMPTY_STATE_FIXTURES rows naming unknown module types — remove them: ${staleFixtures.join(', ')}`,
  ).toEqual([]);
});

// ===========================================================================
// Locale-surface ratchet
// ===========================================================================

/**
 * Non-editor surfaces that must each have a locale spec looping every manifest
 * locale. Specs listed in LOCALE_SURFACE_PENDING do not exist yet (Phase-4
 * burn-down); once a spec lands its entry is deleted and every locale must be
 * referenced in it from then on.
 */
const LOCALE_SURFACE_SPECS = [
  'e2e/display/i18n.spec.ts',
  'e2e/remote/i18n.spec.ts',
  'e2e/chores/i18n.spec.ts',
];
const LOCALE_SURFACE_PENDING = new Set<string>([]);

test('every manifest locale is referenced in each surface i18n spec', () => {
  const problems: string[] = [];
  for (const rel of LOCALE_SURFACE_SPECS) {
    const abs = path.resolve(REPO_ROOT, rel);
    if (!existsSync(abs)) {
      if (!LOCALE_SURFACE_PENDING.has(rel)) problems.push(`${rel} does not exist (add the spec or a LOCALE_SURFACE_PENDING entry)`);
      continue;
    }
    const specSource = readFileSync(abs, 'utf8');
    for (const tag of Object.keys(LOCALES)) {
      if (!new RegExp(`(?<![\\w-])${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(specSource)) {
        problems.push(`${rel} has no reference to locale ${tag}`);
      }
    }
  }
  expect(problems, `Locale-surface gaps:\n${problems.map((p) => `  ${p}`).join('\n')}`).toEqual([]);

  const stalePending = [...LOCALE_SURFACE_PENDING].filter(
    (rel) => existsSync(path.resolve(REPO_ROOT, rel)) || !LOCALE_SURFACE_SPECS.includes(rel),
  );
  expect(
    stalePending,
    `LOCALE_SURFACE_PENDING entries whose spec now exists (or is unknown) — remove them: ${stalePending.join(', ')}`,
  ).toEqual([]);
});
