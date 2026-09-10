#!/usr/bin/env node
/** Release installs use the bundled CLI; source checkouts use local tsx. */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assertRestoreOwner } from './restore-ownership.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
try {
  await assertRestoreOwner(appRoot, process.argv[2]);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'The restore account could not be verified.' })}\n`);
  process.exit(1);
}
const bundled = path.join(here, 'restore-snapshot.cjs');
const tsx = path.join(appRoot, 'node_modules/.bin/tsx');
let result;
if (existsSync(bundled)) {
  result = spawnSync(process.execPath, [bundled, ...process.argv.slice(2)], { cwd: appRoot, stdio: 'inherit' });
} else if (existsSync(tsx)) {
  result = spawnSync(tsx, [path.join(here, 'restore-snapshot.ts'), ...process.argv.slice(2)], { cwd: appRoot, stdio: 'inherit' });
} else {
  console.error('Offline restore needs scripts/restore-snapshot.cjs from the release, or npm install in a source checkout.');
  process.exit(2);
}
if (result.error) console.error(`Offline restore could not start: ${result.error.message}`);
process.exit(result.status ?? 2);
