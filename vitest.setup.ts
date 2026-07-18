/**
 * Global data-directory sandbox for the test suite.
 *
 * Every test file runs with its cwd moved into a fresh temp directory that
 * mirrors the repo via symlinks — except `data/`, which starts empty. Code
 * under test resolves paths with `process.cwd()` (see json-store.ts), so all
 * reads of source files, package.json, translations, etc. still work through
 * the symlinks, while every write aimed at `data/` lands in the sandbox.
 *
 * Why per-test cwd overrides aren't enough on their own: fire-and-forget
 * writes (the audit log queue in lib/audit.ts, readConfig's migrate-on-boot
 * persist in lib/config.ts) can execute after a test's afterEach has already
 * restored process.cwd, clobbering the real data/config.json and friends
 * with test fixtures. Chdir-ing the whole worker means late writes still
 * land in the sandbox. Tests that additionally override process.cwd with
 * their own tmpDir keep working unchanged on top of this.
 */
import { mkdtempSync, mkdirSync, readdirSync, symlinkSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// Derive the repo root from this file's location, NOT process.cwd() — when a
// worker process is reused across test files, cwd is already a sandbox.
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'hs-vitest-'));
for (const entry of readdirSync(repoRoot)) {
  if (entry === 'data' || entry === 'public') continue;
  symlinkSync(path.join(repoRoot, entry), path.join(sandbox, entry));
}
mkdirSync(path.join(sandbox, 'data'));
sandboxPublicDir(repoRoot, sandbox);

/**
 * `public/` gets the same protection as `data/`: user-uploaded media lives in
 * public/backgrounds, so a symlinked public/ lets any test write to — or
 * delete — the REAL library (2026-07-09 incident: a test's beforeEach
 * fs.rm(public/backgrounds) followed the symlink and wiped it, mirroring the
 * 2026-07-07 config.json wipe that created this sandbox). Static assets stay
 * readable through per-child symlinks; `backgrounds` is a real, empty,
 * sandbox-local directory with only its git-tracked children linked in.
 */
function sandboxPublicDir(root: string, box: string): void {
  mkdirSync(path.join(box, 'public'));
  for (const entry of readdirSync(path.join(root, 'public'))) {
    if (entry === 'backgrounds') continue;
    symlinkSync(path.join(root, 'public', entry), path.join(box, 'public', entry));
  }
  mkdirSync(path.join(box, 'public', 'backgrounds'));
  for (const entry of ['default.svg', 'themes']) {
    try {
      symlinkSync(path.join(root, 'public', 'backgrounds', entry), path.join(box, 'public', 'backgrounds', entry));
    } catch { /* asset absent in this checkout — tests that need it will say so */ }
  }
}

try {
  process.chdir(sandbox);
} catch {
  // chdir is unavailable in worker_threads (pool: 'threads'). Fall back to
  // patching process.cwd — weaker (a test restoring its own override could
  // expose the real cwd again), but still catches import-time path captures.
  process.cwd = () => sandbox;
}
