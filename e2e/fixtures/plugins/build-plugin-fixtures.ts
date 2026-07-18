// Regenerates the committed plugin tarball fixtures used by
// e2e/editor/plugin-lifecycle.spec.ts.
//
//   node_modules/.bin/tsx e2e/fixtures/plugins/build-plugin-fixtures.ts
//
// Two tarballs are produced, each shaped like a real published plugin
// (a top-level directory wrapping manifest.json + dist/bundle.js, so the
// install pipeline's `tar --strip-components=1` unwraps them correctly):
//
//   e2e-fixture-plugin.tar.gz       — the SAME plugin content seedFixturePlugin
//                                     (e2e/helpers/fixture-plugin.ts) uses for
//                                     the dev-seed path. The manifest + bundle
//                                     are IMPORTED from that helper (not copied)
//                                     so this generator can't drift from it; the
//                                     committed bytes are additionally guarded by
//                                     a parity test in plugin-lifecycle.spec.ts.
//
//   e2e-fixture-rich-plugin.tar.gz  — exercises the manifest `translations`
//                                     surface (SDK.translate) and a
//                                     `deriveProvidedKeys` bundle export. This
//                                     one has no seed-path counterpart, so its
//                                     content is defined locally below.
//
// The tarballs are committed so the suite doesn't shell out to `tar` on every
// run. Regenerate and re-commit only when the fixture content changes; output
// is deterministic (fixed entry mtimes + `gzip -n`) so an unchanged rebuild is
// a clean diff.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST, BUNDLE } from '../../helpers/fixture-plugin';

const OUT_DIR = path.dirname(fileURLToPath(import.meta.url));

// Fixed timestamp stamped on every archive entry so repeated builds of
// unchanged content produce byte-identical tarballs.
const FIXED_MTIME = new Date('2026-01-01T00:00:00Z');

// --- Rich fixture (translations + deriveProvidedKeys) -----------------------

const RICH_ID = 'e2e-fixture-rich';
const RICH_GREETING = 'GREETING FROM PLUGIN I18N';

const RICH_MANIFEST = {
  id: RICH_ID,
  name: 'E2E Rich Fixture Plugin',
  version: '1.0.0',
  description: 'E2E rich fixture: translations + deriveProvidedKeys',
  author: 'e2e',
  license: 'MIT',
  minAppVersion: '1.0.0',
  moduleType: RICH_ID,
  category: 'Media & Display',
  icon: 'Star',
  defaultConfig: { entity: 'sensor' },
  defaultSize: { w: 320, h: 200 },
  exports: { component: 'default' },
  translations: { 'en-US': 'i18n/en-US.json' },
  permissions: [],
};

const RICH_TRANSLATIONS = { greeting: RICH_GREETING };

const RICH_BUNDLE = `(function () {
  var React = window.React;
  var SDK = window.__HS_SDK__;
  function Component() {
    var greeting = (SDK && typeof SDK.translate === 'function')
      ? SDK.translate('plugin:${RICH_ID}.greeting')
      : 'NO SDK';
    return React.createElement('div', { 'data-plugin-marker': 'e2e-rich', style: { width: '100%', height: '100%' } }, greeting);
  }
  window.__HS_PLUGIN__ = {
    default: Component,
    deriveProvidedKeys: function (config) {
      var entity = (config && config.entity) || 'derived';
      return [{ key: entity, label: 'Derived: ' + entity }];
    }
  };
})();`;

/** Recursively stamp a fixed mtime on every file/dir so tar output is stable. */
function stampMtimes(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) stampMtimes(full);
    utimesSync(full, FIXED_MTIME, FIXED_MTIME);
  }
  utimesSync(dir, FIXED_MTIME, FIXED_MTIME);
}

function buildTarball(
  id: string,
  basename: string,
  manifest: unknown,
  bundle: string,
  extraFiles: Record<string, string> = {},
): void {
  const staging = mkdtempSync(path.join(os.tmpdir(), `hs-fixture-${id}-`));
  try {
    const root = path.join(staging, id);
    mkdirSync(path.join(root, 'dist'), { recursive: true });
    writeFileSync(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(path.join(root, 'dist', 'bundle.js'), bundle);
    for (const [rel, contents] of Object.entries(extraFiles)) {
      const full = path.join(root, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, contents);
    }
    stampMtimes(staging);

    const tarPath = path.join(OUT_DIR, `${basename}.tar`);
    // tar (uncompressed) then `gzip -n` so the gzip header carries no mtime/name
    // — combined with the fixed entry mtimes above, rebuilds are byte-stable.
    execFileSync('tar', ['-cf', tarPath, '-C', staging, id]);
    execFileSync('gzip', ['-nf', tarPath]);
    console.log(`wrote ${tarPath}.gz`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

buildTarball('e2e-fixture', 'e2e-fixture-plugin', MANIFEST, BUNDLE);
buildTarball('e2e-fixture-rich', 'e2e-fixture-rich-plugin', RICH_MANIFEST, RICH_BUNDLE, {
  'i18n/en-US.json': `${JSON.stringify(RICH_TRANSLATIONS, null, 2)}\n`,
});
