import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

import { fetchWithTimeout } from '@/lib/api-utils';
import { listICloudLinkItems } from '@/lib/icloud-link';
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

beforeEach(() => {
  vi.clearAllMocks();
});

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

  it('returns null when resolve rejects the token (4xx)', async () => {
    routeFetch({
      resolve: () => new Response('', { status: 404 }),
      query: () => queryResponse([]),
    });

    expect(await listICloudLinkItems(TOKEN)).toBeNull();
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
