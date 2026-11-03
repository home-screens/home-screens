import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { sanitizeFolderName } from '@/lib/library-folder-name';
import { libraryMediaKind } from '@/lib/library-files';
import { LibraryMoveError, MAX_FOLDER_DEPTH, renameLibraryFolder } from '@/lib/library-moves';

export const dynamic = 'force-dynamic';

const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

/** Validate and resolve a relative path within BGS, preventing directory traversal */
function safePath(relativePath: string): string | null {
  const resolved = path.resolve(BGS, relativePath);
  if (!resolved.startsWith(BGS + path.sep) && resolved !== BGS) return null;
  return resolved;
}

/**
 * Count the pictures the library lists directly inside one folder (`folder`
 * is its library path, '' for the top level), so the number matches the grid:
 * the background rotation's own downloads are not counted.
 */
async function countImages(dirPath: string, folder: string): Promise<number> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && libraryMediaKind(folder ? `${folder}/${e.name}` : e.name) === 'image').length;
  } catch {
    return 0;
  }
}

/** Recursively scan for directories up to maxDepth */
async function scanDirectories(
  basePath: string,
  relativeTo: string,
  depth: number,
  maxDepth: number,
): Promise<{ name: string; path: string; imageCount: number }[]> {
  const results: { name: string; path: string; imageCount: number }[] = [];

  if (depth > maxDepth) return results;

  let entries: string[];
  try {
    entries = await fs.readdir(basePath);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(basePath, entry);
    let stat;
    try {
      stat = await fs.stat(fullPath);
    } catch {
      continue;
    }

    if (!stat.isDirectory()) continue;

    const relPath = path.relative(relativeTo, fullPath);
    const imageCount = await countImages(fullPath, relPath);

    results.push({
      name: entry,
      path: relPath,
      imageCount,
    });

    if (depth < maxDepth) {
      const subDirs = await scanDirectories(fullPath, relativeTo, depth + 1, maxDepth);
      results.push(...subDirs);
    }
  }

  return results;
}

export const GET = withAuth(async () => {
  await fs.mkdir(BGS, { recursive: true });

  // Count images in root
  const rootImageCount = await countImages(BGS, '');

  // Scan subdirectories (max depth 2)
  const subdirs = await scanDirectories(BGS, BGS, 1, 2);

  const directories = [
    { name: 'All Photos', path: '', imageCount: rootImageCount },
    ...subdirs,
  ];

  return NextResponse.json({ directories });
}, 'Failed to list directories');

export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ name?: unknown; parent?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const { name, parent } = body;

  if (!name || typeof name !== 'string') throw new LibraryMoveError(400, 'library.badName', 'name is required');

  const safeName = sanitizeFolderName(name);

  if (!safeName) throw new LibraryMoveError(400, 'library.badName', 'Invalid directory name');

  // Resolve parent directory
  let parentDir: string;
  if (parent && typeof parent === 'string') {
    const resolved = safePath(parent);
    if (!resolved) throw new LibraryMoveError(400, 'library.badFolder', 'Invalid parent directory');
    parentDir = resolved;
  } else {
    parentDir = BGS;
  }

  const newDirPath = path.join(parentDir, safeName);
  const resolvedNew = safePath(path.relative(BGS, newDirPath));
  if (!resolvedNew) throw new LibraryMoveError(400, 'library.badFolder', 'Invalid directory path');

  // Enforce the same depth cap as the listing API and a rename.
  const relativeNew = path.relative(BGS, resolvedNew);
  const depth = relativeNew.split(path.sep).length;
  if (depth > MAX_FOLDER_DEPTH) {
    throw new LibraryMoveError(400, 'library.tooDeep', `Maximum folder depth is ${MAX_FOLDER_DEPTH}`, { max: MAX_FOLDER_DEPTH });
  }

  // A folder that is already there is not "created": say so, so the phone
  // does not announce a new folder that is the old one.
  const taken = await fs.stat(resolvedNew).then(() => true, () => false);
  if (taken) throw new LibraryMoveError(409, 'library.folderExists', "There's already a folder with that name here.", { name: safeName });

  await fs.mkdir(resolvedNew, { recursive: true });

  const relativePath = path.relative(BGS, resolvedNew);
  return NextResponse.json({ path: relativePath }, { status: 201 });
}, 'Failed to create directory');

/** `.DS_Store`, `._IMG_1.jpg`, `Thumbs.db`, `desktop.ini`: files the operating system adds, never the family's. */
function isSystemClutter(name: string): boolean {
  return name.startsWith('.') || /^(thumbs\.db|desktop\.ini)$/i.test(name);
}

export const DELETE = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ path?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const { path: dirPath } = body;

  if (!dirPath || typeof dirPath !== 'string') throw new LibraryMoveError(400, 'library.badFolder', 'path is required');

  // Prevent deleting root
  if (dirPath === '' || dirPath === '/' || dirPath === '.') {
    throw new LibraryMoveError(400, 'library.badFolder', 'Cannot delete root directory');
  }

  const resolved = safePath(dirPath);
  if (!resolved) throw new LibraryMoveError(400, 'library.badFolder', 'Invalid directory path');

  // Verify directory exists
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new LibraryMoveError(404, 'library.folderGone', 'Directory not found');
  }

  if (!stat.isDirectory()) throw new LibraryMoveError(400, 'library.folderGone', 'Path is not a directory');

  // Refuse if directory contains files. The clutter a Mac or Windows PC leaves
  // in a folder it has opened is not something anyone can see or move from
  // here, so a folder holding only that counts as empty and takes it along.
  const entries = await fs.readdir(resolved);
  const leftovers = entries.filter(isSystemClutter);
  if (entries.length > leftovers.length) {
    throw new LibraryMoveError(409, 'library.folderNotEmpty', 'Directory is not empty. Delete all photos first.');
  }

  for (const name of leftovers) await fs.rm(path.join(resolved, name), { force: true });
  await fs.rmdir(resolved);
  return NextResponse.json({ deleted: dirPath });
}, 'Failed to delete directory');

/**
 * PATCH /api/backgrounds/directories  { path, name }
 *
 * Renames a folder in place (the parent stays) and rewrites every config
 * reference to a file inside it, and every slideshow showing it, so nothing
 * on the wall goes blank.
 */
export const PATCH = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ path?: unknown; name?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const { path: dirPath, name } = body;
  if (!dirPath || typeof dirPath !== 'string') throw new LibraryMoveError(400, 'library.badFolder', 'path is required');
  if (!name || typeof name !== 'string') throw new LibraryMoveError(400, 'library.badName', 'name is required');
  return NextResponse.json(await renameLibraryFolder(dirPath, name));
}, 'Failed to rename directory');
