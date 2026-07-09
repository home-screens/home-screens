import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { withAuth, withDisplayAuth, parseJsonBody } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

/** Validate and resolve a relative path within BGS, preventing directory traversal */
function safePath(relativePath: string): string | null {
  const resolved = path.resolve(BGS, relativePath);
  if (!resolved.startsWith(BGS + path.sep) && resolved !== BGS) return null;
  return resolved;
}

/** Helper: resolve a background filename to its serve URL */
function serveUrl(filename: string, directory?: string) {
  const filePath = directory ? `${directory}/${filename}` : filename;
  return `/api/backgrounds/serve?file=${encodeURIComponent(filePath)}`;
}

export const GET = withDisplayAuth(async (request: NextRequest) => {
  const directory = request.nextUrl.searchParams.get('directory') || '';

  let dir: string;
  if (directory) {
    const resolved = safePath(directory);
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid directory' }, { status: 400 });
    }
    dir = resolved;
  } else {
    dir = BGS;
  }

  // Only auto-create the root directory; subdirectories must already exist
  if (!directory) {
    await fs.mkdir(dir, { recursive: true });
  } else {
    try {
      await fs.access(dir);
    } catch {
      return NextResponse.json([], { status: 200 });
    }
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const images = entries
    .filter((e) => e.isFile() && /\.(jpe?g|png|webp|gif|avif)$/i.test(e.name))
    .map((e) => e.name);
  const paths = images.map((name) => serveUrl(name, directory || undefined));
  return NextResponse.json(paths);
}, 'Failed to list backgrounds');

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB per file
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

export const POST = withAuth(async (request: NextRequest) => {
  // Reject oversized uploads before parsing: a genuinely oversized multipart
  // body makes request.formData() throw (surfacing as a 500), so the per-file
  // 413 below never runs for them. Capping the whole body at MAX_SIZE keeps
  // "max 10 MB" truthful; the few hundred bytes of multipart overhead only
  // shave a byte-exact 10 MB file, which the friendly message still covers.
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 });
  }

  const formData = await request.formData();
  const directory = (formData.get('directory') as string) || '';

  let dir: string;
  if (directory) {
    const resolved = safePath(directory);
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid directory' }, { status: 400 });
    }
    dir = resolved;
  } else {
    dir = BGS;
  }

  const files = formData.getAll('file') as File[];

  if (files.length === 0 || !files[0]?.name) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Validate all files first
  for (const file of files) {
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: `File too large: ${file.name} (max 10 MB)` }, { status: 413 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Invalid file type: ${file.name}` }, { status: 400 });
    }
  }

  await fs.mkdir(dir, { recursive: true });

  const uploadedPaths: string[] = [];

  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(dir, safeName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    uploadedPaths.push(serveUrl(safeName, directory || undefined));
  }

  if (files.length === 1) {
    return NextResponse.json({ path: uploadedPaths[0] }, { status: 201 });
  }

  return NextResponse.json({ paths: uploadedPaths }, { status: 201 });
}, 'Failed to upload background');

export const DELETE = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ file?: unknown; directory?: string }>(request);
  if (body instanceof NextResponse) return body;
  const { file, directory } = body;
  if (!file || typeof file !== 'string') {
    return NextResponse.json({ error: 'file parameter required' }, { status: 400 });
  }

  // Resolve file within optional directory
  const relativePath = directory ? `${directory}/${path.basename(file)}` : path.basename(file);
  const filePath = safePath(relativePath);
  if (!filePath) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    await fs.access(filePath);
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  await fs.unlink(filePath);
  return NextResponse.json({ deleted: path.basename(file) });
}, 'Failed to delete background');
