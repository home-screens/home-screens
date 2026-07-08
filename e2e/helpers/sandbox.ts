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
 *
 * Keys may be nested paths (e.g. `plugins/foo/dist/bundle.js`) — intermediate
 * directories are created automatically. A string value is written verbatim
 * (for non-JSON assets like plugin bundles); any other value is JSON-encoded.
 */
export function createSandbox(dataFiles: Record<string, unknown> = {}): string {
  const sandbox = mkdtempSync(path.join(os.tmpdir(), 'hs-e2e-'));
  for (const entry of readdirSync(REPO_ROOT)) {
    if (entry === 'data') continue;
    symlinkSync(path.join(REPO_ROOT, entry), path.join(sandbox, entry));
  }
  mkdirSync(path.join(sandbox, 'data'));
  for (const [name, value] of Object.entries(dataFiles)) {
    writeSandboxFile(sandbox, name, value);
  }
  return sandbox;
}

/** Write a single data file into an existing sandbox, creating parent dirs. */
export function writeSandboxFile(sandbox: string, relPath: string, value: unknown): void {
  const full = path.join(sandbox, 'data', relPath);
  mkdirSync(path.dirname(full), { recursive: true });
  const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  writeFileSync(full, body);
}
