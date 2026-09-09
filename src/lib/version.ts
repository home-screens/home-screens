import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import {
  channelIncludes,
  classifyVersion,
  compareSemver,
  type UpdateChannel,
} from '@/lib/semver';
import { fetchWithTimeout } from '@/lib/api-utils';

export const GITHUB_REPO = 'home-screens/home-screens';

export interface VersionInfo {
  current: string;
  currentCommit: string;
  /** Which channel the running build belongs to, by the shape of its version. */
  currentChannel: UpdateChannel;
  /** The channel the lookup was scoped to. */
  updateChannel: UpdateChannel;
  /** Newest version inside `updateChannel`, or null when nothing resolved. */
  latest: string | null;
  latestCommit: string | null;
  /**
   * True when `latest` is not the version that is running. Inside a channel
   * "newest" is the install target whether it is numerically above or below
   * the current build: a user stepping back from nightly to stable must be
   * offered the lower number.
   */
  updateAvailable: boolean;
  /** `latest` sorts below `current`, so installing it is a step back. */
  isDowngrade: boolean;
  installedVia: 'git' | 'tarball' | 'unknown';
  /** Git branch for git installs, `release` for tarballs, `unknown` otherwise. */
  branch: string;
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

/** One entry in GET /api/system/changelog's `releases` array. Shared with
 * SystemSection's changelog panel so the route's payload branches
 * (channel releases, tags fallback) cannot drift from what the UI renders.
 * `published` is null on the tags fallback, which has no dates. */
export interface ChangelogRelease {
  tag: string;
  name: string;
  body: string;
  published: string | null;
  /** Release page on GitHub, for the "read the rest on GitHub" link. */
  url: string;
}

/** Canonical GitHub page for a tag, used when the API gives us no `html_url`. */
export function releasePageUrl(tag: string): string {
  return `https://github.com/${GITHUB_REPO}/releases/tag/${encodeURIComponent(tag)}`;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url?: string;
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

let cachedPackageVersion: string | null = null;

/**
 * Read version from package.json.
 *
 * Memoized for the process lifetime: the file cannot change under a running
 * server (an upgrade restarts the process), and this is now on the
 * `/api/displays` path, which the editor polls every 5s from several surfaces
 * at once. Without the cache each poll costs a `readFile` + `JSON.parse` on a
 * route deliberately built around a shared 1.5s config cache.
 */
export async function getPackageVersion(): Promise<string> {
  if (cachedPackageVersion !== null) return cachedPackageVersion;
  const pkgPath = path.join(process.cwd(), 'package.json');
  const data = await fs.readFile(pkgPath, 'utf-8');
  const pkg = JSON.parse(data);
  cachedPackageVersion = pkg.version ?? '0.0.0';
  return cachedPackageVersion as string;
}

/** Test seam — drops the memoized version. */
export function __resetPackageVersionCacheForTests(): void {
  cachedPackageVersion = null;
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
// GitHub API: primary version source (works without git)
// ---------------------------------------------------------------------------

const GITHUB_HEADERS: Readonly<Record<string, string>> = {
  Accept: 'application/vnd.github.v3+json',
};

const GITHUB_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * How long a failed refresh may keep serving the last good answer. Past this
 * the failure surfaces so the git fallback gets its turn; an answer older
 * than this is no longer "what was true recently".
 */
const GITHUB_STALE_MAX_MS = 6 * 60 * 60 * 1000;

/** How many releases the list call pages. Nightlies are pruned to well
 * under this, so the newest of every channel stays inside one page. */
export const RELEASE_PAGE_SIZE = 30;

interface CacheEntry<T> {
  value: T;
  etag: string | null;
  fetchedAt: number;
}

/**
 * One GitHub GET with an ETag cache and a single in-flight request.
 *
 * Serves the cache inside the TTL, revalidates with If-None-Match after it,
 * and hands a fresh body to `parse` otherwise. `onMissing` turns a 404 into
 * a value instead of an error, for lookups where "nothing there" is an
 * answer (no stable release cut yet).
 *
 * Concurrent callers share one request: the version route asks for the
 * channel twice per hit (info and tags), and without this each cache miss
 * fired every GitHub call twice and let a failing sibling write its stale
 * copy back over the fresh one.
 *
 * A failed background refresh serves the stale cache for up to
 * `GITHUB_STALE_MAX_MS` rather than throwing: the two lookups behind a
 * channel are merged, and a channel answered by only one of them is a
 * different, wrong answer (see `getChannelReleases`). A forced check never
 * serves stale. The user asked for a live answer, and throwing lets the git
 * fallback offer a tag that GitHub is refusing to list.
 */
class GitHubResource<T> {
  private cache: CacheEntry<T> | null = null;
  private inflight: Promise<T> | null = null;

  constructor(
    private readonly url: string,
    private readonly parse: (body: unknown) => T,
    private readonly onMissing?: () => T,
  ) {}

  get(force: boolean): Promise<T> {
    const cache = this.cache;
    if (!force && cache && Date.now() - cache.fetchedAt < GITHUB_CACHE_TTL_MS) {
      return Promise.resolve(cache.value);
    }
    // The request is shared; the stale policy is not. A forced check that
    // joins a background refresh must still fail when that refresh fails,
    // or it inherits the stale answer it exists to bypass.
    if (!this.inflight) {
      this.inflight = this.refresh().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight.catch((err: unknown) => {
      if (!force && cache && Date.now() - cache.fetchedAt < GITHUB_STALE_MAX_MS) {
        return cache.value;
      }
      throw err;
    });
  }

  /** One live GET. Updates the cache on success and throws on any failure. */
  private async refresh(): Promise<T> {
    const cache = this.cache;
    const headers: Record<string, string> = { ...GITHUB_HEADERS };
    if (cache?.etag) headers['If-None-Match'] = cache.etag;

    // 304 is not a transient status, so the ETag path is unaffected by the
    // retry wrapper.
    const res = await fetchWithTimeout(this.url, { headers });

    if (res.status === 304 && cache) {
      cache.fetchedAt = Date.now();
      return cache.value;
    }
    if (res.status === 404 && this.onMissing) {
      const value = this.onMissing();
      this.cache = { value, etag: null, fetchedAt: Date.now() };
      return value;
    }
    if (!res.ok) {
      throw new Error(`GitHub API returned ${res.status}`);
    }

    const value = this.parse(await res.json());
    this.cache = { value, etag: res.headers.get('etag'), fetchedAt: Date.now() };
    return value;
  }
}

/** The newest page of releases, every channel mixed, drafts dropped. */
const releasePage = new GitHubResource<GitHubRelease[]>(
  `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=${RELEASE_PAGE_SIZE}`,
  (body) => (body as GitHubRelease[]).filter((r) => !r.draft),
);

/**
 * GitHub's own notion of the latest release, which excludes prereleases and
 * anything published with `make_latest: false`. This is how stable resolves:
 * once nightlies publish daily the paged list fills with them and the newest
 * stable falls off the end, and a stable device that only read the page would
 * stop seeing updates without any error.
 */
const latestStable = new GitHubResource<GitHubRelease | null>(
  `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
  (body) => {
    const release = body as GitHubRelease;
    return release.draft ? null : release;
  },
  () => null,
);

/**
 * The newest page of releases, every channel mixed, drafts dropped. Callers
 * scope it with `getChannelReleases`; this is the raw feed.
 */
export function fetchGitHubReleases(options?: { force?: boolean }): Promise<GitHubRelease[]> {
  return releasePage.get(options?.force ?? false);
}

/** The release GitHub calls latest, or null when no stable has shipped. */
export function fetchLatestStableRelease(options?: { force?: boolean }): Promise<GitHubRelease | null> {
  return latestStable.get(options?.force ?? false);
}

export interface ChannelReleaseOptions {
  force?: boolean;
  /**
   * Require the release page even on stable. The version check can answer
   * stable from `releases/latest` alone, but a caller listing history (the
   * changelog) would mistake that single release for the whole list.
   */
  requirePage?: boolean;
}

/**
 * Releases visible from a channel, newest first. Merges the release page
 * with `releases/latest` so the current stable is always present, then keeps
 * only the releases the channel offers (see `channelOffers`).
 *
 * Each source is required where it is the only one that can answer:
 *   - the page is the only source of prereleases, so every prerelease
 *     channel needs it. Answered from `releases/latest` alone, a nightly
 *     user would be offered the stable as a step back while still on the
 *     nightly channel.
 *   - `releases/latest` is the only source guaranteed to hold the newest
 *     stable once nightlies fill the page, so stable needs it. Answered from
 *     the page alone, a device could be offered an older stable as a step
 *     back for doing nothing.
 * Both sources serve their stale cache on a failed background refresh before
 * any of this applies, so the throw is for a cold cache or a forced check.
 */
export async function getChannelReleases(
  channel: UpdateChannel,
  options?: ChannelReleaseOptions,
): Promise<GitHubRelease[]> {
  const { force = false, requirePage = false } = options ?? {};
  const [page, latest] = await Promise.allSettled([
    releasePage.get(force),
    latestStable.get(force),
  ]);
  if (page.status === 'rejected' && (channel !== 'stable' || requirePage)) {
    throw page.reason;
  }
  if (latest.status === 'rejected' && channel === 'stable') {
    throw latest.reason;
  }

  const byTag = new Map<string, GitHubRelease>();
  if (latest.status === 'fulfilled' && latest.value) {
    byTag.set(latest.value.tag_name, latest.value);
  }
  if (page.status === 'fulfilled') {
    for (const r of page.value) byTag.set(r.tag_name, r);
  }

  return [...byTag.values()]
    .filter((r) => channelOffers(channel, r))
    .sort((a, b) => compareSemver(versionOfTag(b.tag_name), versionOfTag(a.tag_name)));
}

/**
 * Whether a channel offers a release. Tag shape decides (`channelIncludes`),
 * with one override: a stable-shaped release that GitHub marks as a
 * pre-release has been withdrawn. Ticking "Set as a pre-release" on a
 * published release is the kill switch for a bad build. It hides the
 * release from every channel within the cache hour, and a device already
 * on it is offered the previous stable as a switch back, all without
 * deleting the release itself.
 */
function channelOffers(channel: UpdateChannel, release: GitHubRelease): boolean {
  const version = versionOfTag(release.tag_name);
  if (release.prerelease && classifyVersion(version) === 'stable') return false;
  return channelIncludes(channel, version);
}

function versionOfTag(tag: string): string {
  return tag.replace(/^v/, '');
}

/** @internal Convert GitHub releases to TagInfo array, sorted by semver descending */
export function releasesToTags(releases: GitHubRelease[]): TagInfo[] {
  const tags: TagInfo[] = releases.map((r) => ({
    tag: r.tag_name,
    version: versionOfTag(r.tag_name),
    commit: '', // GitHub releases don't include commit SHA directly
    hasTarball: r.assets.some((a) => a.name.startsWith('home-screens-') && a.name.endsWith('.tar.gz')),
  }));

  tags.sort((a, b) => compareSemver(b.version, a.version));
  return tags;
}

function releaseHasTarball(release: GitHubRelease, tag: string): boolean {
  return release.assets.some((a) => a.name === `home-screens-${tag}.tar.gz`);
}

/**
 * Check if a specific tag has a pre-built tarball on GitHub Releases. Reads
 * the cached page first; a tag outside it (an older stable behind a run of
 * nightlies, or the stable a nightly user is stepping back to) is looked up
 * directly rather than being declared tarball-less, which would push the
 * upgrade onto the git path and fail every tarball install.
 */
export async function hasReleaseTarball(tag: string): Promise<boolean> {
  try {
    const releases = await fetchGitHubReleases();
    const release = releases.find((r) => r.tag_name === tag);
    if (release) return releaseHasTarball(release, tag);
  } catch {
    // Fall through to the direct lookup.
  }
  try {
    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${encodeURIComponent(tag)}`,
      { headers: { ...GITHUB_HEADERS } },
    );
    if (!res.ok) return false;
    const release: GitHubRelease = await res.json();
    return !release.draft && releaseHasTarball(release, tag);
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

export interface VersionLookupOptions {
  force?: boolean;
  channel?: UpdateChannel;
}

/** Version tags visible from a channel. Prefers the GitHub API, falls back to git. */
export async function getVersionTags(options?: VersionLookupOptions): Promise<TagInfo[]> {
  const { force = false, channel = 'stable' } = options ?? {};

  try {
    const releases = await getChannelReleases(channel, { force });
    if (releases.length > 0) {
      return releasesToTags(releases);
    }
  } catch {
    // GitHub API unavailable, fall through to git
  }

  if (await isGitRepo()) {
    if (force) await fetchRemoteTags(true);
    const tags = await getGitVersionTags();
    return tags.filter((t) => channelIncludes(channel, t.version));
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

/**
 * @internal Assemble a VersionInfo result from channel-scoped tags (newest
 * first) and metadata about the running build.
 */
export function buildVersionInfo(
  tags: TagInfo[],
  current: string,
  commit: string,
  installedVia: 'git' | 'tarball' | 'unknown',
  branch: string,
  channel: UpdateChannel,
): VersionInfo {
  const latest = tags.length > 0 ? tags[0] : null;
  const cmp = latest ? compareSemver(latest.version, current) : 0;

  return {
    current,
    currentCommit: commit,
    currentChannel: classifyVersion(current),
    updateChannel: channel,
    latest: latest?.version ?? null,
    latestCommit: latest?.commit ?? null,
    updateAvailable: latest !== null && cmp !== 0,
    isDowngrade: latest !== null && cmp < 0,
    installedVia,
    branch,
  };
}

/** Get full version info, scoped to a channel */
export async function getVersionInfo(options?: VersionLookupOptions): Promise<VersionInfo> {
  const { force = false, channel = 'stable' } = options ?? {};
  const [current, commit, installedVia] = await Promise.all([
    getPackageVersion(),
    getCurrentCommit(),
    detectInstallMethod(),
  ]);

  // Try GitHub API first
  try {
    const releases = await getChannelReleases(channel, { force });
    if (releases.length > 0) {
      const tags = releasesToTags(releases);
      const branch = installedVia === 'git' ? await getCurrentBranch() : 'release';
      return buildVersionInfo(tags, current, commit, installedVia, branch, channel);
    }
  } catch {
    // GitHub API unavailable, fall through
  }

  // Fallback to git
  if (installedVia === 'git') {
    await fetchRemoteTags();
    const tags = (await getGitVersionTags()).filter((t) => channelIncludes(channel, t.version));
    const branch = await getCurrentBranch();
    return buildVersionInfo(tags, current, commit, installedVia, branch, channel);
  }

  return buildVersionInfo([], current, commit, installedVia, 'unknown', channel);
}
