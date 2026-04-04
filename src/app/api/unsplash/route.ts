import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { UNSPLASH_API, getUnsplashAccessKey, trackDownload } from '@/lib/unsplash';
import { fetchWithTimeout, withAuth } from '@/lib/api-utils';
import { createImageDownloadHandler } from '@/lib/route-factories';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request: NextRequest) => {
  const accessKey = await getUnsplashAccessKey();
  if (!accessKey) {
    return NextResponse.json(
      { error: 'Unsplash API key not configured. Add it in Settings.' },
      { status: 400 },
    );
  }

  const { searchParams } = request.nextUrl;
  const query = searchParams.get('query') || 'nature landscape';
  const page = searchParams.get('page') || '1';
  const perPage = searchParams.get('per_page') || '20';
  const orientation = searchParams.get('orientation') || 'portrait';

  const url = `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}&orientation=${orientation}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });

  if (!res.ok) {
    console.error(`[unsplash] API error ${res.status}: ${await res.text()}`);
    return NextResponse.json(
      { error: 'Failed to search Unsplash' },
      { status: 502 },
    );
  }

  const data = await res.json();
  const photos = (data.results ?? []).map((photo: Record<string, unknown>) => {
    const urls = photo.urls as Record<string, string>;
    const user = photo.user as Record<string, unknown>;
    return {
      id: photo.id,
      description: photo.description || photo.alt_description || '',
      thumb: urls.thumb,
      small: urls.small,
      regular: urls.regular,
      full: urls.full,
      raw: urls.raw,
      // For Unsplash attribution requirements
      authorName: user?.name ?? '',
      authorUrl: (user?.links as Record<string, string>)?.html ?? '',
      downloadUrl: (photo.links as Record<string, string>)?.download_location ?? '',
    };
  });

  return NextResponse.json({
    photos,
    totalPages: data.total_pages ?? 1,
    total: data.total ?? 0,
  });
}, 'Failed to search Unsplash');

export const POST = createImageDownloadHandler({
  defaultPrefix: 'unsplash',
  beforeDownload: async (body) => {
    const accessKey = await getUnsplashAccessKey();
    const downloadUrl = body.downloadUrl as string | undefined;
    // Only track downloads against the real Unsplash API to prevent credential leakage
    if (downloadUrl && accessKey && downloadUrl.startsWith(UNSPLASH_API + '/')) {
      trackDownload(downloadUrl, accessKey);
    }
  },
  errorMsg: 'Failed to download image',
});
