import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * A stand-in for github.com's release downloads, for the scripts that fetch
 * a release: `upgrade.sh download`, the installer, and the helper they share
 * in lib/common.sh. It runs on the test's own event loop, so the script under
 * test has to be started with `runBash` (async), never spawnSync.
 */

export const TAG = 'v1.15.0-beta.1';
export const ASSET = `home-screens-${TAG}.tar.gz`;
export const REPO = 'home-screens/home-screens';

/**
 * What the host does when asked for the release file.
 * - a number: answer every request with that status
 * - an object: the release is there (unless `head` says otherwise)
 */
export type Release =
  | number
  | {
      /** Files in the release tree. Default: a whole release. */
      files?: string[];
      /** 'good' publishes the right checksum, 'wrong' a mismatching one, 'none' publishes nothing. */
      checksum?: 'good' | 'wrong' | 'none';
      /** 'fail' answers the download itself with a 500; 'cut' sends half of it and hangs up. */
      download?: 'ok' | 'fail' | 'cut';
    };

export interface FakeHost {
  base: string;
  /** "METHOD path" of every request, in order. */
  requests: string[];
  close(): Promise<void>;
}

/** A release tarball holding the named files, plus a scripts/ folder. */
export function buildTarball(files: string[] = ['server.js', 'package.json']): Buffer {
  const work = mkdtempSync(path.join(tmpdir(), 'hs-fake-release-'));
  try {
    const tree = path.join(work, 'tree');
    mkdirSync(path.join(tree, 'scripts'), { recursive: true });
    for (const file of files) writeFileSync(path.join(tree, file), `// ${file}\n`);
    writeFileSync(path.join(tree, 'scripts', 'marker'), 'new release\n');
    const tarball = path.join(work, 'release.tar.gz');
    execFileSync('tar', ['-czf', tarball, '-C', tree, '.']);
    return readFileSync(tarball);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function fakeReleaseHost(release: Release): Promise<FakeHost> {
  const requests: string[] = [];
  const options = typeof release === 'number' ? null : release;
  const tarball = options ? buildTarball(options.files) : Buffer.alloc(0);
  const sum = options?.checksum === 'wrong' ? '0'.repeat(64) : createHash('sha256').update(tarball).digest('hex');
  const assetPath = `/${REPO}/releases/download/${TAG}/${ASSET}`;

  const server: Server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    if (!options) { res.statusCode = release as number; res.end(); return; }
    if (req.url === assetPath) {
      if (req.method === 'HEAD') { res.writeHead(200, { 'content-length': tarball.length }); res.end(); return; }
      if (options.download === 'fail') { res.statusCode = 500; res.end(); return; }
      if (options.download === 'cut') {
        res.writeHead(200, { 'content-length': tarball.length });
        res.write(tarball.subarray(0, Math.floor(tarball.length / 2)), () => res.destroy());
        return;
      }
      res.writeHead(200, { 'content-length': tarball.length });
      res.end(tarball);
      return;
    }
    if (req.url === `${assetPath}.sha256` && (options.checksum ?? 'good') !== 'none') {
      res.end(`${sum}  ${ASSET}\n`);
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

/** An address nothing listens on. */
export async function unreachableHost(): Promise<string> {
  const closed = createServer();
  await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
  const { port } = closed.address() as AddressInfo;
  await new Promise<void>((resolve) => closed.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}

export interface BashResult { code: number | null; stdout: string; stderr: string }

/** Run bash without blocking the event loop the fake host answers on. */
export function runBash(args: string[], options: { cwd?: string; env?: Record<string, string>; input?: string } = {}): Promise<BashResult> {
  return new Promise((resolve) => {
    const child = spawn('bash', args, { cwd: options.cwd, env: { ...process.env, ...options.env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(options.input ?? '');
  });
}

/**
 * Whether this machine can check a checksum the way a Pi does. Debian always
 * has sha256sum; an older macOS has only `shasum`, and there the scripts
 * report every published checksum as a mismatch, so the rows that need a
 * passing check are skipped.
 */
export const HAS_SHA256SUM = spawnSync('sha256sum', ['--version'], { stdio: 'ignore' }).status === 0;
