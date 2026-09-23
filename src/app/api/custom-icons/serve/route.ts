import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import sharp from 'sharp';
import { withMediaTokenAuth } from '@/lib/api-utils';
import { customIconFilePath } from '@/lib/custom-icon-data';
import { CUSTOM_ICON_TOKEN_RESOURCE } from '@/lib/custom-icon-http';

export const dynamic = 'force-dynamic';

/**
 * One icon picture by content hash. The wall's `<img>` cannot send the
 * display's bearer header, so the catalog's URLs carry a media token bound
 * to the whole library. A hash names exactly one set of bytes, so the
 * browser may keep the answer for good.
 */
export const GET = withMediaTokenAuth(async (request: NextRequest) => {
  const file = customIconFilePath(request.nextUrl.searchParams.get('h') ?? '');
  if (!file) return NextResponse.json({ error: 'Invalid icon' }, { status: 400 });
  let data: Buffer;
  try {
    data = await fs.readFile(file);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  // `still=1`: the first frame of a moving picture, for a device that asks
  // for reduced motion. A still picture is already its own first frame.
  if (request.nextUrl.searchParams.get('still') === '1') {
    data = await sharp(data, { pages: 1 }).webp({ quality: 90 }).toBuffer();
  }
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}, 'Failed to load icon', () => CUSTOM_ICON_TOKEN_RESOURCE);
