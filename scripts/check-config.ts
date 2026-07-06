/**
 * Config validation CLI — checks data/config.json for structural problems.
 *
 * Thin wrapper over the real validator in `src/lib/validate-config.ts`, so
 * the CLI can never drift from the app's module registry or schema version
 * (the previous standalone copy did exactly that). Runs via tsx, which
 * resolves the `@/*` path alias from tsconfig.json.
 *
 * Usage:  npm run config:check
 *         npx tsx scripts/check-config.ts [path/to/config.json]
 *
 * Exit codes:
 *   0 — all checks passed (may have warnings)
 *   1 — errors found
 *   2 — file not found or unparseable
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { validateConfig } from '@/lib/validate-config';
import type { ScreenConfiguration } from '@/types/config';

const configPath = process.argv[2] || resolve(process.cwd(), 'data', 'config.json');

if (!existsSync(configPath)) {
  console.log(`\x1b[33m⚠\x1b[0m  Config file not found: ${configPath}`);
  console.log('   This is normal for a fresh install — defaults will be created on first run.');
  process.exit(0);
}

let config: ScreenConfiguration;
try {
  const raw = readFileSync(configPath, 'utf-8');
  config = JSON.parse(raw);
} catch (err) {
  console.error(`\x1b[31m✗\x1b[0m  Failed to parse ${configPath}`);
  console.error(`   ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}

const diagnostics = validateConfig(config);
const errors = diagnostics.filter((d) => d.severity === 'error');
const warnings = diagnostics.filter((d) => d.severity === 'warning');

if (diagnostics.length === 0) {
  const moduleCount = (config.screens || []).reduce((n, s) => n + (s.modules?.length || 0), 0);
  const screenCount = (config.screens || []).length;
  const displayCount = (config.displays || []).length;

  console.log(`\x1b[32m✓\x1b[0m  Config is valid`);
  console.log(`   Version: ${config.version}  |  ${screenCount} screen(s)  |  ${moduleCount} module(s)${displayCount ? `  |  ${displayCount} display(s)` : ''}`);
  process.exit(0);
}

for (const d of errors) {
  console.error(`\x1b[31m✗\x1b[0m  ${d.message}${d.path ? `  (${d.path})` : ''}`);
}
for (const d of warnings) {
  console.warn(`\x1b[33m⚠\x1b[0m  ${d.message}${d.path ? `  (${d.path})` : ''}`);
}

console.log(`\n   ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length > 0 ? 1 : 0);
