#!/usr/bin/env node
/**
 * Generate the slim Font Awesome icon-search manifest used by the picker.
 *
 * The CSS and woff2 fonts themselves are imported directly into
 * `app/layout.tsx` from `@fortawesome/fontawesome-free` — Next.js processes
 * the @font-face URLs and bundles the fonts as part of the build output,
 * so we don't need to copy them to public/ ourselves.
 *
 * What we DO generate here is `public/font-awesome/icons-slim.json`: a
 * runtime-fetchable index of every free icon's name + supported styles +
 * search keywords, slimmed down from the 5MB icon-families.json to ~250KB.
 * This is what the picker fetches on first open to power search across all
 * ~1,970 free icons.
 */
import { mkdir, writeFile, readFile, copyFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'node_modules/@fortawesome/fontawesome-free');
const DEST = join(ROOT, 'public/font-awesome');

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function buildSlimManifest() {
  const raw = JSON.parse(
    await readFile(join(SRC, 'metadata/icon-families.json'), 'utf8'),
  );
  const out = [];
  for (const [name, entry] of Object.entries(raw)) {
    const free = entry?.familyStylesByLicense?.free;
    if (!Array.isArray(free) || free.length === 0) continue;

    // Collect every free style this icon ships with so the runtime can
    // validate that the user's currently-selected style is supported by
    // the woff2 — picking a solid-only icon while style is set to
    // 'regular' would otherwise render the codepoint as fallback text.
    const styles = [...new Set(free.map((s) => s.style))];
    let kind;
    if (styles.includes('brands')) kind = 'brands';
    else if (styles.includes('solid')) kind = 'solid';
    else if (styles.includes('regular')) kind = 'regular';
    else continue;

    const terms = entry.search?.terms ?? [];
    const aliases = entry.aliases?.names ?? [];
    const kw = [...new Set([...terms, ...aliases])];

    out.push({
      name,
      kind,
      styles,
      kw: kw.length > 0 ? kw : undefined,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));

  const pkg = JSON.parse(
    await readFile(join(SRC, 'package.json'), 'utf8'),
  );

  const payload = { version: pkg.version, icons: out };
  await writeFile(
    join(DEST, 'icons-slim.json'),
    JSON.stringify(payload),
    'utf8',
  );
  return { count: out.length, version: pkg.version };
}

async function copyLicense() {
  // Font Awesome free is dual-licensed (FA Free License for icons, SIL OFL
  // for fonts). We carry the LICENSE.txt alongside the manifest so the
  // attribution travels with the asset.
  await copyFile(join(SRC, 'LICENSE.txt'), join(DEST, 'LICENSE.txt'));
}

const FA_PKG = '@fortawesome/fontawesome-free';

async function isFaDeclared() {
  // The production failure mode we need to catch: FA is listed in
  // package.json but `node_modules/@fortawesome/fontawesome-free` is missing
  // (corrupted install, broken Docker layer, `npm ci` that didn't complete,
  // a fork that pruned the dep without removing the import in layout.tsx).
  // The earlier soft-fail masked this — the picker would silently degrade to
  // the curated ~280-icon subset with no build-time signal. Reading
  // package.json lets us tell "declared but missing" (hard fail) apart from
  // "genuinely not configured" (soft skip — e.g. a downstream fork that
  // intentionally dropped the icon module).
  try {
    const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
    return Boolean(
      pkg.dependencies?.[FA_PKG] ??
        pkg.devDependencies?.[FA_PKG] ??
        pkg.optionalDependencies?.[FA_PKG],
    );
  } catch {
    return false;
  }
}

async function main() {
  if (!(await pathExists(SRC))) {
    if (await isFaDeclared()) {
      throw new Error(
        `${FA_PKG} is declared in package.json but ${SRC} is missing. ` +
          `Run \`npm install\` to repair the install (a previous \`npm install\` ` +
          `was likely interrupted or pruned). The Icon module's full picker ` +
          `catalog will be unavailable until the manifest is regenerated.`,
      );
    }
    console.warn(
      `[copy-font-awesome] ${FA_PKG} is not declared as a dependency — skipping. ` +
        `Add it to package.json if you want the Icon module's full picker catalog.`,
    );
    return;
  }
  await mkdir(DEST, { recursive: true });
  const { count, version } = await buildSlimManifest();
  await copyLicense();
  console.log(
    `[copy-font-awesome] OK — Font Awesome ${version}, ${count} free icons indexed.`,
  );
}

main().catch((err) => {
  console.error('[copy-font-awesome] FAILED:', err.message);
  process.exit(1);
});
