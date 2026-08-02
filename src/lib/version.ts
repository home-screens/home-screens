import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { getSecret } from './secrets';
import { compareSemver, isPrerelease } from '@/lib/semver';
import { fetchWithTimeout } from '@/lib/api-utils';

export const GITHUB_REPO = 'home-screens/home-screens';

export interface VersionInfo {
  current: string;
  currentCommit: string;
  latest: string | null;
  latestCommit: string | null;
  updateAvailable: boolean;
  installedVia: 'git' | 'tarball' | 'unknown';
  channel: string;
}

export interface TagInfo {
  tag: string;
  version: string;
  commit: string;
  hasTarball?: boolean;
}

/** Wire shape of GET /api/system/version — VersionInfo plus the fields the
 * route layers on top. Shared with the settings UI and the update toast. */
export interface VersionResponse extends VersionInfo {
  tags: TagInfo[];
  upgradeRunning: boolean;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  assets: { name: string; browser_download_url: string }[];
}

function exec(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: cwd ?? process.cwd(), timeout: 30000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

/** Read version from package.json */
export async function getPackageVersion(): Promise<string> {
  const pkgPath = path.join(process.cwd(), 'package.json');
  const data = await fs.readFile(pkgPath, 'utf-8');
  const pkg = JSON.parse(data);
  return pkg.version ?? '0.0.0';
}

/** Check if running in a git repository */
async function isGitRepo(): Promise<boolean> {
  try {
    await exec('git', ['rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

/** Get current commit SHA (short) */
async function getCurrentCommit(): Promise<string> {
  try {
    return await exec('git', ['rev-parse', '--short', 'HEAD']);
  } catch {
    return 'unknown';
  }
}

/** Get the current branch or tag */
async function getCurrentBranch(): Promise<string> {
  try {
    return await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// GitHub API — primary version source (works without git)
// ---------------------------------------------------------------------------

let cachedGitHubReleases: {
  releases: GitHubRelease[];
  etag: string | null;
  fetchedAt: number;
} | null = null;

const GITHUB_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getGitHubHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  try {
    const token = await getSecret('github_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // secrets module not available
  }
  return headers;
}

/** Fetch releases from GitHub API with ETag caching.
 *  By default only stable releases are returned. Pass includePrerelease
 *  to also return releases marked as pre-release on GitHub. */
export async function fetchGitHubReleases(options?: {
  force?: boolean;
  includePrerelease?: boolean;
}): Promise<GitHubRelease[]> {
  const { force = false, includePrerelease = false } = options ?? {};

  if (
    !force &&
    cachedGitHubReleases &&
    Date.now() - cachedGitHubReleases.fetchedAt < GITHUB_CACHE_TTL_MS
  ) {
    const cached = cachedGitHubReleases.releases;
    return includePrerelease ? cached : cached.filter((r) => !r.prerelease);
  }

  const headers = await getGitHubHeaders();
  if (cachedGitHubReleases?.etag) {
    headers['If-None-Match'] = cachedGitHubReleases.etag;
  }

  // 304 is not a transient status, so the ETag path below is unaffected by
  // the retry wrapper.
  const res = await fetchWithTimeout(
    `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`,
    { headers },
  );

  if (res.status === 304 && cachedGitHubReleases) {
    cachedGitHubReleases.fetchedAt = Date.now();
    const cached = cachedGitHubReleases.releases;
    return includePrerelease ? cached : cached.filter((r) => !r.prerelease);
  }

  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status}`);
  }

  const releases: GitHubRelease[] = await res.json();
  const etag = res.headers.get('etag');
  const nonDraft = releases.filter((r) => !r.draft);

  cachedGitHubReleases = { releases: nonDraft, etag, fetchedAt: Date.now() };
  return includePrerelease ? nonDraft : nonDraft.filter((r) => !r.prerelease);
}

/** @internal Convert GitHub releases to TagInfo array, sorted by semver descending */
export function releasesToTags(releases: GitHubRelease[]): TagInfo[] {
  const tags: TagInfo[] = releases.map((r) => ({
    tag: r.tag_name,
    version: r.tag_name.replace(/^v/, ''),
    commit: '', // GitHub releases don't include commit SHA directly
    hasTarball: r.assets.some((a) => a.name.startsWith('home-screens-') && a.name.endsWith('.tar.gz')),
  }));

  tags.sort((a, b) => compareSemver(b.version, a.version));
  return tags;
}

/** Check if a specific tag has a pre-built tarball on GitHub Releases */
export async function hasReleaseTarball(tag: string): Promise<boolean> {
  try {
    const releases = await fetchGitHubReleases({ includePrerelease: true });
    const release = releases.find((r) => r.tag_name === tag);
    if (!release) return false;
    return release.assets.some(
      (a) => a.name === `home-screens-${tag}.tar.gz`,
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Git-based version checking (fallback)
// ---------------------------------------------------------------------------

/** @internal Parse version tags from git, sorted descending */
export function parseVersionTags(tagLines: string): TagInfo[] {
  const tags: TagInfo[] = [];
  for (const line of tagLines.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip dereferenced annotated tag entries (e.g., refs/tags/v1.0.0^{})
    if (trimmed.endsWith('^{}')) continue;
    // Format: <commit> refs/tags/v1.2.3
    const match = trimmed.match(/^([a-f0-9]+)\s+refs\/tags\/(v?\d+\.\d+\.\d+.*)$/);
    if (match) {
      const version = match[2].replace(/^v/, '');
      tags.push({ tag: match[2], version, commit: match[1] });
    }
  }
  // Sort by semver descending
  tags.sort((a, b) => compareSemver(b.version, a.version));
  return tags;
}

/** Fetch tags from remote (rate-limited to once per interval) */
let lastFetchTime = 0;
const FETCH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function fetchRemoteTags(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastFetchTime < FETCH_INTERVAL_MS) return;
  try {
    await exec('git', ['fetch', '--tags', '--force', 'origin']);
    lastFetchTime = now;
  } catch {
    // Network may not be available
  }
}

/** Get all version tags (local git) */
async function getGitVersionTags(): Promise<TagInfo[]> {
  try {
    const output = await exec('git', ['show-ref', '--tags']);
    return parseVersionTags(output);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Unified API — tries GitHub first, falls back to git
// ---------------------------------------------------------------------------

/** Get version tags — prefers GitHub API, falls back to git */
export async function getVersionTags(options?: {
  force?: boolean;
  includePrerelease?: boolean;
}): Promise<TagInfo[]> {
  const { force = false, includePrerelease = false } = options ?? {};

  try {
    const releases = await fetchGitHubReleases({ force, includePrerelease });
    if (releases.length > 0) {
      return releasesToTags(releases);
    }
  } catch {
    // GitHub API unavailable, fall through to git
  }

  if (await isGitRepo()) {
    if (force) await fetchRemoteTags(true);
    const tags = await getGitVersionTags();
    return includePrerelease ? tags : tags.filter((t) => !isPrerelease(t.version));
  }

  return [];
}

/** Detect how the app was installed */
async function detectInstallMethod(): Promise<'git' | 'tarball' | 'unknown'> {
  if (await isGitRepo()) return 'git';
  const cwd = process.cwd();
  // Tarball installs have server.js at root but no .git
  try {
    await fs.access(path.join(cwd, 'server.js'));
    return 'tarball';
  } catch {
    // Fallback: a built Next.js app always has a .next directory, even if
    // server.js is missing (e.g. RC tarballs built with a slightly different
    // standalone layout, or image-creation scripts that restructure the tree).
    try {
      await fs.access(path.join(cwd, '.next'));
      return 'tarball';
    } catch {
      return 'unknown';
    }
  }
}

/** @internal Assemble a VersionInfo result from resolved tags and metadata */
export function buildVersionInfo(
  tags: TagInfo[],
  current: string,
  commit: string,
  installedVia: 'git' | 'tarball' | 'unknown',
  branch: string,
): VersionInfo {
  const latest = tags.length > 0 ? tags[0] : null;
  const updateAvailable = latest !== null && compareSemver(latest.version, current) > 0;

  return {
    current,
    currentCommit: commit,
    latest: latest?.version ?? null,
    latestCommit: latest?.commit ?? null,
    updateAvailable,
    installedVia,
    channel: branch,
  };
}

/** Get full version info */
export async function getVersionInfo(options?: {
  force?: boolean;
  includePrerelease?: boolean;
}): Promise<VersionInfo> {
  const { force = false, includePrerelease = false } = options ?? {};
  const [current, commit, installedVia] = await Promise.all([
    getPackageVersion(),
    getCurrentCommit(),
    detectInstallMethod(),
  ]);

  // Try GitHub API first
  try {
    const releases = await fetchGitHubReleases({ force, includePrerelease });
    if (releases.length > 0) {
      const tags = releasesToTags(releases);
      const branch = installedVia === 'git' ? await getCurrentBranch() : 'release';
      return buildVersionInfo(tags, current, commit, installedVia, branch);
    }
  } catch {
    // GitHub API unavailable, fall through
  }

  // Fallback to git
  if (installedVia === 'git') {
    await fetchRemoteTags();
    let tags = await getGitVersionTags();
    if (!includePrerelease) {
      tags = tags.filter((t) => !isPrerelease(t.version));
    }
    const branch = await getCurrentBranch();
    return buildVersionInfo(tags, current, commit, installedVia, branch);
  }

  return buildVersionInfo([], current, commit, installedVia, 'unknown');
}
