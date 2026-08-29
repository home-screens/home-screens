#!/usr/bin/env node
/**
 * Vendor the web fonts into the repo.
 *
 * Why this exists: `next/font/google` downloads each family from
 * fonts.gstatic.com *at build time*. With ten families and CI building once
 * per E2E shard, that is dozens of requests to Google per run, and a single
 * 404 from their CDN fails the whole build with confusing
 * "Module not found: @vercel/turbopack-next/internal/font/google/font"
 * errors that look like a code defect. It happened on 2026-08-14.
 *
 * Self-hosting removes the build-time network dependency entirely. The bytes
 * shipped to the browser are unchanged — `next/font/google` was already
 * self-hosting these in the build output; the only difference is whether the
 * files come from the repo or from a network fetch during every build.
 *
 * Usage:  node scripts/fetch-fonts.mjs
 *
 * Re-run when a family or weight changes in src/app/layout.tsx. Keep this
 * file in step with the FAMILIES table below and with the `next/font/local`
 * declarations in the layout.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO_ROOT, 'src', 'app', 'fonts');
const LICENSE_DIR = path.join(OUT_DIR, 'licenses');

// A browser UA is required: the CSS API serves older formats (ttf) to
// unrecognised clients, and we specifically want woff2.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/**
 * Mirrors the declarations in src/app/layout.tsx exactly.
 *
 * A `range` fetches the family as a variable font over that weight axis; the
 * `cssWeight` is the matching string for the layout's `weight:` field.
 * Families with `weights` are static and get one file each. Rendering is
 * unchanged either way — every weight the app uses is covered.
 */
const FAMILIES = [
  // Variable families. Google serves ONE file covering the whole axis, so
  // asking for three weights returns the same bytes three times — verified by
  // checksum. Storing them per-weight nearly doubled the vendored size for no
  // rendering difference, so each is stored once and declared as a range that
  // covers every weight the app asks for.
  { name: 'Inter', slug: 'inter', gf: 'inter', range: '100..900', cssWeight: '100 900' },
  { name: 'Roboto', slug: 'roboto', gf: 'roboto', range: '100..900', cssWeight: '100 900' },
  { name: 'Playfair Display', slug: 'playfair-display', gf: 'playfairdisplay', range: '400..900', cssWeight: '400 900' },
  { name: 'Lora', slug: 'lora', gf: 'lora', range: '400..700', cssWeight: '400 700' },
  { name: 'JetBrains Mono', slug: 'jetbrains-mono', gf: 'jetbrainsmono', range: '100..800', cssWeight: '100 800' },
  { name: 'Caveat', slug: 'caveat', gf: 'caveat', range: '400..700', cssWeight: '400 700' },

  // Metric-compatible stand-in for Georgia. Georgia itself is a Microsoft core
  // font: present on macOS/Windows, absent from Raspberry Pi OS, so a kiosk
  // fell through to the generic `serif` alias and rendered the "Georgia" font
  // choice in whatever face fontconfig happened to have. Gelasio matches
  // Georgia's metrics, so it substitutes without reflowing anything.
  { name: 'Gelasio', slug: 'gelasio', gf: 'gelasio', range: '400..700', cssWeight: '400 700' },

  // Genuinely static: a distinct file per weight.
  { name: 'Poppins', slug: 'poppins', gf: 'poppins', weights: ['400', '600', '700'] },
  { name: 'DM Serif Display', slug: 'dm-serif-display', gf: 'dmserifdisplay', weights: ['400'] },
  { name: 'Bebas Neue', slug: 'bebas-neue', gf: 'bebasneue', weights: ['400'] },
  { name: 'Pacifico', slug: 'pacifico', gf: 'pacifico', weights: ['400'] },
];

/** Every layout declaration uses `subsets: ['latin']`, so take only that block. */
const WANTED_SUBSET = 'latin';

async function fetchCss(family) {
  const axis = family.range
    ? `:wght@${family.range}`
    : `:wght@${family.weights.join(';')}`;
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family.name).replace(/%20/g, '+')}${axis}&display=swap`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`CSS fetch failed for ${family.name}: ${res.status}`);
  return res.text();
}

/**
 * Pull the woff2 URL and weight out of each `@font-face` block, keeping only
 * the subset we ship. The API labels each block with a `/* subset *\/`
 * comment immediately before it.
 */
function parseLatinFaces(css) {
  const out = [];
  const blocks = css.split('/*').slice(1);
  for (const block of blocks) {
    const label = block.slice(0, block.indexOf('*/')).trim();
    if (label !== WANTED_SUBSET) continue;
    const url = block.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    const weight = block.match(/font-weight:\s*([^;]+);/)?.[1]?.trim();
    if (url && weight) out.push({ url, weight });
  }
  return out;
}

/**
 * Vendoring a font means vendoring its licence: the SIL Open Font License
 * requires the licence travel with the files. Pulled from the family's own
 * directory in google/fonts so the copyright line matches the actual font.
 */
async function fetchLicense(family) {
  const url = `https://raw.githubusercontent.com/google/fonts/main/ofl/${family.gf}/OFL.txt`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Licence fetch failed for ${family.name}: ${res.status}`);
  const text = await res.text();
  await fs.writeFile(path.join(LICENSE_DIR, `${family.slug}-OFL.txt`), text);
  return { url, bytes: text.length };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(LICENSE_DIR, { recursive: true });
  const manifest = [];

  for (const family of FAMILIES) {
    const licence = await fetchLicense(family);
    const faces = parseLatinFaces(await fetchCss(family));
    if (faces.length === 0) throw new Error(`No "${WANTED_SUBSET}" face found for ${family.name}`);

    for (const face of faces) {
      // Variable families collapse to one file; static ones get one per weight.
      const suffix = family.range ? 'variable' : face.weight;
      const file = `${family.slug}-${suffix}.woff2`;
      const res = await fetch(face.url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`Font fetch failed for ${file}: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(path.join(OUT_DIR, file), buf);
      manifest.push({
        family: family.name,
        file,
        weight: face.weight,
        bytes: buf.length,
        source: face.url,
        licence: 'OFL-1.1',
        licenceFile: `licenses/${family.slug}-OFL.txt`,
        licenceSource: licence.url,
      });
      console.log(`  ${file}  ${(buf.length / 1024).toFixed(1)} KB  (weight ${face.weight})`);
    }
  }

  // Record where every file came from, so a future reader can tell what is
  // vendored, at which version, and re-fetch it without guesswork.
  await fs.writeFile(
    path.join(OUT_DIR, 'SOURCES.json'),
    JSON.stringify({ fetchedFrom: 'fonts.googleapis.com/css2', subset: WANTED_SUBSET, files: manifest }, null, 2) + '\n',
  );

  const total = manifest.reduce((n, f) => n + f.bytes, 0);
  console.log(`\n${manifest.length} files, ${(total / 1024).toFixed(0)} KB total -> ${path.relative(REPO_ROOT, OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
