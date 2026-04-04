import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif)$/i;

/** Validate and resolve a relative path within BGS, preventing directory traversal */
function safePath(relativePath: string): string | null {
  const resolved = path.resolve(BGS, relativePath);
  if (!resolved.startsWith(BGS + path.sep) && resolved !== BGS) return null;
  return resolved;
}

/** Count image files in a directory (non-recursive) */
async function countImages(dirPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && IMAGE_RE.test(e.name)).length;
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
    const imageCount = await countImages(fullPath);

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
  const rootImageCount = await countImages(BGS);

  // Scan subdirectories (max depth 2)
  const subdirs = await scanDirectories(BGS, BGS, 1, 2);

  const directories = [
    { name: 'All Photos', path: '', imageCount: rootImageCount },
    ...subdirs,
  ];

  return NextResponse.json({ directories });
}, 'Failed to list directories');

export const POST = withAuth(async (request: NextRequest) => {
  const { name, parent } = await request.json();

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  // Sanitize directory name
  const safeName = name
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^\.+/, '')           // strip leading dots (blocks "." and "..")
    .slice(0, 50);

  if (!safeName) {
    return NextResponse.json({ error: 'Invalid directory name' }, { status: 400 });
  }

  // Resolve parent directory
  let parentDir: string;
  if (parent && typeof parent === 'string') {
    const resolved = safePath(parent);
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid parent directory' }, { status: 400 });
    }
    parentDir = resolved;
  } else {
    parentDir = BGS;
  }

  const newDirPath = path.join(parentDir, safeName);
  const resolvedNew = safePath(path.relative(BGS, newDirPath));
  if (!resolvedNew) {
    return NextResponse.json({ error: 'Invalid directory path' }, { status: 400 });
  }

  // Enforce max depth of 2 to match the listing API
  const relativeNew = path.relative(BGS, resolvedNew);
  const depth = relativeNew.split(path.sep).length;
  if (depth > 2) {
    return NextResponse.json({ error: 'Maximum folder depth is 2' }, { status: 400 });
  }

  await fs.mkdir(resolvedNew, { recursive: true });

  const relativePath = path.relative(BGS, resolvedNew);
  return NextResponse.json({ path: relativePath }, { status: 201 });
}, 'Failed to create directory');

export const DELETE = withAuth(async (request: NextRequest) => {
  const { path: dirPath } = await request.json();

  if (!dirPath || typeof dirPath !== 'string') {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  // Prevent deleting root
  if (dirPath === '' || dirPath === '/' || dirPath === '.') {
    return NextResponse.json({ error: 'Cannot delete root directory' }, { status: 400 });
  }

  const resolved = safePath(dirPath);
  if (!resolved) {
    return NextResponse.json({ error: 'Invalid directory path' }, { status: 400 });
  }

  // Verify directory exists
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    return NextResponse.json({ error: 'Directory not found' }, { status: 404 });
  }

  if (!stat.isDirectory()) {
    return NextResponse.json({ error: 'Path is not a directory' }, { status: 400 });
  }

  // Refuse if directory contains files
  const entries = await fs.readdir(resolved);
  if (entries.length > 0) {
    return NextResponse.json(
      { error: 'Directory is not empty. Delete all photos first.' },
      { status: 409 },
    );
  }

  await fs.rmdir(resolved);
  return NextResponse.json({ deleted: dirPath });
}, 'Failed to delete directory');
