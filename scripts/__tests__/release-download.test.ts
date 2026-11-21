import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ASSET, HAS_SHA256SUM, REPO, TAG, fakeReleaseHost, runBash, unreachableHost, type FakeHost, type Release } from './fixtures/fake-release-host';

/**
 * The release download shared by the installer and the updater
 * (hs_download_release and hs_validate_release_tree in lib/common.sh), the
 * saved port (hs_read_port), and the installer's own use of them.
 *
 * The contract the callers lean on: the path of the download alone on
 * stdout, one plain sentence alone on stderr when it fails, and nothing left
 * behind in the download folder that should not be there. install.sh cannot
 * run off a Pi, so its download and unpack functions are lifted out of the
 * file and run as written around a pretend app tree.
 */

const COMMON = path.join(process.cwd(), 'scripts', 'lib', 'common.sh');
const INSTALL = readFileSync(path.join(process.cwd(), 'scripts', 'install.sh'), 'utf-8');

/** A function's whole definition out of install.sh. */
function installFunction(name: string): string {
  const start = INSTALL.indexOf(`\n${name}() {`);
  if (start < 0) throw new Error(`no ${name} in install.sh`);
  const end = INSTALL.indexOf('\n}\n', start);
  return INSTALL.slice(start + 1, end + 3);
}

let root: string;
let dest: string;
let host: FakeHost | undefined;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'hs release download '));
  dest = path.join(root, 'downloads');
  mkdirSync(dest);
});
afterEach(async () => {
  await host?.close();
  host = undefined;
  rmSync(root, { recursive: true, force: true });
});

/** Run a snippet with common.sh sourced, under the options the scripts use. */
function run(snippet: string, env: Record<string, string> = {}) {
  return runBash(['-c', `set -euo pipefail\nsource "${COMMON}"\n${snippet}`], { cwd: root, env });
}

async function fetchRelease(release: Release | 'unreachable', extra = '') {
  const base = release === 'unreachable' ? await unreachableHost() : (host = await fakeReleaseHost(release)).base;
  return run(`${extra}\nhs_download_release "${REPO}" "${TAG}" "${dest}"`, { HS_GITHUB_DOWNLOAD_BASE: base });
}

describe('hs_download_release', () => {
  it.skipIf(!HAS_SHA256SUM)('prints only the path of the checked download, and removes the checksum file', async () => {
    const result = await fetchRelease({ checksum: 'good' });
    expect(result).toEqual({ code: 0, stdout: `${dest}/${ASSET}\n`, stderr: '' });
    expect(readdirSync(dest)).toEqual([ASSET]);
  });

  it('keeps a download whose release published no checksum', async () => {
    const result = await fetchRelease({ checksum: 'none' });
    expect(result).toEqual({ code: 0, stdout: `${dest}/${ASSET}\n`, stderr: '' });
    expect(readdirSync(dest)).toEqual([ASSET]);
  });

  it.each<[string, Release | 'unreachable', RegExp]>([
    ['GitHub cannot be reached', 'unreachable', /^This device could not reach GitHub to download v1\.15\.0-beta\.1\. Check its internet connection and try again\. \(curl: \(7\) [^\n]+\)\n$/],
    ['GitHub answers 404', 404, /^GitHub does not have the download for v1\.15\.0-beta\.1 \(home-screens-v1\.15\.0-beta\.1\.tar\.gz\)\.\n$/],
    ['GitHub answers another error', 503, /^GitHub could not send the download for v1\.15\.0-beta\.1 right now \(error 503\)\. Try again in a few minutes\.\n$/],
    ['the download fails', { download: 'fail' }, /^Failed to download home-screens-v1\.15\.0-beta\.1\.tar\.gz\n$/],
    ['the download is cut off', { download: 'cut' }, /^Failed to download home-screens-v1\.15\.0-beta\.1\.tar\.gz\n$/],
    ['the checksum does not match', { checksum: 'wrong' }, /^Checksum verification failed for home-screens-v1\.15\.0-beta\.1\.tar\.gz\n$/],
  ])('says one sentence on stderr and nothing on stdout when %s', async (_name, release, sentence) => {
    const result = await fetchRelease(release);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(sentence);
    // Nothing half-downloaded or unchecked is left for a caller to trip on.
    expect(readdirSync(dest)).toEqual([]);
  });

  it('does not ask for the download once GitHub says the file is not there', async () => {
    await fetchRelease(404);
    expect(host!.requests).toEqual([`HEAD /${REPO}/releases/download/${TAG}/${ASSET}`]);
  });

  it('asks github.com when HS_GITHUB_DOWNLOAD_BASE is not set', async () => {
    // A curl that only writes down what it was asked.
    const bin = path.join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(path.join(bin, 'curl'), `#!/bin/sh\nfor a in "$@"; do last="$a"; done\necho "$last" >> "${root}/urls"\nprintf 404\n`, { mode: 0o755 });
    const env: Record<string, string> = { PATH: `${bin}:${process.env.PATH}`, HS_GITHUB_DOWNLOAD_BASE: '' };
    await run(`hs_download_release "${REPO}" "${TAG}" "${dest}" || true`, env);
    expect(readFileSync(path.join(root, 'urls'), 'utf8')).toBe(`https://github.com/${REPO}/releases/download/${TAG}/${ASSET}\n`);
  });

  it.skipIf(!HAS_SHA256SUM)('tells a caller that listens on descriptor 3 what it is doing, and keeps stdout to the path', async () => {
    const result = await run(
      [
        'hs_download_release_note() { echo "note: $1"; }',
        `{ downloaded="$(hs_download_release "${REPO}" "${TAG}" "${dest}")"; } 3>"${root}/progress"`,
        'echo "path: ${downloaded}"',
      ].join('\n'),
      { HS_GITHUB_DOWNLOAD_BASE: (host = await fakeReleaseHost({ checksum: 'good' })).base },
    );
    expect(result.stdout).toBe(`path: ${dest}/${ASSET}\n`);
    const progress = readFileSync(path.join(root, 'progress'), 'utf8');
    expect(progress).toContain('note: checksum-start');
    expect(progress).toContain('note: checksum-ok');
    expect(progress.indexOf('note: checksum-start')).toBeLessThan(progress.indexOf('note: checksum-ok'));
  });

  it('notes a release with no checksum to check against', async () => {
    const result = await run(
      [
        'hs_download_release_note() { echo "note: $1"; }',
        `{ hs_download_release "${REPO}" "${TAG}" "${dest}" >/dev/null; } 3>"${root}/progress"`,
      ].join('\n'),
      { HS_GITHUB_DOWNLOAD_BASE: (host = await fakeReleaseHost({ checksum: 'none' })).base },
    );
    expect(result.code).toBe(0);
    expect(readFileSync(path.join(root, 'progress'), 'utf8')).toContain('note: no-checksum');
  });

  it('leaves the caller\'s shell as it found it', async () => {
    host = await fakeReleaseHost(404);
    const result = await run(
      [
        `hs_download_release "${REPO}" "${TAG}" "${dest}" 2>/dev/null || true`,
        // Still strict, descriptor 3 still closed, no helper variables leaked.
        'case "$-" in *e*) echo "errexit kept" ;; esac',
        '{ : >&3; } 2>/dev/null && echo "descriptor 3 leaked" || echo "descriptor 3 closed"',
        'echo "asset_name=${asset_name:-unset}"',
      ].join('\n'),
      { HS_GITHUB_DOWNLOAD_BASE: host.base },
    );
    expect(result.stdout).toBe('errexit kept\ndescriptor 3 closed\nasset_name=unset\n');
  });
});

describe('hs_validate_release_tree', () => {
  const tree = () => path.join(root, 'tree');
  const place = (...files: string[]) => {
    mkdirSync(tree(), { recursive: true });
    for (const file of files) writeFileSync(path.join(tree(), file), '');
  };

  it('passes a tree with server.js and package.json, saying nothing', async () => {
    place('server.js', 'package.json');
    expect(await run(`hs_validate_release_tree "${tree()}"`)).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it.each([
    [['package.json'], 'server.js'],
    [['server.js'], 'package.json'],
    [[], 'server.js'],
  ])('with only %j, names %s as missing', async (files, missing) => {
    place(...files);
    const result = await run(`hs_validate_release_tree "${tree()}" || echo "returned $?"`);
    expect(result.stdout).toBe('returned 1\n');
    expect(result.stderr).toBe(`Tarball missing required file: ${missing}\n`);
  });

  it('fails a folder that is not there', async () => {
    const result = await run(`hs_validate_release_tree "${root}/nowhere" || echo "returned $?"`);
    expect(result.stdout).toBe('returned 1\n');
  });
});

describe('hs_read_port', () => {
  const app = () => path.join(root, 'app');
  const save = (content: string) => {
    mkdirSync(path.join(app(), 'data'), { recursive: true });
    writeFileSync(path.join(app(), 'data', 'port.conf'), content);
  };

  it('answers 3000 when no port was ever saved', async () => {
    expect((await run(`hs_read_port "${app()}"`)).stdout).toBe('3000\n');
  });

  it.each([
    ['8080\n', '8080'],
    ['8080', '8080'],
    ['  80 \r\n', '80'],
  ])('reads the saved port from %j', async (content, port) => {
    save(content);
    expect((await run(`hs_read_port "${app()}"`)).stdout).toBe(`${port}\n`);
  });

  it.each([
    ['', 'an empty file'],
    ['\n', 'a blank line'],
    ['eighty\n', 'a word'],
    ['8080; reboot\n', 'digits followed by something else'],
    ['-1\n', 'a negative number'],
  ])('answers 3000 for %j (%s)', async (content) => {
    save(content);
    expect((await run(`hs_read_port "${app()}"`)).stdout).toBe('3000\n');
  });

  it('answers 3000 when no app folder is named', async () => {
    expect((await run('hs_read_port ""; hs_read_port')).stdout).toBe('3000\n3000\n');
  });

  it('is what PORT is set from when common.sh loads, unless PORT is already set', async () => {
    save('8123\n');
    const load = (env: Record<string, string>) =>
      runBash(['-c', `set -euo pipefail\nsource "${COMMON}"\necho "\${PORT}"`], { env: { APP_DIR: app(), PORT: '', ...env } });
    expect((await load({})).stdout).toBe('8123\n');
    expect((await load({ PORT: '9000' })).stdout).toBe('9000\n');
    save('junk');
    expect((await load({})).stdout).toBe('3000\n');
    expect((await load({ APP_DIR: '' })).stdout).toBe('3000\n');
  });
});

describe('install.sh: downloading and unpacking the release', () => {
  const appDir = () => path.join(root, 'opt', 'current');
  const incoming = () => `${appDir()}.incoming`;

  /** install.sh's own functions and the two lines that put the tree in place. */
  function install(base: string) {
    mkdirSync(path.join(appDir(), 'data'), { recursive: true });
    writeFileSync(path.join(appDir(), 'old-app'), 'still here\n');
    const swap = INSTALL.match(/\nrm -rf "\$\{APP_DIR\}"\nmv "\$\{INCOMING_DIR\}" "\$\{APP_DIR\}"\n/);
    if (!swap) throw new Error('install.sh no longer swaps the unpacked release into place');
    const script = [
      `REPO="${REPO}"`,
      `LATEST_TAG="${TAG}"`,
      `APP_DIR="${appDir()}"`,
      'INCOMING_DIR="${APP_DIR}.incoming"',
      installFunction('hs_download_release_note'),
      installFunction('download_release'),
      installFunction('unpack_release'),
      `download_release "${dest}"`,
      'unpack_release',
      swap[0],
      'echo "swapped"',
    ].join('\n');
    return run(script, { HS_GITHUB_DOWNLOAD_BASE: base });
  }
  const plain = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, '');

  it('names the incoming folder beside the app and clears it however the script ends', () => {
    expect(INSTALL).toContain('INCOMING_DIR="${APP_DIR}.incoming"');
    expect(installFunction('_hs_cleanup')).toContain('rm -rf "${INCOMING_DIR}"');
    // Downloaded to where the installer has always put it.
    expect(INSTALL).toContain('\ndownload_release /tmp\n');
  });

  it.skipIf(!HAS_SHA256SUM)('downloads from HS_GITHUB_DOWNLOAD_BASE, checks, unpacks and swaps the release in', async () => {
    host = await fakeReleaseHost({ checksum: 'good' });
    const result = await install(host.base);
    expect(result.code, result.stderr).toBe(0);
    expect(host.requests).toEqual([
      `HEAD /${REPO}/releases/download/${TAG}/${ASSET}`,
      `GET /${REPO}/releases/download/${TAG}/${ASSET}`,
      `GET /${REPO}/releases/download/${TAG}/${ASSET}.sha256`,
    ]);
    const lines = plain(result.stdout).split('\n').filter((line) => line.startsWith('[') || line === 'swapped');
    expect(lines).toEqual([
      `[*] Downloading ${TAG}...`,
      '[*] Verifying checksum...',
      '[*] Checksum OK.',
      '[*] Extracting...',
      'swapped',
    ]);
    expect(readdirSync(appDir()).sort()).toEqual(['package.json', 'scripts', 'server.js']);
    expect(existsSync(incoming())).toBe(false);
    expect(readdirSync(dest)).toEqual([]);
  });

  it('warns and carries on when the release published no checksum', async () => {
    host = await fakeReleaseHost({ checksum: 'none' });
    const result = await install(host.base);
    expect(result.code, result.stderr).toBe(0);
    expect(plain(result.stdout)).toContain(`[!] No checksum sidecar published for ${TAG}, skipping verification.`);
    expect(existsSync(path.join(appDir(), 'server.js'))).toBe(true);
  });

  it.each<[string, Release | 'unreachable', string]>([
    ['GitHub cannot be reached', 'unreachable', `[x] This device could not reach GitHub to download ${TAG}. Check its internet connection and try again. (curl: (7)`],
    ['GitHub does not have the release', 404, `[x] GitHub does not have the download for ${TAG} (${ASSET}).`],
    ['GitHub answers another error', 503, `[x] GitHub could not send the download for ${TAG} right now (error 503). Try again in a few minutes.`],
    ['the download fails', { download: 'fail' }, `[x] Failed to download ${ASSET}`],
    ['the checksum does not match', { checksum: 'wrong' }, `[x] Checksum verification failed for ${ASSET}`],
    ['the release has no server.js', { files: ['package.json'], checksum: 'none' }, '[x] Tarball missing required file: server.js'],
    ['the release has no package.json', { files: ['server.js'], checksum: 'none' }, '[x] Tarball missing required file: package.json'],
  ])('stops with the reason and leaves the old app alone when %s', async (_name, release, message) => {
    const base = release === 'unreachable' ? await unreachableHost() : (host = await fakeReleaseHost(release)).base;
    const result = await install(base);
    expect(result.code).toBe(1);
    expect(plain(result.stdout)).toContain(message);
    expect(plain(result.stdout)).not.toContain('swapped');
    // The app that was installed before is untouched, and nothing is left over.
    expect(readFileSync(path.join(appDir(), 'old-app'), 'utf8')).toBe('still here\n');
    expect(existsSync(incoming())).toBe(false);
    expect(readdirSync(dest)).toEqual([]);
  });
});
