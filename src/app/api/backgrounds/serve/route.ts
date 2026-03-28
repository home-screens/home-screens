import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};

/** Validate and resolve a relative path within BGS, preventing directory traversal */
function safePath(relativePath: string): string | null {
  const resolved = path.resolve(BGS, relativePath);
  if (!resolved.startsWith(BGS + path.sep) && resolved !== BGS) return null;
  return resolved;
}

/**
 * GET /api/backgrounds/serve?file=unsplash-xyz.jpg
 * GET /api/backgrounds/serve?file=themes/christmas/photo.jpg
 *
 * Serves background images directly from the filesystem, bypassing
 * Next.js static file caching (which doesn't pick up files added at runtime).
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const filename = request.nextUrl.searchParams.get('file');
  if (!filename) {
    return NextResponse.json({ error: 'file parameter required' }, { status: 400 });
  }

  // Prevent directory traversal
  const filePath = safePath(filename);
  if (!filePath) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}, 'Failed to serve background');
