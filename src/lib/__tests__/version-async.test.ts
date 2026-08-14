import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Mock child_process before importing
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// Mock secrets module
vi.mock('@/lib/secrets', () => ({
  getSecret: vi.fn().mockResolvedValue(null),
}));

import { execFile } from 'child_process';

const mockExecFile = vi.mocked(execFile);

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-version-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  vi.clearAllMocks();
});

afterEach(async () => {
  process.cwd = origCwd;
  vi.resetModules();
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

// Lazy import — must re-import per test to reset module-level caches
async function loadModule() {
  return await import('../version');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockExecFailure(err = new Error('command failed')) {
  mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
    (cb as (...a: unknown[]) => void)(err, '', '');
    return {} as ReturnType<typeof execFile>;
  });
}

function makeRelease(tag: string, opts?: { prerelease?: boolean; draft?: boolean; assets?: string[] }) {
  return {
    tag_name: tag,
    name: tag,
    body: '',
    draft: opts?.draft ?? false,
    prerelease: opts?.prerelease ?? false,
    published_at: '2026-01-01T00:00:00Z',
    assets: (opts?.assets ?? []).map((n) => ({ name: n, browser_download_url: `https://example.com/${n}` })),
  };
}

// ---------------------------------------------------------------------------
// fetchGitHubReleases
// ---------------------------------------------------------------------------
describe('fetchGitHubReleases', () => {
  it('fetches releases from GitHub API', async () => {
    const releases = [
      makeRelease('v1.0.0'),
      makeRelease('v0.9.0'),
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(releases),
      headers: new Headers({ etag: '"abc123"' }),
    } as Response);

    const { fetchGitHubReleases } = await loadModule();
    const result = await fetchGitHubReleases({ force: true });

    expect(result).toHaveLength(2);
    expect(result[0].tag_name).toBe('v1.0.0');
  });

  it('filters out draft releases', async () => {
    const releases = [
      makeRelease('v2.0.0', { draft: true }),
      makeRelease('v1.0.0'),
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(releases),
      headers: new Headers(),
    } as Response);

    const { fetchGitHubReleases } = await loadModule();
    const result = await fetchGitHubReleases({ force: true });

    expect(result).toHaveLength(1);
    expect(result[0].tag_name).toBe('v1.0.0');
  });

  it('excludes prerelease by default', async () => {
    const releases = [
      makeRelease('v2.0.0-rc.1', { prerelease: true }),
      makeRelease('v1.0.0'),
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(releases),
      headers: new Headers(),
    } as Response);

    const { fetchGitHubReleases } = await loadModule();
    const result = await fetchGitHubReleases({ force: true });

    expect(result).toHaveLength(1);
    expect(result[0].tag_name).toBe('v1.0.0');
  });

  it('includes prerelease when requested', async () => {
    const releases = [
      makeRelease('v2.0.0-rc.1', { prerelease: true }),
      makeRelease('v1.0.0'),
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(releases),
      headers: new Headers(),
    } as Response);

    const { fetchGitHubReleases } = await loadModule();
    const result = await fetchGitHubReleases({ force: true, includePrerelease: true });

    expect(result).toHaveLength(2);
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: new Headers(),
    } as Response);

    const { fetchGitHubReleases } = await loadModule();
    await expect(fetchGitHubReleases({ force: true })).rejects.toThrow('GitHub API returned 403');
  });
});

// ---------------------------------------------------------------------------
// hasReleaseTarball
// ---------------------------------------------------------------------------
describe('hasReleaseTarball', () => {
  it('returns true when tarball asset exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([
        makeRelease('v1.0.0', { assets: ['home-screens-v1.0.0.tar.gz'] }),
      ]),
      headers: new Headers(),
    } as Response);

    const { hasReleaseTarball } = await loadModule();
    const result = await hasReleaseTarball('v1.0.0');
    expect(result).toBe(true);
  });

  it('returns false when tag is not found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([makeRelease('v1.0.0')]),
      headers: new Headers(),
    } as Response);

    const { hasReleaseTarball } = await loadModule();
    const result = await hasReleaseTarball('v99.0.0');
    expect(result).toBe(false);
  });

  it('returns false on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'));

    const { hasReleaseTarball } = await loadModule();
    const result = await hasReleaseTarball('v1.0.0');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getVersionInfo — integration-style (with mocked deps)
// ---------------------------------------------------------------------------
describe('getVersionInfo', () => {
  it('returns version info from GitHub API', async () => {
    // Create a package.json in tmp
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ version: '1.0.0' }),
    );

    // Mock git (not a git repo)
    mockExecFailure();

    // Mock GitHub API
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([makeRelease('v2.0.0')]),
      headers: new Headers(),
    } as Response);

    const { getVersionInfo } = await loadModule();
    const info = await getVersionInfo({ force: true });

    expect(info.current).toBe('1.0.0');
    expect(info.latest).toBe('2.0.0');
    expect(info.updateAvailable).toBe(true);
    expect(info.installedVia).toBe('unknown');
  });

  it('detects git install method', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ version: '1.0.0' }),
    );

    // git rev-parse --is-inside-work-tree → success
    // git rev-parse --short HEAD → abc123
    // git rev-parse --abbrev-ref HEAD → main
    // git show-ref --tags → tags
    // git fetch --tags → success
    mockExecFile.mockImplementation((_cmd: unknown, args: unknown, _opts: unknown, cb: unknown) => {
      const argArr = args as string[];
      if (argArr.includes('--is-inside-work-tree')) {
        (cb as (...a: unknown[]) => void)(null, 'true', '');
      } else if (argArr.includes('--short')) {
        (cb as (...a: unknown[]) => void)(null, 'abc123', '');
      } else if (argArr.includes('--abbrev-ref')) {
        (cb as (...a: unknown[]) => void)(null, 'main', '');
      } else if (argArr.includes('--tags')) {
        (cb as (...a: unknown[]) => void)(null, '', '');
      } else {
        (cb as (...a: unknown[]) => void)(null, '', '');
      }
      return {} as ReturnType<typeof execFile>;
    });

    // GitHub API fails
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));

    const { getVersionInfo } = await loadModule();
    const info = await getVersionInfo({ force: true });

    expect(info.installedVia).toBe('git');
    expect(info.currentCommit).toBe('abc123');
    expect(info.channel).toBe('main');
  });

  it('detects tarball install method', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    // Create server.js (tarball marker)
    await fs.writeFile(path.join(tmpDir, 'server.js'), '');

    // Not a git repo
    mockExecFailure();

    // GitHub API fails
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));

    const { getVersionInfo } = await loadModule();
    const info = await getVersionInfo({ force: true });

    expect(info.installedVia).toBe('tarball');
  });

  it('returns no update when current is latest', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ version: '2.0.0' }));
    mockExecFailure();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([makeRelease('v2.0.0')]),
      headers: new Headers(),
    } as Response);

    const { getVersionInfo } = await loadModule();
    const info = await getVersionInfo({ force: true });

    expect(info.updateAvailable).toBe(false);
  });
});

describe('getPackageVersion', () => {
  it('reads the version from package.json in the current working directory', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ version: '2.5.1' }));
    const { getPackageVersion } = await loadModule();
    expect(await getPackageVersion()).toBe('2.5.1');
  });

  it('reads package.json once and serves later calls from memory', async () => {
    const pkgPath = path.join(tmpDir, 'package.json');
    await fs.writeFile(pkgPath, JSON.stringify({ version: '2.5.1' }));
    const { getPackageVersion } = await loadModule();

    expect(await getPackageVersion()).toBe('2.5.1');

    // This is now on the /api/displays path, which the editor polls every 5s
    // from several surfaces at once. Deleting the file mid-process proves the
    // second call never touched the disk — the version cannot change under a
    // running server anyway, since an upgrade restarts the process.
    await fs.rm(pkgPath);
    expect(await getPackageVersion()).toBe('2.5.1');
  });

  it('falls back to 0.0.0 when package.json carries no version', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'x' }));
    const { getPackageVersion } = await loadModule();
    expect(await getPackageVersion()).toBe('0.0.0');
  });

  it('does not memoize a failure, so a later call can still succeed', async () => {
    const { getPackageVersion } = await loadModule();
    // No package.json in the sandboxed cwd yet.
    await expect(getPackageVersion()).rejects.toThrow();

    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ version: '3.0.0' }));
    expect(await getPackageVersion()).toBe('3.0.0');
  });
});
