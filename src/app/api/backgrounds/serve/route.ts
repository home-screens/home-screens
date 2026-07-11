import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { withMediaTokenAuth } from '@/lib/api-utils';
import { parseRangeHeader } from '@/lib/http-range';
import { toWebStream } from '@/lib/web-stream';

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

const VIDEO_MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

/** Validate and resolve a relative path within BGS, preventing directory traversal */
function safePath(relativePath: string): string | null {
  const resolved = path.resolve(BGS, relativePath);
  if (!resolved.startsWith(BGS + path.sep) && resolved !== BGS) return null;
  return resolved;
}

/**
 * Streams a video file with HTTP Range support (206 partial content), so the
 * <video> element can seek and the hub never buffers a whole clip in memory.
 */
async function serveVideo(request: NextRequest, filePath: string, contentType: string): Promise<Response> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const range = parseRangeHeader(request.headers.get('range'), stat.size);
  if (range === 'unsatisfiable') {
    return new NextResponse(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${stat.size}` },
    });
  }

  const baseHeaders = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
  };

  if (!range) {
    const stream = toWebStream(createReadStream(filePath));
    return new Response(stream, {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': String(stat.size) },
    });
  }

  const stream = toWebStream(
    createReadStream(filePath, { start: range.start, end: range.end }),
  );
  return new Response(stream, {
    status: 206,
    headers: {
      ...baseHeaders,
      'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
      'Content-Length': String(range.end - range.start + 1),
    },
  });
}

/**
 * GET /api/backgrounds/serve?file=unsplash-xyz.jpg
 * GET /api/backgrounds/serve?file=themes/christmas/clip.mp4&mt=<token>
 *
 * Serves background media directly from the filesystem, bypassing
 * Next.js static file caching (which doesn't pick up files added at runtime).
 * Images are buffered (small, cached client-side); videos stream with Range
 * support. The `mt` media token exists because a bare <video src> cannot send
 * the display Bearer header — see lib/media-token.ts.
 */
export const GET = withMediaTokenAuth(async (request: NextRequest) => {
  const filename = request.nextUrl.searchParams.get('file');
  if (!filename) {
    return NextResponse.json({ error: 'file parameter required' }, { status: 400 });
  }

  // Prevent directory traversal
  const filePath = safePath(filename);
  if (!filePath) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const videoType = VIDEO_MIME_TYPES[ext];
  if (videoType) {
    return serveVideo(request, filePath, videoType);
  }

  try {
    const buffer = await fs.readFile(filePath);
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
}, 'Failed to serve background', (request) => request.nextUrl.searchParams.get('file'));
