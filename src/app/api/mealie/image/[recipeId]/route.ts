import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { withDisplayAuth } from '@/lib/api-utils';
import { getDataRoot } from '@/lib/data-root';
import { THUMBNAIL_DIR } from '@/lib/thumbnails';
import { fetchMealieImage, MealieError, type MealieImageSize } from '@/lib/mealie';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ recipeId: string }> };

const SIZES: Record<string, MealieImageSize> = { tiny: 'tiny-original', min: 'min-original', full: 'original' };
/** Mealie's own copies are small WebPs; anything bigger is not a recipe photo. */
const MAX_BYTES = 8 * 1024 * 1024;

function cacheDir(): string {
  return path.join(getDataRoot(), THUMBNAIL_DIR, 'mealie');
}

function imageResponse(data: Uint8Array, versioned: boolean): Response {
  return new Response(data as BodyInit, {
    headers: {
      'Content-Type': 'image/webp',
      // A versioned URL names one photo for good; a new photo gets a new `v`.
      'Cache-Control': versioned ? 'private, max-age=31536000, immutable' : 'private, max-age=3600',
    },
  });
}

/**
 * GET /api/mealie/image/[recipeId]?size=tiny|min|full&v=<version>: a Mealie
 * recipe photo, fetched by the hub. The wall never asks Mealie itself: a
 * display-only Pi may not reach the address the hub uses. Copies are kept
 * under `data/thumbnails/mealie/`, named by recipe, size and version, so a
 * wall reload or a second wall costs Mealie nothing; like every thumbnail
 * they are rebuilt on demand and never backed up.
 */
export const GET = withDisplayAuth(async (request: NextRequest, ctx: RouteContext) => {
  const { recipeId } = await ctx.params;
  if (!/^[0-9a-f-]{32,36}$/i.test(recipeId)) return NextResponse.json({ error: 'Unknown recipe' }, { status: 400 });
  const size = SIZES[request.nextUrl.searchParams.get('size') ?? 'min'];
  if (!size) return NextResponse.json({ error: 'size must be tiny, min or full' }, { status: 400 });
  const version = request.nextUrl.searchParams.get('v') ?? '';
  const prefix = `${recipeId.toLowerCase()}-${size}-`;
  const name = `${prefix}${createHash('sha1').update(version).digest('hex').slice(0, 12)}.webp`;
  const file = path.join(cacheDir(), name);

  try {
    return imageResponse(await fs.readFile(file), !!version);
  } catch {
    // Not kept yet: ask Mealie.
  }

  let res: Response;
  let buf: Uint8Array;
  try {
    res = await fetchMealieImage(recipeId, size);
    if (!res.ok) return NextResponse.json({ error: 'No photo' }, { status: 404 });
    // Reading the body can fail too (Mealie dropping the connection under
    // load): that is Mealie not answering, not a fault on the hub.
    buf = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    return NextResponse.json({ error: 'Mealie is not answering', failure: err instanceof MealieError ? err.failure : 'unreachable' }, { status: 502 });
  }
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return NextResponse.json({ error: 'No photo' }, { status: 404 });

  try {
    await fs.mkdir(cacheDir(), { recursive: true });
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, file);
    // The same recipe's older photo at this size is no longer named by anything.
    for (const other of await fs.readdir(cacheDir())) {
      if (other.startsWith(prefix) && other !== name && other.endsWith('.webp')) await fs.rm(path.join(cacheDir(), other), { force: true });
    }
  } catch {
    // A full or read-only disk only costs the next request another fetch.
  }
  return imageResponse(buf, !!version);
}, 'Failed to load the recipe photo');
