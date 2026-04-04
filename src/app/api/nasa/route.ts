import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { NASA_APOD_API, NASA_IMAGE_API, getNasaApiKey } from '@/lib/nasa';
import { fetchWithTimeout, withAuth } from '@/lib/api-utils';
import { createImageDownloadHandler } from '@/lib/route-factories';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nasa?type=search&query=nebula&page=1
 * GET /api/nasa?type=apod&count=12
 *
 * type=search  — NASA Image and Video Library (no API key needed)
 * type=apod    — Astronomy Picture of the Day (uses NASA API key)
 */
export const GET = withAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') || 'search';

  if (type === 'apod') {
    return handleApod(searchParams);
  }
  return handleSearch(searchParams);
}, 'Failed to fetch NASA images');

export const POST = createImageDownloadHandler({
  defaultPrefix: 'nasa',
  downloadOptions: { convertNonWeb: true, validateImage: true },
  errorMsg: 'Failed to download NASA image',
});

async function handleApod(params: URLSearchParams) {
  const apiKey = await getNasaApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'NASA API key not configured. Add it in Settings.' },
      { status: 400 },
    );
  }
  const count = params.get('count') || '12';

  const url = `${NASA_APOD_API}?api_key=${apiKey}&count=${count}&thumbs=true`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    console.error(`[nasa] APOD API error ${res.status}: ${await res.text()}`);
    return NextResponse.json(
      { error: 'Failed to fetch NASA Astronomy Picture of the Day' },
      { status: 502 },
    );
  }

  const items: Array<Record<string, unknown>> = await res.json();

  // Filter to only images (skip videos) and map to our format
  const photos = items
    .filter((item) => item.media_type === 'image')
    .map((item) => ({
      id: item.date as string,
      title: item.title as string,
      description: item.explanation as string,
      date: item.date as string,
      url: item.url as string,
      hdurl: (item.hdurl || item.url) as string,
      thumb: item.url as string,
    }));

  return NextResponse.json({ photos });
}

async function handleSearch(params: URLSearchParams) {
  const query = params.get('query') || 'nebula';
  const page = params.get('page') || '1';

  const url = `${NASA_IMAGE_API}/search?q=${encodeURIComponent(query)}&media_type=image&page=${page}&page_size=12`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    console.error(`[nasa] Image Library error ${res.status}: ${await res.text()}`);
    return NextResponse.json(
      { error: 'Failed to search NASA Image Library' },
      { status: 502 },
    );
  }

  const data = await res.json();
  const collection = data.collection;
  const items: Array<Record<string, unknown>> = collection?.items ?? [];

  const photos = items
    .filter((item) => {
      const links = item.links as Array<Record<string, string>> | undefined;
      return links && links.length > 0;
    })
    .map((item) => {
      const itemData = (item.data as Array<Record<string, unknown>>)?.[0] ?? {};
      const links = (item.links as Array<Record<string, string>>);
      const thumb = links?.[0]?.href ?? '';
      const nasaId = itemData.nasa_id as string;
      return {
        id: nasaId || (itemData.title as string) || thumb,
        title: itemData.title as string || '',
        description: itemData.description as string || '',
        date: itemData.date_created as string || '',
        thumb,
        nasaId,
      };
    });

  // NASA Image Library uses page-based pagination with total_hits
  const totalHits = collection?.metadata?.total_hits ?? 0;
  const totalPages = Math.ceil(totalHits / 12);

  return NextResponse.json({ photos, totalPages, total: totalHits });
}
