import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * The spoke shell-layer bundle: the files a display-only Pi runs locally,
 * carved out of the hub's own running tree and served to spokes so they stop
 * fossilizing at flash time.
 *
 * Version-locking the bundle to the hub build is the whole point — there is
 * never a "which launcher works with which hub?" compatibility matrix,
 * because the bundle IS the hub's tree.
 *
 * Deliberately NOT in here: anything derived from install-time answers
 * (data/kiosk.conf, display id, backend URL, rotation). Those are config, not
 * code, and are never touched by an update.
 */

export interface KioskBundleEntry {
  /** Path inside the tarball. */
  path: string;
  /** Path relative to the app root the hub is running from. */
  source: string;
  mode: number;
}

/**
 * The file set, in tar order. `system/` entries are the ones that land in
 * root-owned destinations (/usr/local/bin, /etc/systemd/system) and are
 * installed by the spoke's privileged helper; everything else is user-space.
 */
export const KIOSK_BUNDLE_ENTRIES: readonly KioskBundleEntry[] = [
  { path: 'kiosk-launcher-display.sh', source: 'scripts/kiosk-launcher-display.sh', mode: 0o755 },
  { path: 'kiosk-update-install.sh', source: 'scripts/kiosk-update-install.sh', mode: 0o755 },
  { path: 'kiosk-update.sh', source: 'scripts/kiosk-update.sh', mode: 0o755 },
  { path: 'rotate-display.sh', source: 'scripts/rotate-display.sh', mode: 0o755 },
  { path: 'share/connecting.html', source: 'scripts/share/connecting.html', mode: 0o644 },
  {
    path: 'system/home-screens-kiosk-update.service',
    source: 'scripts/home-screens-kiosk-update.service',
    mode: 0o644,
  },
  {
    path: 'system/home-screens-kiosk-update.timer',
    source: 'scripts/home-screens-kiosk-update.timer',
    mode: 0o644,
  },
  {
    path: 'system/home-screens-reporter.service',
    source: 'scripts/home-screens-reporter.service',
    mode: 0o644,
  },
  {
    path: 'system/home-screens-reporter.timer',
    source: 'scripts/home-screens-reporter.timer',
    mode: 0o644,
  },
  { path: 'system/kiosk-update-privileged.sh', source: 'scripts/kiosk-update-privileged.sh', mode: 0o755 },
  { path: 'system/reporter.sh', source: 'scripts/reporter.sh', mode: 0o755 },
] as const;

export interface KioskBundleManifestFile {
  path: string;
  sha256: string;
}

export interface KioskBundleManifest {
  /** The hub's app version — the same value the Updates page shows. */
  version: string;
  /** SHA-256 of the gzipped tarball. */
  sha256: string;
  files: KioskBundleManifestFile[];
}

export interface KioskBundle extends KioskBundleManifest {
  tarGz: Buffer;
}

const BLOCK = 512;

/** ustar numeric field: zero-padded octal, NUL-terminated. */
function octalField(value: number, len: number): string {
  return value.toString(8).padStart(len - 1, '0') + '\0';
}

/**
 * Build a POSIX ustar header for one regular file.
 *
 * Hand-rolled rather than pulled from a tar library because determinism is
 * the requirement here, not features: uid/gid/mtime are pinned to 0 and
 * uname/gname left empty, so the same input tree always produces the same
 * bytes and therefore the same digest. A spoke can then compare digests
 * meaningfully, and the in-memory cache below is safe to key on the build.
 */
function ustarHeader(name: string, size: number, mode: number): Buffer {
  if (Buffer.byteLength(name, 'utf8') > 100) {
    // The ustar `prefix` field could split longer paths, but every bundle
    // path is a short filename — fail loudly rather than emit a silently
    // truncated archive if that ever stops being true.
    throw new Error(`kiosk bundle path too long for ustar: ${name}`);
  }
  const h = Buffer.alloc(BLOCK, 0);
  h.write(name, 0, 100, 'utf8');
  h.write(octalField(mode & 0o7777, 8), 100, 8, 'ascii'); // mode
  h.write(octalField(0, 8), 108, 8, 'ascii'); // uid — root
  h.write(octalField(0, 8), 116, 8, 'ascii'); // gid — root
  h.write(octalField(size, 12), 124, 12, 'ascii');
  h.write(octalField(0, 12), 136, 12, 'ascii'); // mtime — fixed epoch
  h.write('        ', 148, 8, 'ascii'); // checksum field counts as spaces
  h.write('0', 156, 1, 'ascii'); // typeflag — regular file
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');

  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return h;
}

/** Pad a body to the next 512-byte boundary. */
function padTo512(len: number): Buffer {
  const rem = len % BLOCK;
  return rem === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK - rem, 0);
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Assemble the bundle from a tree on disk.
 *
 * A missing source file is a hard error rather than a silent omission: a
 * bundle that quietly ships without, say, the reporter would leave spokes
 * looking updated while losing a feature.
 */
export async function buildKioskBundle(options: {
  rootDir: string;
  version: string;
  entries?: readonly KioskBundleEntry[];
}): Promise<KioskBundle> {
  const entries = options.entries ?? KIOSK_BUNDLE_ENTRIES;
  const chunks: Buffer[] = [];
  const files: KioskBundleManifestFile[] = [];

  for (const entry of entries) {
    const abs = path.join(options.rootDir, entry.source);
    let content: Buffer;
    try {
      content = await fs.readFile(abs);
    } catch {
      throw new Error(`kiosk bundle source missing: ${entry.source}`);
    }
    chunks.push(ustarHeader(entry.path, content.length, entry.mode));
    chunks.push(content);
    chunks.push(padTo512(content.length));
    files.push({ path: entry.path, sha256: sha256(content) });
  }

  // Two zero blocks terminate a tar archive.
  chunks.push(Buffer.alloc(BLOCK * 2, 0));

  // level 9 for a handful of small text files costs nothing and keeps the
  // download trivial over a home LAN. Node's gzip header carries mtime 0,
  // so the compressed bytes stay deterministic too.
  const tarGz = gzipSync(Buffer.concat(chunks), { level: 9 });

  return { version: options.version, sha256: sha256(tarGz), files, tarGz };
}

let cached: Promise<KioskBundle> | null = null;

/**
 * Process-lifetime cache. A hub process only ever serves one build of itself,
 * and an upgrade restarts the process, so "cache forever" is exactly "cache
 * per build" without needing to read BUILD_ID.
 */
export function getKioskBundle(options: { rootDir: string; version: string }): Promise<KioskBundle> {
  if (!cached) {
    cached = buildKioskBundle(options).catch((err) => {
      cached = null; // don't pin a transient read failure for the process lifetime
      throw err;
    });
  }
  return cached;
}

/** Test seam — drops the memoized bundle. */
export function resetKioskBundleCache(): void {
  cached = null;
}
