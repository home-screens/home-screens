import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Mock child_process before importing
vi.mock('child_process', () => ({
  execFile: vi.fn(),
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

type FetchAnswer = { status: number; body?: unknown; etag?: string };

/**
 * Route `fetch` by URL: the release page, `releases/latest`, and the
 * per-tag lookup are separate calls now, and a test that answers only one
 * of them must not have the others resolve to `undefined` by accident.
 */
function mockGitHub(answers: { page?: FetchAnswer; latest?: FetchAnswer; tag?: FetchAnswer }) {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    calls.push(url);
    const pick = url.includes('/releases/latest')
      ? answers.latest
      : url.includes('/releases/tags/')
        ? answers.tag
        : url.includes('/releases?')
          ? answers.page
          : undefined;
    if (!pick) throw new Error(`unexpected fetch ${url}`);
    return {
      ok: pick.status >= 200 && pick.status < 300,
      status: pick.status,
      json: () => Promise.resolve(pick.body),
      headers: new Headers(pick.etag ? { etag: pick.etag } : {}),
    } as Response;
  });
  return calls;
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
// fetchGitHubReleases / fetchLatestStableRelease / getChannelReleases
// ---------------------------------------------------------------------------
describe('fetchGitHubReleases', () => {
  it('fetches releases from GitHub API', async () => {
    mockGitHub({ page: { status: 200, body: [makeRelease('v1.0.0'), makeRelease('v0.9.0')], etag: '"abc123"' } });

    const { fetchGitHubReleases } = await loadModule();
    const result = await fetchGitHubReleases({ force: true });

    expect(result).toHaveLength(2);
    expect(result[0].tag_name).toBe('v1.0.0');
  });

  it('filters out draft releases', async () => {
    mockGitHub({ page: { status: 200, body: [makeRelease('v2.0.0', { draft: true }), makeRelease('v1.0.0')] } });

    const { fetchGitHubReleases } = await loadModule();
    const result = await fetchGitHubReleases({ force: true });

    expect(result).toHaveLength(1);
    expect(result[0].tag_name).toBe('v1.0.0');
  });

  it('returns every channel mixed; scoping is the caller\'s job', async () => {
    mockGitHub({ page: { status: 200, body: [makeRelease('v2.0.0-rc.1', { prerelease: true }), makeRelease('v1.0.0')] } });

    const { fetchGitHubReleases } = await loadModule();
    const result = await fetchGitHubReleases({ force: true });

    expect(result).toHaveLength(2);
  });

  it('throws on non-ok response', async () => {
    mockGitHub({ page: { status: 403 } });

    const { fetchGitHubReleases } = await loadModule();
    await expect(fetchGitHubReleases({ force: true })).rejects.toThrow('GitHub API returned 403');
  });
});

describe('fetchLatestStableRelease', () => {
  it('returns the release GitHub calls latest', async () => {
    mockGitHub({ latest: { status: 200, body: makeRelease('v1.12.2') } });
    const { fetchLatestStableRelease } = await loadModule();
    expect((await fetchLatestStableRelease({ force: true }))?.tag_name).toBe('v1.12.2');
  });

  it('treats 404 as no stable release yet rather than an error', async () => {
    mockGitHub({ latest: { status: 404 } });
    const { fetchLatestStableRelease } = await loadModule();
    expect(await fetchLatestStableRelease({ force: true })).toBeNull();
  });

  it('serves the cache inside the TTL without a second request', async () => {
    const calls = mockGitHub({ latest: { status: 200, body: makeRelease('v1.12.2'), etag: '"e1"' } });
    const { fetchLatestStableRelease } = await loadModule();
    await fetchLatestStableRelease({ force: true });
    await fetchLatestStableRelease();
    expect(calls.filter((u) => u.includes('/releases/latest'))).toHaveLength(1);
  });
});

describe('getChannelReleases', () => {
  const page = [
    makeRelease('v1.12.3-dev.20260908', { prerelease: true }),
    makeRelease('v1.13.0-rc.1', { prerelease: true }),
    makeRelease('v1.13.0-beta.2', { prerelease: true }),
    makeRelease('v1.12.3-dev.20260907', { prerelease: true }),
  ];

  it('stable resolves from releases/latest even when the page holds no stable release', async () => {
    // Daily nightlies push every stable off the 30-item page; this is the
    // silent update outage the merge exists to prevent.
    mockGitHub({ page: { status: 200, body: page }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    const { getChannelReleases } = await loadModule();
    const stable = await getChannelReleases('stable', { force: true });
    expect(stable.map((r) => r.tag_name)).toEqual(['v1.12.2']);
  });

  it('rc sees candidates and the stable, never betas or nightlies', async () => {
    mockGitHub({ page: { status: 200, body: page }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    const { getChannelReleases } = await loadModule();
    const rc = await getChannelReleases('rc', { force: true });
    expect(rc.map((r) => r.tag_name)).toEqual(['v1.13.0-rc.1', 'v1.12.2']);
  });

  it('beta sees betas, candidates and the stable, never nightlies', async () => {
    mockGitHub({ page: { status: 200, body: page }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    const { getChannelReleases } = await loadModule();
    const beta = await getChannelReleases('beta', { force: true });
    expect(beta.map((r) => r.tag_name)).toEqual(['v1.13.0-rc.1', 'v1.13.0-beta.2', 'v1.12.2']);
  });

  it('nightly sees everything, newest first', async () => {
    mockGitHub({ page: { status: 200, body: page }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    const { getChannelReleases } = await loadModule();
    const nightly = await getChannelReleases('nightly', { force: true });
    expect(nightly.map((r) => r.tag_name)).toEqual([
      'v1.13.0-rc.1',
      'v1.13.0-beta.2',
      'v1.12.3-dev.20260908',
      'v1.12.3-dev.20260907',
      'v1.12.2',
    ]);
  });

  it('does not duplicate a stable that is on the page and is also latest', async () => {
    mockGitHub({
      page: { status: 200, body: [makeRelease('v1.12.2'), makeRelease('v1.12.0')] },
      latest: { status: 200, body: makeRelease('v1.12.2') },
    });
    const { getChannelReleases } = await loadModule();
    const stable = await getChannelReleases('stable', { force: true });
    expect(stable.map((r) => r.tag_name)).toEqual(['v1.12.2', 'v1.12.0']);
  });

  it('stable still resolves from releases/latest when the page fails', async () => {
    mockGitHub({ page: { status: 500 }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    const { getChannelReleases } = await loadModule();
    expect((await getChannelReleases('stable', { force: true })).map((r) => r.tag_name)).toEqual(['v1.12.2']);
  });

  it('refuses to answer a prerelease channel from releases/latest alone', async () => {
    // The page is the only source of prereleases. Answering nightly with
    // just the stable would offer a nightly user that stable as a step back
    // while they are still on the nightly channel.
    mockGitHub({ page: { status: 500 }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    const { getChannelReleases } = await loadModule();
    for (const ch of ['rc', 'beta', 'nightly'] as const) {
      await expect(getChannelReleases(ch, { force: true })).rejects.toThrow('GitHub API returned 500');
    }
  });

  it('answers a prerelease channel from the page alone when releases/latest fails', async () => {
    mockGitHub({ page: { status: 200, body: page }, latest: { status: 500 } });
    const { getChannelReleases } = await loadModule();
    expect((await getChannelReleases('nightly', { force: true })).map((r) => r.tag_name)).toEqual([
      'v1.13.0-rc.1',
      'v1.13.0-beta.2',
      'v1.12.3-dev.20260908',
      'v1.12.3-dev.20260907',
    ]);
  });

  it('throws when both sources fail cold', async () => {
    mockGitHub({ page: { status: 500 }, latest: { status: 500 } });
    const { getChannelReleases } = await loadModule();
    await expect(getChannelReleases('stable', { force: true })).rejects.toThrow('GitHub API returned 500');
  });

  it('refuses to answer stable from the page alone when releases/latest fails', async () => {
    // The page can miss the newest stable once nightlies fill it. Answered
    // from the page alone, a device on 1.12.2 would be offered 1.12.1 as a
    // step back for doing nothing.
    mockGitHub({ page: { status: 200, body: [...page, makeRelease('v1.12.1')] }, latest: { status: 500 } });
    const { getChannelReleases } = await loadModule();
    await expect(getChannelReleases('stable', { force: true })).rejects.toThrow('GitHub API returned 500');
  });

  it('requires the page on stable too when the caller asks for history', async () => {
    mockGitHub({ page: { status: 500 }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    const { getChannelReleases } = await loadModule();
    await expect(getChannelReleases('stable', { force: true, requirePage: true })).rejects.toThrow('GitHub API returned 500');
  });

  it('withdraws a stable-shaped release that GitHub marks as a pre-release from every channel', async () => {
    // Ticking "Set as a pre-release" on a shipped release is the kill switch
    // for a bad build. releases/latest already skips it; the page must too.
    const pulled = makeRelease('v1.13.0', { prerelease: true });
    mockGitHub({ page: { status: 200, body: [pulled, ...page] }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    const { getChannelReleases } = await loadModule();
    for (const ch of ['stable', 'rc', 'beta', 'nightly'] as const) {
      const tags = (await getChannelReleases(ch, { force: true })).map((r) => r.tag_name);
      expect(tags, ch).not.toContain('v1.13.0');
    }
    expect((await getChannelReleases('stable')).map((r) => r.tag_name)).toEqual(['v1.12.2']);
  });

  it('serves the stale page on a failed background refresh so the channel stays complete', async () => {
    const calls = mockGitHub({ page: { status: 200, body: page }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    const { getChannelReleases } = await loadModule();
    await getChannelReleases('nightly', { force: true });

    // Next refresh, past the TTL: the page endpoint is down. The hour-old
    // page is still the truth about which nightlies exist; a stable-only
    // answer would not be.
    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 60 * 60 * 1000);
    mockGitHub({ page: { status: 503 }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    const again = await getChannelReleases('nightly');
    expect(again.map((r) => r.tag_name)).toEqual([
      'v1.13.0-rc.1',
      'v1.13.0-beta.2',
      'v1.12.3-dev.20260908',
      'v1.12.3-dev.20260907',
      'v1.12.2',
    ]);
    expect(calls.length).toBeGreaterThan(0);
  });

  it('stops serving the stale page once it is older than the stale window', async () => {
    mockGitHub({ page: { status: 200, body: page }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    const { getChannelReleases } = await loadModule();
    await getChannelReleases('nightly', { force: true });

    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 7 * 60 * 60 * 1000);
    mockGitHub({ page: { status: 503 }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    await expect(getChannelReleases('nightly')).rejects.toThrow('GitHub API returned 503');
  });

  it('never serves stale on a forced check, so the git fallback gets its turn', async () => {
    // The user clicked Check for Updates while GitHub is rate limiting. A
    // stale "nothing new" would hide a tag git can still see.
    mockGitHub({ page: { status: 200, body: page }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    const { getChannelReleases } = await loadModule();
    await getChannelReleases('nightly', { force: true });

    vi.restoreAllMocks();
    mockGitHub({ page: { status: 403 }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    await expect(getChannelReleases('nightly', { force: true })).rejects.toThrow('GitHub API returned 403');
  });

  it('applies the stale policy per caller when a forced check joins a background refresh', async () => {
    // Background poll and Check for Updates overlap while GitHub is failing.
    // They share the one request, but only the background caller may fall
    // back to the hour-old page; the forced one has to see the failure.
    mockGitHub({ page: { status: 200, body: page }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    const { getChannelReleases } = await loadModule();
    await getChannelReleases('nightly', { force: true });

    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 60 * 60 * 1000);
    let failPage: (() => void) | null = null;
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/releases/latest')) {
        return { ok: true, status: 200, json: async () => makeRelease('v1.12.2'), headers: new Headers() } as Response;
      }
      return new Promise<Response>((resolve) => {
        // 403 (rate limited) is not retried, so this is the one page request.
        failPage = () => resolve({ ok: false, status: 403, json: async () => ({}), headers: new Headers() } as Response);
      });
    });

    const background = getChannelReleases('nightly');
    const forced = getChannelReleases('nightly', { force: true });
    await vi.waitFor(() => expect(failPage).not.toBeNull());
    failPage!();

    expect((await background).map((r) => r.tag_name)).toContain('v1.12.3-dev.20260908');
    await expect(forced).rejects.toThrow('GitHub API returned 403');
    expect(calls.filter((u) => u.includes('/releases?'))).toHaveLength(1);
  });

  it('shares one in-flight request per endpoint between concurrent callers', async () => {
    // The version route asks for the channel twice per hit (info and tags).
    const calls = mockGitHub({ page: { status: 200, body: page }, latest: { status: 200, body: makeRelease('v1.12.2') } });
    const { getChannelReleases } = await loadModule();
    const [a, b] = await Promise.all([
      getChannelReleases('nightly', { force: true }),
      getChannelReleases('nightly', { force: true }),
    ]);
    expect(a).toEqual(b);
    expect(calls.filter((u) => u.includes('/releases?'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/releases/latest'))).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// hasReleaseTarball
// ---------------------------------------------------------------------------
describe('hasReleaseTarball', () => {
  it('returns true when tarball asset exists on the page', async () => {
    mockGitHub({ page: { status: 200, body: [makeRelease('v1.0.0', { assets: ['home-screens-v1.0.0.tar.gz'] })] } });

    const { hasReleaseTarball } = await loadModule();
    expect(await hasReleaseTarball('v1.0.0')).toBe(true);
  });

  it('looks a tag up directly when it is not on the page', async () => {
    // A stable older than a run of nightlies, or the one a nightly user is
    // stepping back to. Declaring it tarball-less would send the upgrade
    // down the git path and fail every tarball install.
    const calls = mockGitHub({
      page: { status: 200, body: [makeRelease('v1.0.0')] },
      tag: { status: 200, body: makeRelease('v0.9.0', { assets: ['home-screens-v0.9.0.tar.gz'] }) },
    });

    const { hasReleaseTarball } = await loadModule();
    expect(await hasReleaseTarball('v0.9.0')).toBe(true);
    expect(calls.some((u) => u.endsWith('/releases/tags/v0.9.0'))).toBe(true);
  });

  it('returns false when the tag exists nowhere', async () => {
    mockGitHub({ page: { status: 200, body: [makeRelease('v1.0.0')] }, tag: { status: 404 } });

    const { hasReleaseTarball } = await loadModule();
    expect(await hasReleaseTarball('v99.0.0')).toBe(false);
  });

  it('returns false when the page lists the tag without a tarball', async () => {
    mockGitHub({ page: { status: 200, body: [makeRelease('v1.0.0')] } });

    const { hasReleaseTarball } = await loadModule();
    expect(await hasReleaseTarball('v1.0.0')).toBe(false);
  });

  it('returns false on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));

    const { hasReleaseTarball } = await loadModule();
    expect(await hasReleaseTarball('v1.0.0')).toBe(false);
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
    mockGitHub({ page: { status: 200, body: [makeRelease('v2.0.0')] }, latest: { status: 200, body: makeRelease('v2.0.0') } });

    const { getVersionInfo } = await loadModule();
    const info = await getVersionInfo({ force: true });

    expect(info.current).toBe('1.0.0');
    expect(info.latest).toBe('2.0.0');
    expect(info.updateAvailable).toBe(true);
    expect(info.isDowngrade).toBe(false);
    expect(info.updateChannel).toBe('stable');
    expect(info.installedVia).toBe('unknown');
  });

  it('scopes latest to the requested channel', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    mockExecFailure();
    mockGitHub({
      page: { status: 200, body: [makeRelease('v1.1.0-rc.1', { prerelease: true }), makeRelease('v1.2.0-beta.1', { prerelease: true }), makeRelease('v1.0.1-dev.20260908', { prerelease: true })] },
      latest: { status: 200, body: makeRelease('v1.0.0') },
    });

    const { getVersionInfo } = await loadModule();
    expect((await getVersionInfo({ force: true, channel: 'stable' })).latest).toBe('1.0.0');
    expect((await getVersionInfo({ channel: 'rc' })).latest).toBe('1.1.0-rc.1');
    expect((await getVersionInfo({ channel: 'beta' })).latest).toBe('1.2.0-beta.1');
    expect((await getVersionInfo({ channel: 'nightly' })).latest).toBe('1.2.0-beta.1');
  });

  it('does not offer a downgrade to a nightly user when the release page is unreachable', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ version: '1.0.1-dev.20260908' }));
    mockExecFailure();
    mockGitHub({ page: { status: 500 }, latest: { status: 200, body: makeRelease('v1.0.0') } });

    const { getVersionInfo } = await loadModule();
    const info = await getVersionInfo({ force: true, channel: 'nightly' });
    expect(info.latest).toBeNull();
    expect(info.updateAvailable).toBe(false);
    expect(info.isDowngrade).toBe(false);
  });

  it('offers the stable as a downgrade to a nightly build on the stable channel', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ version: '1.0.1-dev.20260908' }));
    mockExecFailure();
    mockGitHub({ page: { status: 200, body: [] }, latest: { status: 200, body: makeRelease('v1.0.0') } });

    const { getVersionInfo } = await loadModule();
    const info = await getVersionInfo({ force: true, channel: 'stable' });
    expect(info.currentChannel).toBe('nightly');
    expect(info.latest).toBe('1.0.0');
    expect(info.updateAvailable).toBe(true);
    expect(info.isDowngrade).toBe(true);
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
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    const { getVersionInfo } = await loadModule();
    const info = await getVersionInfo({ force: true });

    expect(info.installedVia).toBe('git');
    expect(info.currentCommit).toBe('abc123');
    expect(info.branch).toBe('main');
  });

  it('detects tarball install method', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    // Create server.js (tarball marker)
    await fs.writeFile(path.join(tmpDir, 'server.js'), '');

    // Not a git repo
    mockExecFailure();

    // GitHub API fails
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    const { getVersionInfo } = await loadModule();
    const info = await getVersionInfo({ force: true });

    expect(info.installedVia).toBe('tarball');
  });

  it('returns no update when current is latest', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ version: '2.0.0' }));
    mockExecFailure();

    mockGitHub({ page: { status: 200, body: [makeRelease('v2.0.0')] }, latest: { status: 200, body: makeRelease('v2.0.0') } });

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
