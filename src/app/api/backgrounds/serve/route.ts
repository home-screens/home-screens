import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { withMediaTokenAuth } from '@/lib/api-utils';
import { parseRangeHeader } from '@/lib/http-range';
import { toWebStream } from '@/lib/web-stream';
import { IMAGE_MIME_BY_EXT, VIDEO_MIME_BY_EXT } from '@/lib/library-files';
import { thumbnailPath, thumbnailWidth, wallCopyPath } from '@/lib/thumbnails';
import { canResizePicture, displaySizeBox } from '@/lib/media-paths';
import { logger } from '@/lib/logger';

const log = logger('backgrounds-serve');

export const dynamic = 'force-dynamic';

const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

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
  const videoType = VIDEO_MIME_BY_EXT[ext];
  if (videoType) {
    return serveVideo(request, filePath, videoType);
  }

  // Images revalidate instead of expiring: a replaced picture must show on
  // the wall at its next paint, not a day later. The tag follows the file's
  // size and mtime (a thumbnail is keyed by the same pair), so an unchanged
  // file costs one conditional request answered with 304 and no body.
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const etag = `W/"${stat.size}-${Math.round(stat.mtimeMs)}"`;
  const cacheHeaders = { 'Cache-Control': 'no-cache', ETag: etag };
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: cacheHeaders });
  }

  // `w=<width>` alone asks for the small WebP copy a picker grid shows;
  // `w` and `h` together ask for a copy that covers a box on the wall (see
  // `displaySizedUrl`). The media viewer passes neither and gets the
  // original, and so does any copy that cannot be made (an undecodable file)
  // or would not be worth it (the original is already about that size).
  const params = request.nextUrl.searchParams;
  if (canResizePicture(filePath)) {
    try {
      let copy: string | null = null;
      if (params.has('h')) {
        const box = displaySizeBox(params.get('w'), params.get('h'));
        if (box) copy = await wallCopyPath(filePath, filename, box);
      } else {
        const width = thumbnailWidth(params.get('w'));
        if (width) copy = await thumbnailPath(filePath, filename, width);
      }
      if (copy) {
        return new NextResponse(await fs.readFile(copy), {
          headers: { 'Content-Type': IMAGE_MIME_BY_EXT[path.extname(copy)] ?? 'image/webp', ...cacheHeaders },
        });
      }
    } catch (err) {
      log.debug(`Resized copy failed for ${filename}, serving the original:`, err);
    }
  }

  try {
    const buffer = await fs.readFile(filePath);
    const contentType = IMAGE_MIME_BY_EXT[ext] || 'application/octet-stream';
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      ...cacheHeaders,
    };
    if (contentType === 'image/svg+xml') {
      // SVG can carry script; serve it so scripts can never run even when
      // opened directly (CSS backgrounds never execute them regardless).
      headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'";
    }
    return new NextResponse(buffer, { headers });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}, 'Failed to serve background', (request) => request.nextUrl.searchParams.get('file'));
