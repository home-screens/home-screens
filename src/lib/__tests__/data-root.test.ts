import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { getDataRoot } from '../data-root';
import { isAuthEnabled, clearAuthCache, setPassword } from '../auth';

/**
 * The data root has to resolve the same way for everything that touches a
 * store file. The auth gate is where a divergence bites hardest: proxy.ts and
 * auth.ts each keep a stat-keyed cache of data/auth.json, and if the cache key
 * and the file come from two different roots the key never changes, so the
 * cache answers forever from its first read. In the proxy that fails open.
 */
const origCwd = process.cwd();
const origEnv = process.env.HOME_SCREENS_DIR;
let cwdDir: string;
let rootDir: string;

beforeEach(async () => {
  cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-cwd-'));
  rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-root-'));
  await fs.mkdir(path.join(cwdDir, 'data'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'data'), { recursive: true });
  process.cwd = () => cwdDir;
  clearAuthCache();
});

afterEach(async () => {
  process.cwd = () => origCwd;
  if (origEnv === undefined) delete process.env.HOME_SCREENS_DIR;
  else process.env.HOME_SCREENS_DIR = origEnv;
  clearAuthCache();
  await fs.rm(cwdDir, { recursive: true, force: true });
  await fs.rm(rootDir, { recursive: true, force: true });
});

describe('getDataRoot', () => {
  it('falls back to the current working directory when nothing is pinned', () => {
    delete process.env.HOME_SCREENS_DIR;
    expect(getDataRoot()).toBe(cwdDir);
  });

  it('prefers HOME_SCREENS_DIR over the working directory', () => {
    process.env.HOME_SCREENS_DIR = rootDir;
    expect(getDataRoot()).toBe(rootDir);
  });

  it('resolves per call, so a later cwd change is picked up', () => {
    delete process.env.HOME_SCREENS_DIR;
    expect(getDataRoot()).toBe(cwdDir);
    process.cwd = () => rootDir;
    expect(getDataRoot()).toBe(rootDir);
  });
});

describe('auth cache under a data root that is not the working directory', () => {
  it('sees a password written after its first read', async () => {
    process.env.HOME_SCREENS_DIR = rootDir;

    // First read warms the cache against a file with no password.
    await fs.writeFile(
      path.join(rootDir, 'data/auth.json'),
      JSON.stringify({ passwordHash: null, salt: null, cookieSecret: null }),
    );
    expect(await isAuthEnabled()).toBe(false);

    // A password is set, which rewrites the same file the cache is keyed on.
    await setPassword('hunter2');

    // In-process writers clear the cache themselves, so this holds either way.
    // It is here as the baseline for the out-of-process case below, which is
    // the one the stat signature is responsible for.
    expect(await isAuthEnabled()).toBe(true);
  });

  it('notices an out-of-process rewrite of auth.json', async () => {
    process.env.HOME_SCREENS_DIR = rootDir;
    const file = path.join(rootDir, 'data/auth.json');

    await setPassword('hunter2');
    expect(await isAuthEnabled()).toBe(true);

    // The reset script's rescue: replace the file with the server running.
    await fs.writeFile(file, JSON.stringify({ passwordHash: null, salt: null, cookieSecret: null }));
    expect(await isAuthEnabled()).toBe(false);
  });
});
