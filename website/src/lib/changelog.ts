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
    const content = fs.readFileSync(fullPath, 'utf8');
    const sections = parseSections(content);
    const tagDate = getTagDate(tag);
    const date =
      tagDate ?? fs.statSync(fullPath).mtime.toISOString().slice(0, 10);
    entries.push({ version, tag, date, sections });
  }

  entries.sort((a, b) => compareVersions(a.version, b.version));
  return entries;
}

export interface LatestImageRelease {
  tag: string;
  version: string;
  imageUrl: string;
  releaseUrl: string;
}

// Pre-built SD card images ship only for major/minor releases (patch === 0).
// Returns null when no qualifying release exists yet.
export function getLatestImageRelease(): LatestImageRelease | null {
  const latest = getChangelog().find((entry) => entry.version.endsWith('.0'));
  if (!latest) return null;
  const asset = `home-screens-${latest.tag}.img.xz`;
  return {
    tag: latest.tag,
    version: latest.version,
    imageUrl: `https://github.com/home-screens/home-screens/releases/download/${latest.tag}/${asset}`,
    releaseUrl: `https://github.com/home-screens/home-screens/releases/tag/${latest.tag}`,
  };
}
