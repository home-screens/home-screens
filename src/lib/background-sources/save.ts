import { promises as fs } from 'fs';
import path from 'path';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { writeLibraryFile } from '@/lib/library-files';
import { MAX_IMPORT_IMAGE_BYTES } from '@/lib/media-formats';

export const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

/**
 * Streams a downloaded picture into the library under its rotation name:
 * capped like an import, never held whole in the hub's memory, and landing
 * under the final name only once complete, so a dropped download or a power
 * cut mid-write never leaves a truncated picture for the wall to serve.
 */
export async function saveRotationFile(filename: string, body: ReadableStream<Uint8Array> | null): Promise<string> {
  await fs.mkdir(BGS, { recursive: true });
  await writeLibraryFile(path.join(BGS, filename), body, MAX_IMPORT_IMAGE_BYTES);
  return `/api/backgrounds/serve?file=${encodeURIComponent(filename)}`;
}

export function extFromContentType(contentType: string): string {
  return contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
}
