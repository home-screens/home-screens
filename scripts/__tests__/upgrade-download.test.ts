import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ASSET, HAS_SHA256SUM, TAG, fakeReleaseHost, runBash, unreachableHost, type FakeHost, type Release } from './fixtures/fake-release-host';

/**
 * `upgrade.sh download`: fetch a release into the staging folder and answer
 * the app with one line of JSON.
 *
 * The download and its checks are shared with the installer through
 * lib/common.sh, but upgrade.sh only sources that file when it is there and
 * keeps the same steps written out for when it is not. The app reads the
 * answer either way, so every case here runs twice, with lib/ beside the
 * script and without it, and the two must answer alike.
 */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let directory: string;
let host: FakeHost | undefined;

function place(withLib: boolean) {
  directory = mkdtempSync(path.join(tmpdir(), 'hs upgrade download '));
  mkdirSync(path.join(directory, 'scripts'), { recursive: true });
  copyFileSync(path.join(repo, 'scripts/upgrade.sh'), path.join(directory, 'scripts/upgrade.sh'));
  if (withLib) {
    mkdirSync(path.join(directory, 'scripts/lib'));
    copyFileSync(path.join(repo, 'scripts/lib/common.sh'), path.join(directory, 'scripts/lib/common.sh'));
  }
  writeFileSync(path.join(directory, 'package.json'), '{"version":"1.14.0"}');
}
afterEach(async () => {
  await host?.close();
  host = undefined;
  rmSync(directory, { recursive: true, force: true });
  rmSync(`${directory}.staging`, { recursive: true, force: true });
});

interface Answer { ok: boolean; error?: string; staging?: string }

async function download(base: string): Promise<{ code: number | null; stdout: string; answer: Answer }> {
  const { code, stdout } = await runBash([path.join(directory, 'scripts/upgrade.sh'), 'download', TAG], {
    cwd: directory,
    env: { HS_GITHUB_DOWNLOAD_BASE: base },
  });
  return { code, stdout, answer: JSON.parse(stdout.trim().split('\n').pop()!) };
}

async function downloadFrom(release: Release) {
  host = await fakeReleaseHost(release);
  return download(host.base);
}

const staging = () => `${directory}.staging`;

describe.each([
  { name: 'with lib/common.sh beside it', withLib: true },
  { name: 'without lib/', withLib: false },
])('upgrade download, $name', ({ withLib }) => {
  beforeEach(() => place(withLib));

  describe('why the release file could not be checked', () => {
    it('says the device could not reach GitHub, with curl\'s reason, when the connection fails', async () => {
      const { code, answer } = await download(await unreachableHost());
      expect(code).toBe(1);
      expect(answer.ok).toBe(false);
      expect(answer.error).toMatch(/^This device could not reach GitHub to download v1\.15\.0-beta\.1\. Check its internet connection and try again\. \(curl: \(7\) .+\)$/);
      expect(answer.error).not.toMatch(/not found|does not have/i);
      expect(existsSync(staging())).toBe(false);
    });

    it('says GitHub does not have the file only when GitHub answers 404', async () => {
      const { code, answer } = await downloadFrom(404);
      expect(code).toBe(1);
      expect(answer.error).toBe('GitHub does not have the download for v1.15.0-beta.1 (home-screens-v1.15.0-beta.1.tar.gz).');
      expect(existsSync(staging())).toBe(false);
    });

    it('asks to try again later when GitHub answers with a server error', async () => {
      const { code, answer } = await downloadFrom(503);
      expect(code).toBe(1);
      expect(answer.error).toBe('GitHub could not send the download for v1.15.0-beta.1 right now (error 503). Try again in a few minutes.');
      expect(existsSync(staging())).toBe(false);
    });

    it('keeps the answer valid JSON when curl\'s reason has quotes and backslashes in it', async () => {
      // A curl that fails the way a real one does, with a reason that would
      // break the JSON if it went in as it is.
      const bin = path.join(directory, 'bin');
      mkdirSync(bin);
      writeFileSync(path.join(bin, 'curl'), '#!/bin/sh\nprintf \'curl: (6) Could not resolve host: "git\\\\hub"\\r\\n\' >&2\nprintf 000\nexit 6\n', { mode: 0o755 });
      const { code, stdout } = await runBash([path.join(directory, 'scripts/upgrade.sh'), 'download', TAG], {
        cwd: directory,
        env: { PATH: `${bin}:${process.env.PATH}` },
      });
      expect(code).toBe(1);
      expect(stdout).toBe(`{"ok":false,"error":"This device could not reach GitHub to download ${TAG}. Check its internet connection and try again. (curl: (6) Could not resolve host: \\"git\\\\hub\\")"}\n`);
      expect(JSON.parse(stdout).error).toContain('Could not resolve host: "git\\hub")');
    });
  });

  describe('the download itself', () => {
    it('answers "Failed to download" when GitHub has the file but the download fails', async () => {
      const { code, answer } = await downloadFrom({ download: 'fail' });
      expect(code).toBe(1);
      expect(answer).toEqual({ ok: false, error: `Failed to download ${ASSET}` });
      expect(existsSync(staging())).toBe(false);
    });

    it('answers "Failed to download" when the connection drops partway through', async () => {
      const { code, answer } = await downloadFrom({ download: 'cut' });
      expect(code).toBe(1);
      expect(answer).toEqual({ ok: false, error: `Failed to download ${ASSET}` });
      expect(existsSync(staging())).toBe(false);
    });

    it('refuses a download that does not match its published checksum', async () => {
      const { code, answer } = await downloadFrom({ checksum: 'wrong' });
      expect(code).toBe(1);
      expect(answer).toEqual({ ok: false, error: `Checksum verification failed for ${ASSET}` });
      expect(existsSync(staging())).toBe(false);
    });

    it.each(['server.js', 'package.json'])('refuses a release that arrived without %s', async (missing) => {
      const files = ['server.js', 'package.json'].filter((f) => f !== missing);
      const { code, answer } = await downloadFrom({ files, checksum: 'none' });
      expect(code).toBe(1);
      expect(answer).toEqual({ ok: false, error: `Tarball missing required file: ${missing}` });
      expect(existsSync(staging())).toBe(false);
    });
  });

  describe('a good release', () => {
    it.skipIf(!HAS_SHA256SUM)('is checked, unpacked into the staging folder, and the downloads removed', async () => {
      // A staging folder left by an earlier attempt is replaced, not added to.
      mkdirSync(staging());
      writeFileSync(path.join(staging(), 'left-over'), 'old');

      const { code, stdout, answer } = await downloadFrom({ checksum: 'good' });
      expect(code).toBe(0);
      expect(answer).toEqual({ ok: true, staging: staging() });
      // Nothing but the answer follows curl's own progress on stdout.
      expect(stdout.endsWith(`{"ok":true,"staging":"${staging()}"}\n`)).toBe(true);
      expect(readdirSync(staging()).sort()).toEqual(['package.json', 'scripts', 'server.js']);
      expect(readFileSync(path.join(staging(), 'scripts/marker'), 'utf8')).toBe('new release\n');
      expect(host!.requests).toEqual([
        `HEAD /home-screens/home-screens/releases/download/${TAG}/${ASSET}`,
        `GET /home-screens/home-screens/releases/download/${TAG}/${ASSET}`,
        `GET /home-screens/home-screens/releases/download/${TAG}/${ASSET}.sha256`,
      ]);
    });

    it('is still installed when its release published no checksum', async () => {
      const { code, answer } = await downloadFrom({ checksum: 'none' });
      expect(code).toBe(0);
      expect(answer).toEqual({ ok: true, staging: staging() });
      expect(readdirSync(staging()).sort()).toEqual(['package.json', 'scripts', 'server.js']);
    });
  });

  it('answers "No tag specified" when no tag is given', async () => {
    const { code, stdout } = await runBash([path.join(directory, 'scripts/upgrade.sh'), 'download'], { cwd: directory });
    expect(code).toBe(1);
    expect(stdout).toBe('{"ok":false,"error":"No tag specified"}\n');
  });
});

describe('upgrade download: which path it takes', () => {
  // The cases above pass either way, so make sure both paths really ran.
  const script = readFileSync(path.join(repo, 'scripts/upgrade.sh'), 'utf8');
  const common = readFileSync(path.join(repo, 'scripts/lib/common.sh'), 'utf8');

  it('uses the shared helpers only when they are defined', () => {
    expect(script).toContain('if type -t hs_download_release >/dev/null && type -t hs_validate_release_tree >/dev/null; then');
    expect(common).toContain('hs_download_release() (');
    expect(common).toContain('hs_validate_release_tree() {');
  });

  it('still sources lib/common.sh only when the file is there', () => {
    expect(script).toContain('[ -f "${SCRIPT_DIR}/lib/common.sh" ] && source "${SCRIPT_DIR}/lib/common.sh"');
  });

  it('gives up on a stalled download the same way on both paths', () => {
    const flags = '--speed-limit 1024 --speed-time 60';
    expect(script).toContain(flags);
    expect(common).toContain(flags);
  });
});
