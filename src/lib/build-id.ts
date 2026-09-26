import { promises as fs } from 'fs';
import path from 'path';

let cachedBuildId: string | null = null;

/**
 * The running Next.js build's id, read once per process. A wall that sees it
 * change reloads onto the new build.
 */
export async function readBuildId(): Promise<string> {
  if (!cachedBuildId) {
    try {
      cachedBuildId = (
        await fs.readFile(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf-8')
      ).trim();
    } catch {
      cachedBuildId = 'unknown';
    }
  }
  return cachedBuildId;
}
