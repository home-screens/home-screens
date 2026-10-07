import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export type ChangelogSection = 'New' | 'Improved' | 'Fixed';

export interface ChangelogEntry {
  version: string;
  tag: string;
  date: string | null;
  sections: Partial<Record<ChangelogSection, string[]>>;
}

const STABLE_FILENAME = /^v(\d+)\.(\d+)\.(\d+)\.md$/;
const RELEASE_NOTES_DIR = path.join(process.cwd(), '..', 'RELEASE_NOTES');

// When getChangelog().length exceeds this, /changelog renders only the newest
// RECENT_ENTRY_LIMIT entries and the conditional "Older releases" link in the
// timeline becomes visible. That's the trigger to create
// website/src/app/(marketing)/changelog/archive/page.tsx rendering the rest.
export const RECENT_ENTRY_LIMIT = 10;

function parseSections(
  content: string,
): Partial<Record<ChangelogSection, string[]>> {
  const result: Partial<Record<ChangelogSection, string[]>> = {};
  let current: ChangelogSection | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd();
    const header = line.match(/^##\s+(New|Improved|Fixed)\s*$/);
    if (header) {
      current = header[1] as ChangelogSection;
      result[current] = [];
      continue;
    }
    if (current && line.startsWith('- ')) {
      result[current]!.push(line.slice(2).trim());
    }
  }

  return result;
}

function getTagDate(tag: string): string | null {
  try {
    const stdout = execSync(`git log -1 --format=%aI ${tag}`, {
      cwd: RELEASE_NOTES_DIR,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const iso = stdout.trim();
    return iso ? iso.slice(0, 10) : null;
  } catch {
    return null;
  }
}

function compareVersions(a: string, b: string): number {
  const [aMaj, aMin, aPatch] = a.split('.').map(Number);
  const [bMaj, bMin, bPatch] = b.split('.').map(Number);
  return bMaj - aMaj || bMin - aMin || bPatch - aPatch;
}

export function getChangelog(): ChangelogEntry[] {
  const files = fs.readdirSync(RELEASE_NOTES_DIR);
  const entries: ChangelogEntry[] = [];

  for (const file of files) {
    const match = file.match(STABLE_FILENAME);
    if (!match) continue;
    const version = `${match[1]}.${match[2]}.${match[3]}`;
    const tag = `v${version}`;
    const fullPath = path.join(RELEASE_NOTES_DIR, file);
    // release.sh stamps update-check markers as HTML comments at the top of
    // each notes file; they are metadata, not notes.
    const content = fs.readFileSync(fullPath, 'utf8').replace(/<!--[\s\S]*?-->[ \t]*\n?/g, '');
    const sections = parseSections(content);
    const tagDate = getTagDate(tag);
    const date =
      tagDate ?? fs.statSync(fullPath).mtime.toISOString().slice(0, 10);
    entries.push({ version, tag, date, sections });
  }

  entries.sort((a, b) => compareVersions(a.version, b.version));
  return entries;
}

/**
 * The newest stable release with notes on the site, as a `v1.2.3` tag. Rendered
 * into the version badges at build time; the site used to fetch this from a
 * worker on every page load for a string the build already had.
 */
export function getLatestStableVersion(): string {
  const [latest] = getChangelog();
  return latest ? latest.tag : 'v0.0.0';
}

export interface LatestImageRelease {
  tag: string;
  version: string;
  imageUrl: string;
  releaseUrl: string;
}

const RELEASE_BY_TAG_API =
  'https://api.github.com/repos/home-screens/home-screens/releases/tags';

// The asset names on a tag's GitHub release: [] when the tag has notes here but
// no published release, null when GitHub could not answer.
async function fetchReleaseAssetNames(tag: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${RELEASE_BY_TAG_API}/${tag}`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const release = (await res.json()) as { assets: { name: string }[] };
    return release.assets.map((asset) => asset.name);
  } catch (error) {
    console.warn(
      `Could not look up the ${tag} release on GitHub (${error}); the image download link falls back to the releases page.`,
    );
    return null;
  }
}

// Not every release ships an SD card image, and an image is attached only after
// it passes on real hardware, sometimes days after its release. So the build
// asks GitHub instead of keeping a list: the newest release with notes here and
// a `home-screens-<tag>.img.xz` attached, usually the first one asked about.
// Null when there is none or GitHub could not be reached.
async function findLatestImageRelease(): Promise<LatestImageRelease | null> {
  for (const { tag, version } of getChangelog()) {
    const assets = await fetchReleaseAssetNames(tag);
    if (assets === null) return null;
    const asset = `home-screens-${tag}.img.xz`;
    if (!assets.includes(asset)) continue;
    return {
      tag,
      version,
      imageUrl: `https://github.com/home-screens/home-screens/releases/download/${tag}/${asset}`,
      releaseUrl: `https://github.com/home-screens/home-screens/releases/tag/${tag}`,
    };
  }
  return null;
}

let latestImageRelease: Promise<LatestImageRelease | null> | undefined;

// One lookup per build or dev server, however many pages render the link.
export function getLatestImageRelease(): Promise<LatestImageRelease | null> {
  latestImageRelease ??= findLatestImageRelease();
  return latestImageRelease;
}
