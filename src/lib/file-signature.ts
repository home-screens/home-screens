import { promises as fs } from 'fs';
import path from 'path';
import { getDataRoot } from './data-transaction';
import { statSignature } from './stat-signature';

/**
 * A data file's identity without reading it: inode, size and mtime. Every
 * store write lands through a rename, so each write is a new signature,
 * which is what lets a revision be worked out from a `stat` instead of a
 * read and a hash of the answer. `missing` for a file not yet created.
 */
export async function fileSignature(relative: string): Promise<string> {
  try {
    return statSignature(await fs.stat(path.join(getDataRoot(), relative)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw error;
  }
}
