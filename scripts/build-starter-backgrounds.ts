/**
 * Writes every shipped background in `src/lib/starter-backgrounds.ts` to
 * `public/backgrounds/themes/` as an SVG. Run after editing the catalog or a
 * fullscreen theme's background tokens:
 *
 *   npm run backgrounds:build
 *
 * `src/lib/__tests__/starter-backgrounds.test.ts` fails when a committed file
 * no longer matches its catalog entry, and names this command.
 */
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { STARTER_BACKGROUNDS, STARTER_BACKGROUNDS_DIR } from '../src/lib/starter-backgrounds';
import { buildStarterBackgroundSvg } from '../src/lib/starter-background-svg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, STARTER_BACKGROUNDS_DIR);
mkdirSync(dir, { recursive: true });

const wanted = new Set(STARTER_BACKGROUNDS.map((bg) => bg.file));
for (const bg of STARTER_BACKGROUNDS) {
  writeFileSync(path.join(dir, bg.file), buildStarterBackgroundSvg(bg.paint));
}
// A wall dropped from the catalog must not linger as an orphan file.
for (const name of readdirSync(dir)) {
  if (name.endsWith('.svg') && !wanted.has(name)) unlinkSync(path.join(dir, name));
}
console.log(`Wrote ${STARTER_BACKGROUNDS.length} backgrounds to ${STARTER_BACKGROUNDS_DIR}`);
