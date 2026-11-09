import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let directory: string;
let server: Server | undefined;
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'hs upgrade download '));
  mkdirSync(path.join(directory, 'scripts/lib'), { recursive: true });
  copyFileSync(path.join(repo, 'scripts/upgrade.sh'), path.join(directory, 'scripts/upgrade.sh'));
  copyFileSync(path.join(repo, 'scripts/lib/common.sh'), path.join(directory, 'scripts/lib/common.sh'));
  writeFileSync(path.join(directory, 'package.json'), '{"version":"1.14.0"}');
});
afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
  rmSync(directory, { recursive: true, force: true });
  rmSync(`${directory}.staging`, { recursive: true, force: true });
});

/** A stand-in for github.com that answers every request with `status`. */
async function fakeGitHub(status: number): Promise<string> {
  server = createServer((_req, res) => { res.statusCode = status; res.end(); });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** An address nothing listens on. */
async function unreachable(): Promise<string> {
  const closed = createServer();
  await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
  const { port } = closed.address() as AddressInfo;
  await new Promise<void>((resolve) => closed.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}

// Async, not spawnSync: the fake GitHub runs on this process's event loop.
function download(base: string): Promise<{ code: number | null; answer: { ok: boolean; error?: string } }> {
  return new Promise((resolve) => {
    const child = spawn('bash', [path.join(directory, 'scripts/upgrade.sh'), 'download', 'v1.15.0-beta.1'], {
      cwd: directory,
      env: { ...process.env, HS_GITHUB_DOWNLOAD_BASE: base },
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('close', (code) => resolve({ code, answer: JSON.parse(stdout.trim().split('\n').pop()!) }));
  });
}

describe('upgrade download: why the release file could not be checked', () => {
  it('says the device could not reach GitHub, with curl\'s reason, when the connection fails', async () => {
    const { code, answer } = await download(await unreachable());
    expect(code).toBe(1);
    expect(answer.ok).toBe(false);
    expect(answer.error).toMatch(/^This device could not reach GitHub to download v1\.15\.0-beta\.1\. Check its internet connection and try again\. \(curl: \(7\) .+\)$/);
    expect(answer.error).not.toMatch(/not found|does not have/i);
    expect(existsSync(`${directory}.staging`)).toBe(false);
  });

  it('says GitHub does not have the file only when GitHub answers 404', async () => {
    const { code, answer } = await download(await fakeGitHub(404));
    expect(code).toBe(1);
    expect(answer.error).toBe('GitHub does not have the download for v1.15.0-beta.1 (home-screens-v1.15.0-beta.1.tar.gz).');
    expect(existsSync(`${directory}.staging`)).toBe(false);
  });

  it('asks to try again later when GitHub answers with a server error', async () => {
    const { code, answer } = await download(await fakeGitHub(503));
    expect(code).toBe(1);
    expect(answer.error).toBe('GitHub could not send the download for v1.15.0-beta.1 right now (error 503). Try again in a few minutes.');
    expect(existsSync(`${directory}.staging`)).toBe(false);
  });
});
