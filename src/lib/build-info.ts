import { promises as fs } from 'fs';
import path from 'path';
import type { UpdateChannel } from '@/lib/semver';

/**
 * Provenance the tarball workflow writes next to package.json. The version
 * string itself stays tag-shaped (no `+sha` build metadata) because the
 * upgrade script derives asset URLs from it, so the commit lives here.
 */
export interface BuildInfo {
  tag: string;
  version: string;
  channel: UpdateChannel;
  sha: string;
  builtAt: string;
}

/** Reads `build-info.json` from the app root; null on git checkouts and older tarballs. */
export async function readBuildInfo(): Promise<BuildInfo | null> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'build-info.json'), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<BuildInfo>;
    if (typeof parsed.sha !== 'string' || typeof parsed.builtAt !== 'string') return null;
    return {
      tag: typeof parsed.tag === 'string' ? parsed.tag : '',
      version: typeof parsed.version === 'string' ? parsed.version : '',
      channel: parsed.channel === 'rc' || parsed.channel === 'beta' || parsed.channel === 'nightly' ? parsed.channel : 'stable',
      sha: parsed.sha,
      builtAt: parsed.builtAt,
    };
  } catch {
    return null;
  }
}
