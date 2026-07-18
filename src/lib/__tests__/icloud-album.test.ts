import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

import { fetchWithTimeout } from '@/lib/api-utils';
import {
  clearICloudCaches,
  fetchSharedStreamsAlbum,
  getICloudBaseUrl,
} from '@/lib/icloud-album';
import { parseICloudAlbumToken } from '@/lib/icloud-parse';

const mockFetch = vi.mocked(fetchWithTimeout);

// ── Fixtures modeled on real webstream/webasseturls responses ──────────────

/** Photo items use numeric derivative keys (pixel heights). */
function photoItem(guid: string) {
  return {
    photoGuid: guid,
    caption: '',
    derivatives: {
      '342': { checksum: `${guid}-small`, fileSize: '43050', width: '257', height: '342' },
      '2049': { checksum: `${guid}-large`, fileSize: '985681', width: '1537', height: '2049' },
    },
  };
}

/** Video items are marked mediaAssetType and use "360p"/"720p"/"PosterFrame". */
function videoItem(guid: string) {
  return {
    photoGuid: guid,
    caption: '',
    mediaAssetType: 'video',
    derivatives: {
      PosterFrame: { checksum: `${guid}-poster`, fileSize: '50000', width: '1280', height: '720' },
      '360p': { checksum: `${guid}-360`, fileSize: '900000', width: '640', height: '360' },
      '720p': { checksum: `${guid}-720`, fileSize: '4159804', width: '1280', height: '720' },
    },
  };
}

function webstreamResponse(photos: unknown[]) {
  return new Response(JSON.stringify({ streamName: 'Family', photos }), { status: 200 });
}

/** Build a webasseturls response covering every checksum a fixture emits. */
function assetUrlsResponse(guids: string[]) {
  const items: Record<string, { url_location: string; url_path: string; url_expiry: string }> = {};
  for (const guid of guids) {
    for (const suffix of ['small', 'large', 'poster', '360', '720']) {
      items[`${guid}-${suffix}`] = {
        url_location: 'cvws.icloud-content.com',
        url_path: `/S/${guid}-${suffix}`,
        url_expiry: '2099-01-01T00:00:00Z',
      };
    }
  }
  return new Response(JSON.stringify({ items }), { status: 200 });
}

/** Route calls by URL suffix: webstream vs webasseturls. */
function routeFetch(handlers: {
  webstream: () => Response | Promise<Response>;
  webasseturls?: (body: { photoGuids: string[] }) => Response | Promise<Response>;
}) {
  mockFetch.mockImplementation(async (url, init) => {
    const target = String(url);
    if (target.endsWith('/webstream')) return handlers.webstream();
    if (target.endsWith('/webasseturls')) {
      const body = JSON.parse((init?.body as string) ?? '{}');
      return handlers.webasseturls
        ? handlers.webasseturls(body)
        : assetUrlsResponse(body.photoGuids);
    }
    throw new Error(`Unexpected fetch: ${target}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearICloudCaches();
});

describe('parseICloudAlbumToken', () => {
  it('extracts the token from a share link', () => {
    expect(parseICloudAlbumToken('https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC'))
      .toBe('B125ON9t3mbLNC');
  });

  it('accepts a bare token', () => {
    expect(parseICloudAlbumToken('B125ON9t3mbLNC')).toBe('B125ON9t3mbLNC');
  });

  it('drops a sub-album ";suffix"', () => {
    expect(parseICloudAlbumToken('https://www.icloud.com/sharedalbum/#B12AbCdEf;extra'))
      .toBe('B12AbCdEf');
  });

  it('rejects empty and non-token input', () => {
    expect(parseICloudAlbumToken('')).toBeNull();
    expect(parseICloudAlbumToken('   ')).toBeNull();
    expect(parseICloudAlbumToken('https://www.icloud.com/sharedalbum/')).toBeNull();
    expect(parseICloudAlbumToken('not a token!')).toBeNull();
  });
});

describe('getICloudBaseUrl', () => {
  it('derives the partition from the two chars after the prefix', () => {
    // '1','2' → 1*62+2 = 64
    expect(getICloudBaseUrl('B125ON9t3mbLNC'))
      .toBe('https://p64-sharedstreams.icloud.com/B125ON9t3mbLNC/sharedstreams/');
  });

  it('uses a single base62 char for "A" tokens and zero-pads', () => {
    // 'A' prefix → partition from token[1]; '7' → 7 → p07
    expect(getICloudBaseUrl('A7bcdefgh'))
      .toBe('https://p07-sharedstreams.icloud.com/A7bcdefgh/sharedstreams/');
  });
});

describe('fetchSharedStreamsAlbum', () => {
  it('resolves photos and videos with poster URLs', async () => {
    routeFetch({ webstream: () => webstreamResponse([photoItem('p1'), videoItem('v1')]) });

    const items = await fetchSharedStreamsAlbum('B125ON9t3mbLNC');

    expect(items).toEqual([
      // Photo: largest numeric derivative (2049) wins.
      { url: 'https://cvws.icloud-content.com/S/p1-large', type: 'image', guid: 'p1' },
      // Video: highest quality (720p) wins; PosterFrame is the poster.
      {
        url: 'https://cvws.icloud-content.com/S/v1-720',
        type: 'video',
        guid: 'v1',
        posterUrl: 'https://cvws.icloud-content.com/S/v1-poster',
      },
    ]);
  });

  it('follows the 330 partition redirect from the response body', async () => {
    const calls: string[] = [];
    mockFetch.mockImplementation(async (url, init) => {
      const target = String(url);
      calls.push(target);
      if (target.endsWith('/webstream')) {
        if (target.startsWith('https://p64-')) {
          return new Response(JSON.stringify({ 'X-Apple-MMe-Host': 'p42-sharedstreams.icloud.com' }), { status: 330 });
        }
        return webstreamResponse([photoItem('p1')]);
      }
      const body = JSON.parse((init?.body as string) ?? '{}');
      return assetUrlsResponse(body.photoGuids);
    });

    const items = await fetchSharedStreamsAlbum('B125ON9t3mbLNC');

    expect(items).toHaveLength(1);
    expect(calls[0]).toContain('p64-sharedstreams.icloud.com');
    expect(calls[1]).toContain('p42-sharedstreams.icloud.com');
    // The resolved host carries into webasseturls too.
    expect(calls[2]).toContain('p42-sharedstreams.icloud.com/B125ON9t3mbLNC/sharedstreams/webasseturls');
  });

  it('refuses non-Apple redirect hosts', async () => {
    routeFetch({
      webstream: () => new Response(JSON.stringify({ 'X-Apple-MMe-Host': 'evil.example.com' }), { status: 330 }),
    });

    expect(await fetchSharedStreamsAlbum('B125ON9t3mbLNC')).toEqual([]);
    // Only the initial webstream call — the redirect target was never fetched.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list for a 404 (album gone or public website off)', async () => {
    routeFetch({ webstream: () => new Response('', { status: 404 }) });
    expect(await fetchSharedStreamsAlbum('B125ON9t3mbLNC')).toEqual([]);
  });

  it('throws on a 5xx so callers keep their last good list', async () => {
    routeFetch({ webstream: () => new Response('', { status: 500 }) });
    await expect(fetchSharedStreamsAlbum('B125ON9t3mbLNC')).rejects.toThrow('500');
  });

  it('returns an empty list for malformed webstream JSON', async () => {
    routeFetch({ webstream: () => new Response('not json', { status: 200 }) });
    expect(await fetchSharedStreamsAlbum('B125ON9t3mbLNC')).toEqual([]);
  });

  it('skips items with unusable derivatives instead of failing the album', async () => {
    routeFetch({
      webstream: () => webstreamResponse([
        photoItem('p1'),
        { photoGuid: 'broken', derivatives: {} },
        { mediaAssetType: 'video', derivatives: { '720p': { checksum: 'orphan' } } }, // no photoGuid
      ]),
    });

    const items = await fetchSharedStreamsAlbum('B125ON9t3mbLNC');
    expect(items.map((i) => i.guid)).toEqual(['p1']);
  });

  it('skips items whose checksum is missing from webasseturls', async () => {
    routeFetch({
      webstream: () => webstreamResponse([photoItem('p1'), photoItem('p2')]),
      webasseturls: () => assetUrlsResponse(['p1']),
    });

    const items = await fetchSharedStreamsAlbum('B125ON9t3mbLNC');
    expect(items.map((i) => i.guid)).toEqual(['p1']);
  });

  it('batches webasseturls requests at 25 GUIDs per call', async () => {
    const photos = Array.from({ length: 60 }, (_, i) => photoItem(`p${i}`));
    const batchSizes: number[] = [];
    routeFetch({
      webstream: () => webstreamResponse(photos),
      webasseturls: (body) => {
        batchSizes.push(body.photoGuids.length);
        return assetUrlsResponse(body.photoGuids);
      },
    });

    const items = await fetchSharedStreamsAlbum('B125ON9t3mbLNC');
    expect(items).toHaveLength(60);
    expect(batchSizes).toEqual([25, 25, 10]);
  });

  it('caches resolved albums per token', async () => {
    routeFetch({ webstream: () => webstreamResponse([photoItem('p1')]) });

    await fetchSharedStreamsAlbum('B125ON9t3mbLNC');
    const callsAfterFirst = mockFetch.mock.calls.length;
    await fetchSharedStreamsAlbum('B125ON9t3mbLNC');

    expect(mockFetch.mock.calls.length).toBe(callsAfterFirst);
  });

  it('collapses concurrent cold fetches into one Apple round-trip', async () => {
    let releaseWebstream!: (r: Response) => void;
    routeFetch({
      webstream: () => new Promise<Response>((resolve) => { releaseWebstream = resolve; }),
    });

    // Three displays polling an expired entry at once.
    const fetches = [
      fetchSharedStreamsAlbum('B125ON9t3mbLNC'),
      fetchSharedStreamsAlbum('B125ON9t3mbLNC'),
      fetchSharedStreamsAlbum('B125ON9t3mbLNC'),
    ];
    releaseWebstream(webstreamResponse([photoItem('p1')]));
    const results = await Promise.all(fetches);

    expect(results[0]).toHaveLength(1);
    expect(results[1]).toBe(results[0]);
    expect(results[2]).toBe(results[0]);
    // One webstream + one webasseturls — not three of each.
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('caches empty results too (a private album is not re-hammered)', async () => {
    routeFetch({ webstream: () => new Response('', { status: 404 }) });

    await fetchSharedStreamsAlbum('B125ON9t3mbLNC');
    await fetchSharedStreamsAlbum('B125ON9t3mbLNC');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
