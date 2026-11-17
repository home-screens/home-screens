import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { fetchWithTimeout } from '@/lib/api-utils';
import {
  clearICloudLinkCaches,
  fetchCloudKitAlbumForImport,
  findCloudKitItem,
  listCloudKitAlbum,
  listICloudLinkItems,
} from '@/lib/icloud-link';
import { parseICloudLinkToken } from '@/lib/icloud-parse';

const mockFetch = vi.mocked(fetchWithTimeout);

// ── Fixtures modeled on live CloudKit responses (captured 2026-07-09) ──────

const TOKEN = '0f0a3hdUxHZ0-C8uQ7Dq1JxLw';
const ZONE = {
  zoneName: 'CMM-70956CA5-8FBC-4D33-93A0-36DD6AA29604',
  ownerRecordName: '_9b814aad001ecc5bca30dd273c7d2dc5',
  zoneType: 'REGULAR_CUSTOM_ZONE',
};

function resolveResponse(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    results: [{
      shortGUID: { value: TOKEN },
      zoneID: ZONE,
      anonymousPublicAccess: {
        databasePartition: 'https://p164-ckdatabasews.icloud.com:443',
        token: 'anon-token-abc',
      },
      rootRecord: { recordType: 'CMMRoot', fields: { photosCount: { value: 1 }, videosCount: { value: 1 } } },
      ...overrides,
    }],
  }), { status: 200 });
}

function field(value: unknown) {
  return { value };
}

/** HEVC iPhone video: original is quicktime, medium rendition is H.264 MP4. */
function videoMaster(name: string) {
  return {
    recordName: `master-${name}`,
    recordType: 'CPLMaster',
    fields: {
      itemType: field('com.apple.quicktime-movie'),
      codec: field('HEVC'),
      filenameEnc: field(Buffer.from(`IMG_${name}.MOV`).toString('base64')),
      resOriginalFingerprint: field(`AXaxFKq1/${name}==`),
      resOriginalFileType: field('com.apple.quicktime-movie'),
      resOriginalRes: field({ downloadURL: `https://cvws.icloud-content.com/orig-${name}`, size: 7654973 }),
      resVidMedFileType: field('public.mpeg-4'),
      resVidMedRes: field({ downloadURL: `https://cvws.icloud-content.com/vidmed-${name}`, size: 2209201 }),
      resVidSmallFileType: field('public.mpeg-4'),
      resVidSmallRes: field({ downloadURL: `https://cvws.icloud-content.com/vidsmall-${name}`, size: 652253 }),
      resJPEGMedFileType: field('public.jpeg'),
      resJPEGMedRes: field({ downloadURL: `https://cvws.icloud-content.com/poster-${name}`, size: 369300 }),
    },
  };
}

/** MP4-container video: Apple reports the concrete UTI public.mpeg-4, never
 *  the abstract public.movie (per pyicloud/icloudpd ITEM_TYPES). */
function mp4Master(name: string, itemType = 'public.mpeg-4') {
  return {
    recordName: `master-${name}`,
    recordType: 'CPLMaster',
    fields: {
      itemType: field(itemType),
      filenameEnc: field(Buffer.from(`IMG_${name}.MP4`).toString('base64')),
      resOriginalFingerprint: field(`Bq2x3Yz/${name}==`),
      resOriginalFileType: field('public.mpeg-4'),
      resOriginalRes: field({ downloadURL: `https://cvws.icloud-content.com/orig-${name}`, size: 5000000 }),
      resVidMedFileType: field('public.mpeg-4'),
      resVidMedRes: field({ downloadURL: `https://cvws.icloud-content.com/vidmed-${name}`, size: 1800000 }),
    },
  };
}

/** HEIC photo: original isn't browser-safe, JPEG rendition is. */
function heicMaster(name: string) {
  return {
    recordName: `master-${name}`,
    recordType: 'CPLMaster',
    fields: {
      itemType: field('public.heic'),
      filenameEnc: field(Buffer.from(`IMG_${name}.HEIC`).toString('base64')),
      resOriginalFingerprint: field(`AbCdEf/${name}==`),
      resOriginalFileType: field('public.heic'),
      resOriginalRes: field({ downloadURL: `https://cvws.icloud-content.com/orig-${name}`, size: 3000000 }),
      resJPEGMedFileType: field('public.jpeg'),
      resJPEGMedRes: field({ downloadURL: `https://cvws.icloud-content.com/jpegmed-${name}`, size: 400000 }),
    },
  };
}

/** Plain JPEG photo: original is already web-safe. */
function jpegMaster(name: string) {
  return {
    recordName: `master-${name}`,
    recordType: 'CPLMaster',
    fields: {
      itemType: field('public.jpeg'),
      filenameEnc: field(Buffer.from(`IMG_${name}.JPG`).toString('base64')),
      resOriginalFingerprint: field(`Aq1w2e/${name}==`),
      resOriginalFileType: field('public.jpeg'),
      resOriginalRes: field({ downloadURL: `https://cvws.icloud-content.com/orig-${name}`, size: 900000 }),
    },
  };
}

function queryResponse(records: unknown[], continuationMarker?: string) {
  return new Response(JSON.stringify({ records, ...(continuationMarker ? { continuationMarker } : {}) }), { status: 200 });
}

function routeFetch(handlers: {
  resolve?: () => Response;
  query: (body: Record<string, unknown>) => Response;
}) {
  mockFetch.mockImplementation(async (url, init) => {
    const target = String(url);
    if (target.includes('/public/records/resolve')) {
      return handlers.resolve ? handlers.resolve() : resolveResponse();
    }
    if (target.includes('/shared/records/query')) {
      return handlers.query(JSON.parse((init?.body as string) ?? '{}'));
    }
    throw new Error(`Unexpected fetch: ${target}`);
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await clearICloudLinkCaches();
});

afterEach(() => {
  vi.useRealTimers();
});

function callsTo(kind: 'resolve' | 'query'): number {
  return mockFetch.mock.calls.filter(([url]) => String(url).includes(`/records/${kind}`)).length;
}

/** Let a read that was set off behind an answer finish. */
async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

describe('parseICloudLinkToken', () => {
  it('extracts the token from a share.icloud.com link', () => {
    expect(parseICloudLinkToken(`https://share.icloud.com/photos/${TOKEN}`)).toBe(TOKEN);
  });

  it('extracts the token from an icloudlinks fragment link', () => {
    expect(parseICloudLinkToken(`https://www.icloud.com/photos/#/icloudlinks/${TOKEN}`)).toBe(TOKEN);
  });

  it('accepts a bare token', () => {
    expect(parseICloudLinkToken(TOKEN)).toBe(TOKEN);
  });

  it('rejects empty and non-token input', () => {
    expect(parseICloudLinkToken('')).toBeNull();
    expect(parseICloudLinkToken('https://share.icloud.com/photos/')).toBeNull();
    expect(parseICloudLinkToken('not a link at all')).toBeNull();
  });
});

describe('listICloudLinkItems', () => {
  it('authenticates the query with the anonymous grant from resolve', async () => {
    routeFetch({ query: () => queryResponse([jpegMaster('0001')]) });

    await listICloudLinkItems(TOKEN);

    const queryCall = mockFetch.mock.calls.find(([u]) => String(u).includes('/shared/records/query'))!;
    const queryUrl = String(queryCall[0]);
    expect(queryUrl).toContain('https://p164-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/shared/records/query');
    expect(queryUrl).toContain(`publicAccessAuthToken=${encodeURIComponent('anon-token-abc')}`);
  });

  it('picks the H.264 MP4 medium rendition for HEVC videos', async () => {
    routeFetch({ query: () => queryResponse([videoMaster('0333')]) });

    const items = await listICloudLinkItems(TOKEN);

    expect(items).toEqual([{
      downloadUrl: 'https://cvws.icloud-content.com/vidmed-0333',
      type: 'video',
      filename: expect.stringMatching(/^IMG_0333-[A-Za-z0-9]+\.mp4$/),
      size: 2209201,
    }]);
  });

  it('classifies MP4-container assets (public.mpeg-4) as videos', async () => {
    routeFetch({ query: () => queryResponse([mp4Master('0500')]) });

    const items = await listICloudLinkItems(TOKEN);

    expect(items).toEqual([{
      downloadUrl: 'https://cvws.icloud-content.com/vidmed-0500',
      type: 'video',
      filename: expect.stringMatching(/^IMG_0500-[A-Za-z0-9]+\.mp4$/),
      size: 1800000,
    }]);
  });

  it('falls back to the filename extension when itemType is missing', async () => {
    routeFetch({ query: () => queryResponse([mp4Master('0501', '')]) });

    const items = (await listICloudLinkItems(TOKEN))!;

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('video');
    expect(items[0].downloadUrl).toBe('https://cvws.icloud-content.com/vidmed-0501');
  });

  it('picks the JPEG rendition for HEIC photos and the original for JPEGs', async () => {
    routeFetch({ query: () => queryResponse([heicMaster('0100'), jpegMaster('0200')]) });

    const items = (await listICloudLinkItems(TOKEN))!;

    expect(items[0].downloadUrl).toBe('https://cvws.icloud-content.com/jpegmed-0100');
    expect(items[0].filename).toMatch(/^IMG_0100-[A-Za-z0-9]+\.jpg$/);
    expect(items[1].downloadUrl).toBe('https://cvws.icloud-content.com/orig-0200');
    expect(items[1].filename).toMatch(/^IMG_0200-[A-Za-z0-9]+\.jpg$/);
  });

  it('follows continuation markers across pages', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    routeFetch({
      query: (body) => {
        bodies.push(body);
        return body.continuationMarker
          ? queryResponse([jpegMaster('0002')])
          : queryResponse([jpegMaster('0001')], 'marker-1');
      },
    });

    const items = await listICloudLinkItems(TOKEN);

    expect(items).toHaveLength(2);
    expect(bodies[0]).not.toHaveProperty('continuationMarker');
    expect(bodies[1].continuationMarker).toBe('marker-1');
  });

  it('skips CPLAsset records and masters without a usable rendition', async () => {
    routeFetch({
      query: () => queryResponse([
        { recordType: 'CPLAsset', fields: { assetDate: field(1) } },
        jpegMaster('0001'),
        { recordType: 'CPLMaster', recordName: 'no-res', fields: { itemType: field('public.heic') } },
      ]),
    });

    const items = await listICloudLinkItems(TOKEN);
    expect(items).toHaveLength(1);
  });

  it('returns null for an expired or revoked link (no anonymous grant)', async () => {
    routeFetch({
      resolve: () => resolveResponse({ anonymousPublicAccess: undefined }),
      query: () => queryResponse([]),
    });

    expect(await listICloudLinkItems(TOKEN)).toBeNull();
  });

  it('returns null when the anonymous grant points outside icloud.com', async () => {
    routeFetch({
      resolve: () => resolveResponse({
        anonymousPublicAccess: { databasePartition: 'https://evil.example.com', token: 'anon-token-abc' },
      }),
      query: () => queryResponse([jpegMaster('0001')]),
    });

    expect(await listICloudLinkItems(TOKEN)).toBeNull();
    // The poisoned partition base must never be fetched.
    expect(mockFetch.mock.calls.every(([u]) => !String(u).includes('evil.example.com'))).toBe(true);
  });

  it('returns null when resolve answers that the link is not there (404)', async () => {
    routeFetch({
      resolve: () => new Response('', { status: 404 }),
      query: () => queryResponse([]),
    });

    expect(await listICloudLinkItems(TOKEN)).toBeNull();
  });

  it('throws when Apple says to slow down, which says nothing about the link', async () => {
    routeFetch({
      resolve: () => new Response('', { status: 429 }),
      query: () => queryResponse([]),
    });

    await expect(listICloudLinkItems(TOKEN)).rejects.toThrow('429');
  });

  it('returns null when resolve names the link as not found', async () => {
    routeFetch({
      resolve: () => new Response(JSON.stringify({ results: [{ shortGUID: { value: TOKEN }, serverErrorCode: 'NOT_FOUND', reason: 'not found' }] })),
      query: () => queryResponse([]),
    });

    expect(await listICloudLinkItems(TOKEN)).toBeNull();
  });

  it('throws when resolve answers something that cannot be read, which says nothing about the link', async () => {
    routeFetch({ resolve: () => new Response('<html>busy</html>'), query: () => queryResponse([]) });
    await expect(listICloudLinkItems(TOKEN)).rejects.toThrow('without a result');

    routeFetch({ resolve: () => new Response(JSON.stringify({ results: [] })), query: () => queryResponse([]) });
    await expect(listICloudLinkItems(TOKEN)).rejects.toThrow('without a result');
  });

  it.each(['THROTTLED', 'TRY_AGAIN_LATER', 'INTERNAL_ERROR'])('throws when resolve names a passing trouble (%s)', async (serverErrorCode) => {
    routeFetch({
      resolve: () => new Response(JSON.stringify({ results: [{ shortGUID: { value: TOKEN }, serverErrorCode }] })),
      query: () => queryResponse([]),
    });

    await expect(listICloudLinkItems(TOKEN)).rejects.toThrow(serverErrorCode);
  });

  it('throws when a page of the album cannot be read, and never shows the album cut short', async () => {
    let page = 0;
    routeFetch({
      query: () => {
        page += 1;
        return page === 1 ? queryResponse([jpegMaster('0001')], 'more') : new Response('<html>busy</html>');
      },
    });

    await expect(listICloudLinkItems(TOKEN)).rejects.toThrow('could not be read');
  });

  it('throws on a resolve 5xx so callers can distinguish outage from expiry', async () => {
    routeFetch({
      resolve: () => new Response('', { status: 503 }),
      query: () => queryResponse([]),
    });

    await expect(listICloudLinkItems(TOKEN)).rejects.toThrow('503');
  });

  it('throws when the query fails', async () => {
    routeFetch({ query: () => new Response('', { status: 500 }) });

    await expect(listICloudLinkItems(TOKEN)).rejects.toThrow('500');
  });
});

describe('fetchCloudKitAlbumForImport', () => {
  it('returns display items (url/type/guid) for photos', async () => {
    routeFetch({ query: () => queryResponse([jpegMaster('0200'), heicMaster('0100')]) });

    const items = await fetchCloudKitAlbumForImport(TOKEN);

    expect(items).toEqual([
      { url: 'https://cvws.icloud-content.com/orig-0200', type: 'image', guid: 'Aq1w2e/0200==' },
      { url: 'https://cvws.icloud-content.com/jpegmed-0100', type: 'image', guid: 'AbCdEf/0100==' },
    ]);
  });

  it('names the medium JPEG beside a larger original as the copy to show', async () => {
    const withMedium = jpegMaster('0900');
    Object.assign(withMedium.fields, {
      resJPEGMedRes: field({ downloadURL: 'https://cvws.icloud-content.com/jpegmed-0900', size: 400000 }),
    });
    // A HEIC is already answered with its medium JPEG: nothing smaller to name.
    routeFetch({ query: () => queryResponse([withMedium, heicMaster('0100'), jpegMaster('0200')]) });

    const items = (await fetchCloudKitAlbumForImport(TOKEN))!;

    expect(items[0]).toMatchObject({
      url: 'https://cvws.icloud-content.com/orig-0900',
      previewUrl: 'https://cvws.icloud-content.com/jpegmed-0900',
    });
    expect(items[1]).not.toHaveProperty('previewUrl');
    expect(items[2]).not.toHaveProperty('previewUrl');
  });

  it('gives videos the MP4 rendition plus a JPEG poster', async () => {
    routeFetch({ query: () => queryResponse([videoMaster('0333')]) });

    const items = await fetchCloudKitAlbumForImport(TOKEN);

    expect(items).toEqual([{
      url: 'https://cvws.icloud-content.com/vidmed-0333',
      type: 'video',
      guid: 'AXaxFKq1/0333==',
      posterUrl: 'https://cvws.icloud-content.com/poster-0333',
    }]);
  });

  it('omits posterUrl when a video has no JPEG rendition', async () => {
    routeFetch({ query: () => queryResponse([mp4Master('0500')]) });

    const items = (await fetchCloudKitAlbumForImport(TOKEN))!;

    expect(items[0].type).toBe('video');
    expect(items[0]).not.toHaveProperty('posterUrl');
  });

  it('handles a mixed photo + video album in one pass', async () => {
    routeFetch({ query: () => queryResponse([jpegMaster('0200'), videoMaster('0333'), heicMaster('0100')]) });

    const items = (await fetchCloudKitAlbumForImport(TOKEN))!;

    expect(items.map((i) => i.type)).toEqual(['image', 'video', 'image']);
    expect(items[1]).toMatchObject({
      url: 'https://cvws.icloud-content.com/vidmed-0333',
      posterUrl: 'https://cvws.icloud-content.com/poster-0333',
    });
    expect(items[2].url).toBe('https://cvws.icloud-content.com/jpegmed-0100');
  });

  it('prefers the full-res JPEG poster, falling back to med then thumb', async () => {
    const master = videoMaster('0700');
    (master.fields as Record<string, unknown>).resJPEGFullRes =
      field({ downloadURL: 'https://cvws.icloud-content.com/posterfull-0700', size: 1 });
    const thumbOnly = videoMaster('0701');
    delete (thumbOnly.fields as Record<string, unknown>).resJPEGMedRes;
    (thumbOnly.fields as Record<string, unknown>).resJPEGThumbRes =
      field({ downloadURL: 'https://cvws.icloud-content.com/posterthumb-0701', size: 1 });
    routeFetch({ query: () => queryResponse([master, thumbOnly]) });

    const items = (await fetchCloudKitAlbumForImport(TOKEN))!;

    expect(items[0].posterUrl).toBe('https://cvws.icloud-content.com/posterfull-0700');
    expect(items[1].posterUrl).toBe('https://cvws.icloud-content.com/posterthumb-0701');
  });

  it('falls back to the record name, then a short URL hash, for the guid', async () => {
    const noFingerprint = jpegMaster('0800');
    delete (noFingerprint.fields as Record<string, unknown>).resOriginalFingerprint;
    const bareMaster = jpegMaster('0801');
    delete (bareMaster.fields as Record<string, unknown>).resOriginalFingerprint;
    delete (bareMaster as Record<string, unknown>).recordName;
    routeFetch({ query: () => queryResponse([noFingerprint, bareMaster]) });

    const items = (await fetchCloudKitAlbumForImport(TOKEN))!;

    expect(items[0].guid).toBe('master-0800');
    // The hash keeps the guid short and filename-safe — never the raw signed
    // URL, which runs past the filesystem name limit.
    expect(items[1].guid).toBe(
      createHash('sha256').update('https://cvws.icloud-content.com/orig-0801').digest('hex').slice(0, 16),
    );
  });

  it('stops paging a giant album at the record ceiling', async () => {
    // 300 masters per page, continuation marker always present: an unbounded
    // loop would run all 100 pages; the ceiling (4400 records) stops it at 15.
    const page = Array.from({ length: 300 }, (_, i) => jpegMaster(`p${i}`));
    routeFetch({ query: () => queryResponse(page, 'more') });

    const items = (await fetchCloudKitAlbumForImport(TOKEN))!;

    const queryCalls = mockFetch.mock.calls.filter(([u]) => String(u).includes('/shared/records/query'));
    expect(queryCalls).toHaveLength(15);
    expect(items).toHaveLength(4500);
  });
});

describe('listCloudKitAlbum', () => {
  it('names the album\'s items without their links', async () => {
    routeFetch({ query: () => queryResponse([jpegMaster('0200'), videoMaster('0333'), mp4Master('0500')]) });

    expect(await listCloudKitAlbum(TOKEN)).toEqual([
      { guid: 'Aq1w2e/0200==', type: 'image', hasPoster: false },
      { guid: 'AXaxFKq1/0333==', type: 'video', hasPoster: true },
      { guid: 'Bq2x3Yz/0500==', type: 'video', hasPoster: false },
    ]);
  });

  it('answers a repeat from the copy in hand, with no second Apple round-trip', async () => {
    routeFetch({ query: () => queryResponse([jpegMaster('0001')]) });

    await listCloudKitAlbum(TOKEN);
    const callsAfterFirst = mockFetch.mock.calls.length;
    await listCloudKitAlbum(TOKEN);

    expect(mockFetch.mock.calls.length).toBe(callsAfterFirst);
  });

  it('answers at once from an aged copy and reads Apple behind it', async () => {
    vi.useFakeTimers();
    routeFetch({ query: () => queryResponse([jpegMaster('0001')]) });
    await listCloudKitAlbum(TOKEN);
    vi.advanceTimersByTime(5 * 60_000 + 1);

    let release!: (r: Response) => void;
    mockFetch.mockImplementation(() => new Promise<Response>((resolve) => { release = resolve; }));
    // Apple has not answered; the wall has its list anyway.
    expect((await listCloudKitAlbum(TOKEN))?.map((entry) => entry.guid)).toEqual(['Aq1w2e/0001==']);

    release(resolveResponse());
    routeFetch({ query: () => queryResponse([jpegMaster('0001'), jpegMaster('0002')]) });
    await settle();
    expect(await listCloudKitAlbum(TOKEN)).toHaveLength(2);
  });

  it('keeps showing the copy in hand while Apple cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
    routeFetch({ query: () => queryResponse([jpegMaster('0001')]) });
    await listCloudKitAlbum(TOKEN);
    vi.advanceTimersByTime(60 * 60_000);

    routeFetch({ query: () => new Response('', { status: 503 }) });
    expect(await listCloudKitAlbum(TOKEN)).toHaveLength(1);
    await settle();
    expect(await listCloudKitAlbum(TOKEN)).toHaveLength(1);
    warn.mockRestore();
  });

  it('does not ask again about a private or expired album for a minute, then looks again', async () => {
    vi.useFakeTimers();
    routeFetch({
      resolve: () => resolveResponse({ anonymousPublicAccess: undefined }),
      query: () => queryResponse([]),
    });

    expect(await listCloudKitAlbum(TOKEN)).toBeNull();
    const callsAfterFirst = mockFetch.mock.calls.length;

    // A kiosk polling a dead link is answered without another round-trip.
    expect(await listCloudKitAlbum(TOKEN)).toBeNull();
    expect(mockFetch.mock.calls.length).toBe(callsAfterFirst);

    // A fixed-up album shows within a minute rather than staying blank.
    vi.advanceTimersByTime(61_000);
    routeFetch({ query: () => queryResponse([jpegMaster('0001')]) });
    expect(await listCloudKitAlbum(TOKEN)).toHaveLength(1);
  });

  it('keeps the album it has when Apple answers something unreadable in place of the link', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
    routeFetch({ query: () => queryResponse([jpegMaster('0001')]) });
    await listCloudKitAlbum(TOKEN);
    vi.advanceTimersByTime(5 * 60_000 + 1);

    routeFetch({ resolve: () => new Response('<html>busy</html>'), query: () => queryResponse([]) });
    expect(await listCloudKitAlbum(TOKEN)).toHaveLength(1);
    await settle();
    expect(await listCloudKitAlbum(TOKEN)).toHaveLength(1);
    warn.mockRestore();
  });

  it('throws when Apple does not answer for an album the hub has never read', async () => {
    routeFetch({ query: () => new Response('', { status: 503 }) });
    await expect(listCloudKitAlbum(TOKEN)).rejects.toThrow('503');
  });
});

describe('findCloudKitItem', () => {
  const PHOTO_GUID = 'Aq1w2e/0200==';

  it('finds an item with its links, from the same read that listed the album', async () => {
    routeFetch({ query: () => queryResponse([jpegMaster('0200'), videoMaster('0333')]) });
    await listCloudKitAlbum(TOKEN);

    expect(await findCloudKitItem(TOKEN, PHOTO_GUID)).toEqual({
      url: 'https://cvws.icloud-content.com/orig-0200', type: 'image', guid: PHOTO_GUID,
    });
    expect(await findCloudKitItem(TOKEN, 'AXaxFKq1/0333==')).toMatchObject({
      url: 'https://cvws.icloud-content.com/vidmed-0333',
      posterUrl: 'https://cvws.icloud-content.com/poster-0333',
    });
    expect(callsTo('query')).toBe(1);
  });

  it('reads the album itself when it is the first to ask', async () => {
    routeFetch({ query: () => queryResponse([jpegMaster('0200')]) });
    expect(await findCloudKitItem(TOKEN, PHOTO_GUID)).toMatchObject({ guid: PHOTO_GUID });
    expect(callsTo('query')).toBe(1);
  });

  it('has nothing for a guid the album does not name, and asks Apple nothing for it', async () => {
    routeFetch({ query: () => queryResponse([jpegMaster('0200')]) });
    await listCloudKitAlbum(TOKEN);
    mockFetch.mockClear();

    expect(await findCloudKitItem(TOKEN, 'made-up')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('has nothing for an album that is gone', async () => {
    routeFetch({ resolve: () => resolveResponse({ anonymousPublicAccess: undefined }), query: () => queryResponse([]) });
    expect(await findCloudKitItem(TOKEN, PHOTO_GUID)).toBeNull();
  });

  describe('as the read its links came from ages', () => {
    /** Each read signs its links anew. */
    function signedAlbum() {
      let reads = 0;
      routeFetch({
        query: () => {
          reads += 1;
          const master = jpegMaster('0200');
          master.fields.resOriginalRes = field({ downloadURL: `https://cvws.icloud-content.com/orig-0200?read=${reads}`, size: 900000 });
          return queryResponse([master]);
        },
      });
    }

    beforeEach(async () => {
      vi.useFakeTimers();
      signedAlbum();
      await listCloudKitAlbum(TOKEN);
    });

    it('hands out the links in hand without waiting, and sets a new read off behind them', async () => {
      vi.advanceTimersByTime(6 * 60_000);

      expect((await findCloudKitItem(TOKEN, PHOTO_GUID))?.url).toContain('read=1');
      await settle();
      expect(callsTo('query')).toBe(2);
      expect((await findCloudKitItem(TOKEN, PHOTO_GUID))?.url).toContain('read=2');
    });

    it('waits for a new read once the links in hand are too old to trust', async () => {
      vi.advanceTimersByTime(10 * 60_000 + 1);

      expect((await findCloudKitItem(TOKEN, PHOTO_GUID))?.url).toContain('read=2');
      // One read answered both the list's refresh and the item.
      expect(callsTo('query')).toBe(2);
    });

    it('fails rather than hand out a dead link when that read does not get an answer', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.advanceTimersByTime(10 * 60_000 + 1);
      routeFetch({ query: () => new Response('', { status: 503 }) });

      await expect(findCloudKitItem(TOKEN, PHOTO_GUID)).rejects.toThrow('503');
      warn.mockRestore();
    });

    it('has nothing for an item the family took out of the album since', async () => {
      vi.advanceTimersByTime(10 * 60_000 + 1);
      routeFetch({ query: () => queryResponse([jpegMaster('0999')]) });

      expect(await findCloudKitItem(TOKEN, PHOTO_GUID)).toBeNull();
    });
  });
});

describe('after a hub restart', () => {
  it('lists the album from disk without waiting for Apple, then waits for links it can trust', async () => {
    await fs.writeFile(path.join('data', 'icloud-albums.json'), JSON.stringify({
      [`cloudkit:${TOKEN}`]: {
        entries: [{ guid: 'Aq1w2e/0200==', type: 'image', hasPoster: false }, { guid: 'no-type', hasPoster: false }],
        readAt: Date.now() - 60_000,
      },
    }));
    let release!: () => void;
    const appleAnswers = new Promise<void>((resolve) => { release = resolve; });
    routeFetch({ query: () => queryResponse([jpegMaster('0200')]) });
    const answer = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (...args) => {
      await appleAnswers;
      return answer(...args);
    });

    // The wall has its list while Apple is still being read.
    expect(await listCloudKitAlbum(TOKEN)).toEqual([{ guid: 'Aq1w2e/0200==', type: 'image', hasPoster: false }]);

    // A picture needs a link, and the disk holds none: that waits for the read.
    const item = findCloudKitItem(TOKEN, 'Aq1w2e/0200==');
    release();
    expect(await item).toMatchObject({ url: 'https://cvws.icloud-content.com/orig-0200' });
    expect(callsTo('query')).toBe(1);
  });

  it('writes down what the album holds, without any link', async () => {
    routeFetch({ query: () => queryResponse([jpegMaster('0200'), videoMaster('0333')]) });
    await listCloudKitAlbum(TOKEN);

    await vi.waitFor(async () => {
      const saved = await fs.readFile(path.join('data', 'icloud-albums.json'), 'utf-8');
      expect(JSON.parse(saved)[`cloudkit:${TOKEN}`].entries).toEqual([
        { guid: 'Aq1w2e/0200==', type: 'image', hasPoster: false },
        { guid: 'AXaxFKq1/0333==', type: 'video', hasPoster: true },
      ]);
      expect(saved).not.toContain('icloud-content.com');
    });
  });
});
