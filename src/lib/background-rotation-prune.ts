import { promises as fs } from 'fs';
import path from 'path';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { removeThumbnails } from '@/lib/thumbnails';
import {
  ROTATION_FILE_RE,
  isPickFile,
  referencedPickFiles,
  referencedRotationFiles,
  type BackgroundCache,
} from '@/lib/background-rotation-cache';
import type { ScreenConfiguration } from '@/types/config';

const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

/** Unreferenced rotation files kept as a grace buffer, newest first, so a
 *  display still showing the previous background doesn't lose it mid-swap. */
const PRUNE_KEEP_RECENT = 8;

/** A photo just picked is downloaded before autosave records it; leave it alone until the save has had time to land. */
const PICK_GRACE_MS = 10 * 60 * 1000;

/**
 * Prune rotation files nothing names any more: neither a screen's cached
 * photo nor a hand-picked Unsplash or Immich photo in its settings.
 */
export async function pruneRotationFiles(
  cache: BackgroundCache,
  config: Pick<ScreenConfiguration, 'screens' | 'displays'>,
): Promise<void> {
  const referenced = new Set([...referencedRotationFiles(cache), ...referencedPickFiles(config)]);

  let entries;
  try {
    entries = await fs.readdir(BGS, { withFileTypes: true });
  } catch {
    return;
  }

  const now = Date.now();
  const candidates: Array<{ name: string; mtimeMs: number }> = [];
  const unchosenPicks: string[] = [];
  for (const dirent of entries) {
    if (!dirent.isFile() || !ROTATION_FILE_RE.test(dirent.name) || referenced.has(dirent.name)) continue;
    try {
      const { mtimeMs } = await fs.stat(path.join(BGS, dirent.name));
      if (isPickFile(dirent.name)) {
        // No wall needs a photo the user unchose, so there is no swap buffer for these.
        if (now - mtimeMs >= PICK_GRACE_MS) unchosenPicks.push(dirent.name);
      } else {
        candidates.push({ name: dirent.name, mtimeMs });
      }
    } catch { /* raced deletion */ }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const doomed = [...candidates.slice(PRUNE_KEEP_RECENT).map((candidate) => candidate.name), ...unchosenPicks];
  for (const name of doomed) {
    await fs.unlink(path.join(BGS, name)).catch(() => { /* best effort */ });
    // The wall asked for a copy sized to its screen; it goes with the file.
    await removeThumbnails(name);
  }
}
