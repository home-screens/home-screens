import { promises as fs } from 'fs';
import path from 'path';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { safeLibraryPath } from '@/lib/library-files';
import { IMAGE_FILE_RE } from '@/lib/media-formats';
import type { BackgroundRotation } from '@/types/config';
import type { BackgroundSourceProvider } from './types';

/** Library-relative path a chosen picture's serve URL points at, or null. */
export function localImageFile(servePath: unknown): string | null {
  if (typeof servePath !== 'string') return null;
  try {
    const file = new URL(servePath, 'http://local').searchParams.get('file');
    return file && IMAGE_FILE_RE.test(file) ? file : null;
  } catch {
    return null;
  }
}

/** The library files behind a list of chosen serve URLs that still exist. */
export async function existingChosenFiles(servePaths: string[] | undefined): Promise<string[]> {
  const files = [...new Set((servePaths ?? []).map(localImageFile).filter((f): f is string => !!f))];
  const present: string[] = [];
  for (const file of files) {
    const resolved = safeLibraryPath(file);
    if (!resolved) continue;
    try {
      if ((await fs.stat(resolved)).isFile()) present.push(file);
    } catch {
      // Deleted since it was chosen: skip it.
    }
  }
  return present;
}

async function pickLocalPhoto(rotation: BackgroundRotation): Promise<string | null> {
  if (rotation.localMode === 'images') {
    const present = await existingChosenFiles(rotation.localImages);
    if (present.length === 0) return null;
    const file = present[Math.floor(Math.random() * present.length)];
    return `/api/backgrounds/serve?file=${encodeURIComponent(file)}`;
  }

  const dir = rotation.localFolder ? safeLibraryPath(rotation.localFolder) : path.join(process.cwd(), BACKGROUNDS_DIR);
  if (!dir) return null;

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  const images = entries.filter((e) => e.isFile() && IMAGE_FILE_RE.test(e.name)).map((e) => e.name);
  if (images.length === 0) return null;

  const name = images[Math.floor(Math.random() * images.length)];
  const filePath = rotation.localFolder ? `${rotation.localFolder}/${name}` : name;
  return `/api/backgrounds/serve?file=${encodeURIComponent(filePath)}`;
}

export const localSourceProvider: BackgroundSourceProvider = {
  id: 'local',
  fetchRandom: pickLocalPhoto,
};
