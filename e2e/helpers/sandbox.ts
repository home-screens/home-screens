import { mkdtempSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Mirror the repo into a temp dir via symlinks, except `data/`, which starts
 * as a private directory seeded with the given files. All app data paths
 * resolve through process.cwd() (src/lib/json-store.ts), so a server started
 * with cwd=sandbox reads real source/build files through the symlinks while
 * every data write stays in the sandbox. Same technique as vitest.setup.ts.
 */
export function createSandbox(dataFiles: Record<string, unknown> = {}): string {
  const sandbox = mkdtempSync(path.join(os.tmpdir(), 'hs-e2e-'));
  for (const entry of readdirSync(REPO_ROOT)) {
    if (entry === 'data') continue;
    symlinkSync(path.join(REPO_ROOT, entry), path.join(sandbox, entry));
  }
  mkdirSync(path.join(sandbox, 'data'));
  for (const [name, value] of Object.entries(dataFiles)) {
    writeFileSync(path.join(sandbox, 'data', name), JSON.stringify(value, null, 2));
  }
  return sandbox;
}
