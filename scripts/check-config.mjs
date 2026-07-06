#!/usr/bin/env node

/**
 * Dependency-free launcher for the config-check CLI.
 *
 * The real validator is TypeScript (scripts/check-config.ts, a thin wrapper
 * over src/lib/validate-config.ts so the CLI can never drift from the app's
 * module registry or schema version). Production installs have no dev
 * dependencies and no TS toolchain, so:
 *
 *   - Release tarballs and deploy.sh ship a pre-bundled, self-contained
 *     scripts/check-config.cjs (built with esbuild) — preferred when present.
 *   - Dev checkouts fall back to running the TS source via tsx (devDependency).
 *
 * Usage:  npm run config:check
 *         node scripts/check-config.mjs [path/to/config.json]
 *
 * Exit codes (from the underlying CLI):
 *   0 — all checks passed (may have warnings)
 *   1 — errors found
 *   2 — file not found or unparseable / launcher could not run the CLI
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const bundled = path.join(here, 'check-config.cjs');
const tsxBin = path.join(here, '..', 'node_modules', '.bin', 'tsx');

let result;
if (existsSync(bundled)) {
  result = spawnSync(process.execPath, [bundled, ...args], { stdio: 'inherit' });
} else if (existsSync(tsxBin)) {
  result = spawnSync(tsxBin, [path.join(here, 'check-config.ts'), ...args], { stdio: 'inherit' });
} else {
  console.error(
    'config:check needs either the bundled scripts/check-config.cjs (ships with release tarballs)\n' +
    'or dev dependencies for the TypeScript source — run `npm install` in a source checkout.',
  );
  process.exit(2);
}
if (result.error) {
  console.error(`config:check failed to launch: ${result.error.message}`);
}
process.exit(result.status ?? 2);
