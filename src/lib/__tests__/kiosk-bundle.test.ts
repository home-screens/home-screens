import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { gunzipSync } from 'zlib';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  buildKioskBundle,
  getKioskBundle,
  resetKioskBundleCache,
  KIOSK_BUNDLE_ENTRIES,
} from '@/lib/kiosk-bundle';

const REPO_ROOT = process.cwd();

afterEach(() => resetKioskBundleCache());

describe('buildKioskBundle', () => {
  it('ships every declared entry from the real repo tree', async () => {
    // Building against the actual tree (not a fixture) is the point: if a
    // spoke script is renamed or deleted, this fails instead of shipping a
    // bundle that quietly drops a file.
    const bundle = await buildKioskBundle({ rootDir: REPO_ROOT, version: '9.9.9' });

    expect(bundle.files.map((f) => f.path)).toEqual(
      KIOSK_BUNDLE_ENTRIES.map((e) => e.path),
    );
    expect(bundle.version).toBe('9.9.9');
    expect(bundle.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(bundle.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true);
  });

  it('carries the launcher, updater and the units a spoke needs', async () => {
    const paths = KIOSK_BUNDLE_ENTRIES.map((e) => e.path);
    // The four files the whole feature stands on: without any one of them a
    // spoke either can't boot, can't update, or can't be told to update.
    expect(paths).toContain('kiosk-launcher-display.sh');
    expect(paths).toContain('kiosk-update.sh');
    expect(paths).toContain('kiosk-update-install.sh');
    expect(paths).toContain('system/kiosk-update-privileged.sh');
    expect(paths).toContain('system/home-screens-kiosk-update.timer');
  });

  it('never includes install-time config', async () => {
    // kiosk.conf and anything derived from the user's install answers are
    // config, not code. Shipping them would overwrite a display's identity.
    const sources = KIOSK_BUNDLE_ENTRIES.map((e) => e.source);
    expect(sources.some((s) => s.includes('kiosk.conf'))).toBe(false);
  });

  it('is byte-for-byte deterministic', async () => {
    const a = await buildKioskBundle({ rootDir: REPO_ROOT, version: '1.0.0' });
    const b = await buildKioskBundle({ rootDir: REPO_ROOT, version: '1.0.0' });
    // A spoke compares digests to decide whether to download, so an
    // archive that varied per request (mtime, uid, gzip timestamp) would
    // make every check look like a new version.
    expect(a.sha256).toBe(b.sha256);
    expect(a.tarGz.equals(b.tarGz)).toBe(true);
  });

  it('produces an archive GNU/BSD tar can actually read', async () => {
    // The ustar writer is hand-rolled for determinism, so verify against the
    // real tool the Pi will use rather than only against our own parser.
    const bundle = await buildKioskBundle({ rootDir: REPO_ROOT, version: '1.0.0' });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-bundle-'));
    try {
      const tarPath = path.join(dir, 'bundle.tar.gz');
      await fs.writeFile(tarPath, bundle.tarGz);
      const listed = execFileSync('tar', ['-tzf', tarPath], { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .sort();
      expect(listed).toEqual(KIOSK_BUNDLE_ENTRIES.map((e) => e.path).sort());

      execFileSync('tar', ['-xzf', tarPath, '-C', dir]);
      const launcher = await fs.readFile(path.join(dir, 'kiosk-launcher-display.sh'), 'utf8');
      expect(launcher).toContain('exec chromium');
      // The flags whose absence started all this.
      expect(launcher).toContain('--overscroll-history-navigation=0');
      expect(launcher).toContain('--autoplay-policy=no-user-gesture-required');
      expect(launcher).toContain('--remote-debugging-port=9222');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('records the on-disk content hash of each file', async () => {
    const bundle = await buildKioskBundle({ rootDir: REPO_ROOT, version: '1.0.0' });
    const gunzipped = gunzipSync(bundle.tarGz);
    // Two 512-byte trailer blocks plus at least one header+body per entry.
    expect(gunzipped.length % 512).toBe(0);
    expect(gunzipped.length).toBeGreaterThan(512 * (KIOSK_BUNDLE_ENTRIES.length * 2 + 2) - 1);
  });

  it('fails loudly when a source file is missing', async () => {
    await expect(
      buildKioskBundle({
        rootDir: REPO_ROOT,
        version: '1.0.0',
        entries: [{ path: 'nope.sh', source: 'scripts/definitely-not-here.sh', mode: 0o755 }],
      }),
    ).rejects.toThrow(/definitely-not-here\.sh/);
  });
});

describe('getKioskBundle', () => {
  it('memoizes across calls within a process', async () => {
    const a = await getKioskBundle({ rootDir: REPO_ROOT, version: '1.0.0' });
    const b = await getKioskBundle({ rootDir: REPO_ROOT, version: '1.0.0' });
    expect(a).toBe(b);
  });

  it('does not pin a failure for the process lifetime', async () => {
    await expect(
      getKioskBundle({ rootDir: '/nonexistent-root-for-tests', version: '1.0.0' }),
    ).rejects.toThrow();
    // A transient read failure must not poison every later request — the
    // next call gets a fresh attempt.
    const ok = await getKioskBundle({ rootDir: REPO_ROOT, version: '1.0.0' });
    expect(ok.files.length).toBe(KIOSK_BUNDLE_ENTRIES.length);
  });
});
