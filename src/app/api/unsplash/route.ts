import { NextRequest, NextResponse } from 'next/server';
import { UNSPLASH_API, getUnsplashAccessKey, trackDownload } from '@/lib/unsplash';
import { fetchWithTimeout, withAuth } from '@/lib/api-utils';
import { downloadAndSaveBackground } from '@/lib/background-download';
import { isSafeExternalUrl } from '@/lib/url-safety';

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
    const body = await res.text();
    return NextResponse.json(
      { error: `Unsplash API error ${res.status}: ${body}` },
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

export const POST = withAuth(async (request: NextRequest) => {
  const accessKey = await getUnsplashAccessKey();

  const body = await request.json();
  const { imageUrl, downloadUrl, filename } = body as {
    imageUrl?: string;
    downloadUrl?: string;
    filename?: string;
  };

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing imageUrl' }, { status: 400 });
  }

  if (!isSafeExternalUrl(imageUrl)) {
    return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 });
  }

  // Only track downloads against the real Unsplash API to prevent credential leakage
  if (downloadUrl && accessKey && downloadUrl.startsWith(UNSPLASH_API + '/')) {
    trackDownload(downloadUrl, accessKey);
  }

  const result = await downloadAndSaveBackground(
    imageUrl,
    filename || `unsplash-${Date.now()}`,
  );

  return NextResponse.json(result, { status: 201 });
}, 'Failed to download image');
