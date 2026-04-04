import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { NASA_IMAGE_API } from '@/lib/nasa';
import { fetchWithTimeout, withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nasa/asset?nasaId=PIA12345
 *
 * Resolves a NASA Image Library asset ID to the best available image URL.
 * The Image Library stores assets at images-assets.nasa.gov; this endpoint
 * fetches the asset manifest and picks the largest JPEG/PNG.
 */
export const GET = withAuth(async (request: NextRequest) => {
  const nasaId = request.nextUrl.searchParams.get('nasaId');
  if (!nasaId) {
    return NextResponse.json({ error: 'nasaId required' }, { status: 400 });
  }

  const res = await fetchWithTimeout(`${NASA_IMAGE_API}/asset/${encodeURIComponent(nasaId)}`);
  if (!res.ok) {
    return NextResponse.json({ error: `Asset lookup failed: ${res.status}` }, { status: 502 });
  }

  const data = await res.json();
  const items: Array<{ href: string }> = data.collection?.items ?? [];

  // Filter to image files only (skip metadata.json, etc.)
  const images = items
    .map((i) => i.href)
    .filter((h) => /\.(jpe?g|png|webp|tiff?)(\?|$)/i.test(h));

  // Pick the highest-res variant: orig > large > medium > any
  // TIFFs are accepted — the download handler converts them to JPEG via sharp
  const imageUrl =
    images.find((h) => /~orig\./i.test(h)) ||
    images.find((h) => /~large\./i.test(h)) ||
    images.find((h) => /~medium\./i.test(h)) ||
    images[0] || null;

  return NextResponse.json({ imageUrl });
}, 'Failed to resolve NASA asset');
