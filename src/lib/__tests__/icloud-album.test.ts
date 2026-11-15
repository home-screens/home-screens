import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

import { promises as fs } from 'fs';
import path from 'path';
import { fetchWithTimeout } from '@/lib/api-utils';
import {
  clearICloudCaches,
  fetchSharedStreamsAlbumForImport,
  findSharedStreamsItem,
  getICloudBaseUrl,
  listSharedStreamsAlbum,
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

const TOKEN = 'B125ON9t3mbLNC';

/** The bodies of the webstream calls made so far. */
function webstreamBodies(): Array<{ streamCtag: unknown }> {
  return mockFetch.mock.calls
    .filter(([url]) => String(url).endsWith('/webstream'))
    .map(([, init]) => JSON.parse(init?.body as string));
}

function callsTo(endpoint: 'webstream' | 'webasseturls'): number {
  return mockFetch.mock.calls.filter(([url]) => String(url).endsWith(`/${endpoint}`)).length;
}

/** Let a read that was set off behind an answer finish. */
async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(async () => {
  vi.clearAllMocks();
  await clearICloudCaches();
});

afterEach(() => {
  vi.useRealTimers();
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

  it('accepts the newer URL-safe base64 token from a share link', () => {
    const token = 'D20v3Co2e_yw_F4HuHxf-CG9_vgCAEQARogaoJzshFVhowQuFHzlnWDiM0bWgl5JpBS53glgiYNxH8';
    expect(parseICloudAlbumToken(`https://www.icloud.com/sharedalbum/#${token}`)).toBe(token);
  });

  it('keeps bare tokens and other URLs\' fragments to pure base62', () => {
    // A bare '-'/'_' token is an iCloud Link short GUID, not an album.
    expect(parseICloudAlbumToken('0f0a3hdUxHZ0-C8uQ7Dq1JxLw')).toBeNull();
    expect(parseICloudAlbumToken('https://cdn.example.com/clip.mp4#t_10-20')).toBeNull();
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

  it('derives the partition for a newer URL-safe base64 token', () => {
    // 'D' prefix, '2','0' → 2*62+0 = 124 (the host Apple's own page calls)
    expect(getICloudBaseUrl('D20v3Co2e_yw_F4H'))
      .toBe('https://p124-sharedstreams.icloud.com/D20v3Co2e_yw_F4H/sharedstreams/');
  });

  it('uses a single base62 char for "A" tokens and zero-pads', () => {
    // 'A' prefix → partition from token[1]; '7' → 7 → p07
    expect(getICloudBaseUrl('A7bcdefgh'))
      .toBe('https://p07-sharedstreams.icloud.com/A7bcdefgh/sharedstreams/');
  });
});

describe('listSharedStreamsAlbum', () => {
  it('names the photos and videos of an album without asking Apple for a single link', async () => {
    routeFetch({ webstream: () => webstreamResponse([photoItem('p1'), videoItem('v1')]) });

    expect(await listSharedStreamsAlbum(TOKEN)).toEqual([
      { guid: 'p1', type: 'image', hasPoster: false },
      { guid: 'v1', type: 'video', hasPoster: true },
    ]);
    expect(callsTo('webasseturls')).toBe(0);
  });

  it('asks with a well-formed tag Apple never issued, so the answer is the whole album', async () => {
    routeFetch({ webstream: () => webstreamResponse([photoItem('p1')]) });

    await listSharedStreamsAlbum(TOKEN);

    // Never null: a tagless request is answered against the last tag Apple
    // was sent, and comes back empty once a web page has sent the current one.
    expect(webstreamBodies()).toEqual([{ streamCtag: 'FT=-@RU=00000000-0000-0000-0000-000000000000@S=0' }]);
  });

  it('falls back to the tagless request when the tag is refused', async () => {
    mockFetch.mockImplementation(async (_url, init) => (
      JSON.parse(init?.body as string).streamCtag === null
        ? webstreamResponse([photoItem('p1')])
        : new Response('', { status: 400 })
    ));

    expect(await listSharedStreamsAlbum(TOKEN)).toHaveLength(1);
    expect(webstreamBodies().map((body) => body.streamCtag)).toEqual([expect.any(String), null]);
  });

  it('gives Apple long enough to answer a big album', async () => {
    routeFetch({ webstream: () => webstreamResponse([photoItem('p1')]) });

    await listSharedStreamsAlbum(TOKEN);

    // A live 761-item album took 50 to 55 seconds.
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ timeout: 90_000, retries: 1 });
  });

  it('follows the 330 partition redirect from the response body', async () => {
    const calls: string[] = [];
    mockFetch.mockImplementation(async (url) => {
      const target = String(url);
      calls.push(target);
      if (target.startsWith('https://p64-')) {
        return new Response(JSON.stringify({ 'X-Apple-MMe-Host': 'p42-sharedstreams.icloud.com' }), { status: 330 });
      }
      return webstreamResponse([photoItem('p1')]);
    });

    expect(await listSharedStreamsAlbum(TOKEN)).toHaveLength(1);
    expect(calls[0]).toContain('p64-sharedstreams.icloud.com');
    expect(calls[1]).toContain('p42-sharedstreams.icloud.com');
  });

  it('refuses a redirect to a host that is not Apple\'s, and does not call that a dead link', async () => {
    routeFetch({
      webstream: () => new Response(JSON.stringify({ 'X-Apple-MMe-Host': 'evil.example.com' }), { status: 330 }),
    });

    await expect(listSharedStreamsAlbum(TOKEN)).rejects.toThrow('redirect');
    // Only the initial webstream call: the redirect target was never fetched.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('answers null for a 404 (album gone or public website off)', async () => {
    routeFetch({ webstream: () => new Response('', { status: 404 }) });
    expect(await listSharedStreamsAlbum(TOKEN)).toBeNull();
  });

  it('throws on a 5xx, which is Apple not answering and not a dead link', async () => {
    routeFetch({ webstream: () => new Response('', { status: 500 }) });
    await expect(listSharedStreamsAlbum(TOKEN)).rejects.toThrow('500');
  });

  it('throws on an answer it cannot read rather than calling the album gone', async () => {
    routeFetch({ webstream: () => new Response('not json', { status: 200 }) });
    await expect(listSharedStreamsAlbum(TOKEN)).rejects.toThrow('photo list');
  });

  it('throws on an answer with no photo list in it', async () => {
    routeFetch({ webstream: () => new Response(JSON.stringify({ streamName: 'Family' }), { status: 200 }) });
    await expect(listSharedStreamsAlbum(TOKEN)).rejects.toThrow('photo list');
  });

  it('does not remember a failed read: the next caller asks Apple again', async () => {
    let fail = true;
    routeFetch({ webstream: () => (fail ? new Response('', { status: 503 }) : webstreamResponse([photoItem('p1')])) });

    await expect(listSharedStreamsAlbum(TOKEN)).rejects.toThrow('503');
    fail = false;
    expect(await listSharedStreamsAlbum(TOKEN)).toHaveLength(1);
  });

  it('skips items with unusable derivatives instead of failing the album', async () => {
    routeFetch({
      webstream: () => webstreamResponse([
        photoItem('p1'),
        { photoGuid: 'broken', derivatives: {} },
        { mediaAssetType: 'video', derivatives: { '720p': { checksum: 'orphan' } } }, // no photoGuid
      ]),
    });

    expect((await listSharedStreamsAlbum(TOKEN))?.map((i) => i.guid)).toEqual(['p1']);
  });

  it('answers from its kept copy without asking Apple again', async () => {
    routeFetch({ webstream: () => webstreamResponse([photoItem('p1')]) });

    await listSharedStreamsAlbum(TOKEN);
    await listSharedStreamsAlbum(TOKEN);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent cold reads into one Apple call', async () => {
    let releaseWebstream!: (r: Response) => void;
    routeFetch({
      webstream: () => new Promise<Response>((resolve) => { releaseWebstream = resolve; }),
    });

    // Three displays asking for an album the hub has not read yet.
    const reads = [listSharedStreamsAlbum(TOKEN), listSharedStreamsAlbum(TOKEN), listSharedStreamsAlbum(TOKEN)];
    await vi.waitFor(() => expect(callsTo('webstream')).toBe(1));
    releaseWebstream(webstreamResponse([photoItem('p1')]));
    const results = await Promise.all(reads);

    expect(results.map((r) => r?.length)).toEqual([1, 1, 1]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not ask again about an album that is gone for a minute', async () => {
    vi.useFakeTimers();
    routeFetch({ webstream: () => new Response('', { status: 404 }) });

    await listSharedStreamsAlbum(TOKEN);
    await listSharedStreamsAlbum(TOKEN);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // A fixed-up album is found within a minute.
    vi.advanceTimersByTime(61_000);
    routeFetch({ webstream: () => webstreamResponse([photoItem('p1')]) });
    expect(await listSharedStreamsAlbum(TOKEN)).toHaveLength(1);
  });

  describe('once the kept copy has aged', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      routeFetch({ webstream: () => webstreamResponse([photoItem('p1')]) });
      await listSharedStreamsAlbum(TOKEN);
      vi.advanceTimersByTime(5 * 60_000 + 1);
      mockFetch.mockClear();
    });

    it('answers at once from the copy in hand and reads Apple behind it', async () => {
      let releaseWebstream!: (r: Response) => void;
      routeFetch({ webstream: () => new Promise<Response>((resolve) => { releaseWebstream = resolve; }) });

      // Apple has not answered, and may not for most of a minute.
      expect((await listSharedStreamsAlbum(TOKEN))?.map((i) => i.guid)).toEqual(['p1']);
      expect(callsTo('webstream')).toBe(1);

      // Callers in the meantime neither wait nor start a second read.
      await listSharedStreamsAlbum(TOKEN);
      expect(callsTo('webstream')).toBe(1);

      releaseWebstream(webstreamResponse([photoItem('p1'), photoItem('p2')]));
      await settle();
      expect((await listSharedStreamsAlbum(TOKEN))?.map((i) => i.guid)).toEqual(['p1', 'p2']);
    });

    it('keeps the copy when the new read fails, and waits a minute before trying again', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      routeFetch({ webstream: () => new Response('', { status: 503 }) });

      expect(await listSharedStreamsAlbum(TOKEN)).toHaveLength(1);
      await settle();
      expect(callsTo('webstream')).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);

      expect(await listSharedStreamsAlbum(TOKEN)).toHaveLength(1);
      await settle();
      expect(callsTo('webstream')).toBe(1);

      vi.advanceTimersByTime(60_000);
      expect(await listSharedStreamsAlbum(TOKEN)).toHaveLength(1);
      await settle();
      expect(callsTo('webstream')).toBe(2);
      warn.mockRestore();
    });

    it('does not let an empty answer wipe an album whose photos Apple still has links for', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // What Apple answers a client it believes is up to date.
      routeFetch({ webstream: () => webstreamResponse([]) });

      await listSharedStreamsAlbum(TOKEN);
      await settle();

      expect(callsTo('webasseturls')).toBe(1);
      expect((await listSharedStreamsAlbum(TOKEN))?.map((i) => i.guid)).toEqual(['p1']);
      expect(warn).toHaveBeenCalledTimes(1);
      // Counted as a failed refresh: Apple is not asked again straight away.
      await settle();
      expect(callsTo('webstream')).toBe(1);
      warn.mockRestore();
    });

    it('takes an empty answer when the photos really are gone', async () => {
      routeFetch({
        webstream: () => webstreamResponse([]),
        webasseturls: () => new Response(JSON.stringify({ items: {}, locations: {} }), { status: 200 }),
      });

      await listSharedStreamsAlbum(TOKEN);
      await settle();

      expect(await listSharedStreamsAlbum(TOKEN)).toEqual([]);
    });

    it('drops the copy when the album turns out to be gone', async () => {
      routeFetch({ webstream: () => new Response('', { status: 404 }) });

      await listSharedStreamsAlbum(TOKEN);
      await settle();

      expect(await listSharedStreamsAlbum(TOKEN)).toBeNull();
    });
  });

  it('waits for Apple again once the kept copy is a day old', async () => {
    vi.useFakeTimers();
    routeFetch({ webstream: () => webstreamResponse([photoItem('p1')]) });
    await listSharedStreamsAlbum(TOKEN);
    vi.advanceTimersByTime(24 * 60 * 60_000 + 1);

    routeFetch({ webstream: () => new Response('', { status: 503 }) });
    await expect(listSharedStreamsAlbum(TOKEN)).rejects.toThrow('503');
  });
});

describe('after a hub restart', () => {
  /** What a hub that ran before left in data/icloud-albums.json. */
  async function leftOnDisk(entries: unknown[]) {
    await fs.writeFile(path.join('data', 'icloud-albums.json'), JSON.stringify({
      [`sharedstreams:${TOKEN}`]: { entries, readAt: Date.now() - 60_000 },
    }));
  }

  it('lists the album from disk without waiting for Apple, and can still serve its items', async () => {
    await leftOnDisk([
      { guid: 'p1', type: 'image', mainChecksum: 'p1-large' },
      { guid: 'v1', type: 'video', mainChecksum: 'v1-720p', posterChecksum: 'v1-poster' },
      { guid: 'broken', type: 'image' },
    ]);
    // Apple's album read never answers; links are a separate, quick call.
    routeFetch({ webstream: () => new Promise<Response>(() => {}) });

    expect(await listSharedStreamsAlbum(TOKEN)).toEqual([
      { guid: 'p1', type: 'image', hasPoster: false },
      { guid: 'v1', type: 'video', hasPoster: true },
    ]);
    expect(await findSharedStreamsItem(TOKEN, 'p1')).toEqual({
      url: 'https://cvws.icloud-content.com/S/p1-large', type: 'image', guid: 'p1',
    });
    // The read Apple owes is set off once, behind the answers.
    expect(callsTo('webstream')).toBe(1);
  });

  it('writes down what it read, without any link', async () => {
    routeFetch({ webstream: () => webstreamResponse([photoItem('p1')]) });
    await listSharedStreamsAlbum(TOKEN);
    await findSharedStreamsItem(TOKEN, 'p1');

    await vi.waitFor(async () => {
      const saved = await fs.readFile(path.join('data', 'icloud-albums.json'), 'utf-8');
      expect(JSON.parse(saved)[`sharedstreams:${TOKEN}`].entries).toEqual([{ guid: 'p1', type: 'image', mainChecksum: 'p1-large' }]);
      expect(saved).not.toContain('icloud-content.com');
    });
  });
});

describe('findSharedStreamsItem', () => {
  it('looks up the links of the one item asked for', async () => {
    const asked: string[][] = [];
    routeFetch({
      webstream: () => webstreamResponse([photoItem('p1'), photoItem('p2'), videoItem('v1')]),
      webasseturls: (body) => {
        asked.push(body.photoGuids);
        return assetUrlsResponse(body.photoGuids);
      },
    });

    // Photo: largest numeric derivative (2049) wins.
    expect(await findSharedStreamsItem(TOKEN, 'p2')).toEqual({
      url: 'https://cvws.icloud-content.com/S/p2-large', type: 'image', guid: 'p2',
    });
    // Video: highest quality (720p) wins; PosterFrame is the poster.
    expect(await findSharedStreamsItem(TOKEN, 'v1')).toEqual({
      url: 'https://cvws.icloud-content.com/S/v1-720',
      type: 'video',
      guid: 'v1',
      posterUrl: 'https://cvws.icloud-content.com/S/v1-poster',
    });
    expect(asked).toEqual([['p2'], ['v1']]);
  });

  it('answers null for a guid the album does not have, without asking Apple about it', async () => {
    routeFetch({ webstream: () => webstreamResponse([photoItem('p1')]) });

    expect(await findSharedStreamsItem(TOKEN, 'made-up')).toBeNull();
    expect(callsTo('webasseturls')).toBe(0);
  });

  it('answers null for an album that is gone', async () => {
    routeFetch({ webstream: () => new Response('', { status: 404 }) });
    expect(await findSharedStreamsItem(TOKEN, 'p1')).toBeNull();
  });

  it('answers null when Apple has no link for the item any more', async () => {
    routeFetch({
      webstream: () => webstreamResponse([photoItem('p1')]),
      webasseturls: () => new Response(JSON.stringify({ items: {}, locations: {} }), { status: 200 }),
    });
    expect(await findSharedStreamsItem(TOKEN, 'p1')).toBeNull();
  });

  it('keeps an item\'s links for five minutes, so a video\'s range requests share one lookup', async () => {
    vi.useFakeTimers();
    routeFetch({ webstream: () => webstreamResponse([videoItem('v1')]) });

    await findSharedStreamsItem(TOKEN, 'v1');
    await findSharedStreamsItem(TOKEN, 'v1');
    expect(callsTo('webasseturls')).toBe(1);

    // Links die after 20 minutes; a kept one is never near that old.
    vi.advanceTimersByTime(5 * 60_000 + 1);
    await findSharedStreamsItem(TOKEN, 'v1');
    expect(callsTo('webasseturls')).toBe(2);
  });

  it('follows the partition redirect on a link lookup too', async () => {
    const calls: string[] = [];
    mockFetch.mockImplementation(async (url, init) => {
      const target = String(url);
      calls.push(target);
      if (target.startsWith('https://p64-')) {
        return new Response(JSON.stringify({ 'X-Apple-MMe-Host': 'p42-sharedstreams.icloud.com' }), { status: 330 });
      }
      if (target.endsWith('/webstream')) return webstreamResponse([photoItem('p1')]);
      return assetUrlsResponse(JSON.parse(init?.body as string).photoGuids);
    });

    await listSharedStreamsAlbum(TOKEN);
    // The kept host is dropped when a read fails; the kept album outlives it.
    routeFetch({ webstream: () => new Response('', { status: 503 }) });
    vi.useFakeTimers();
    vi.advanceTimersByTime(5 * 60_000 + 1);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await listSharedStreamsAlbum(TOKEN);
    await settle();
    warn.mockRestore();

    calls.length = 0;
    mockFetch.mockImplementation(async (url, init) => {
      const target = String(url);
      calls.push(target);
      if (target.startsWith('https://p64-')) {
        return new Response(JSON.stringify({ 'X-Apple-MMe-Host': 'p42-sharedstreams.icloud.com' }), { status: 330 });
      }
      return assetUrlsResponse(JSON.parse(init?.body as string).photoGuids);
    });

    expect(await findSharedStreamsItem(TOKEN, 'p1')).toMatchObject({ guid: 'p1' });
    expect(calls).toEqual([
      'https://p64-sharedstreams.icloud.com/B125ON9t3mbLNC/sharedstreams/webasseturls',
      'https://p42-sharedstreams.icloud.com/B125ON9t3mbLNC/sharedstreams/webasseturls',
    ]);
  });
});

describe('fetchSharedStreamsAlbumForImport', () => {
  it('reads every item with its link', async () => {
    routeFetch({ webstream: () => webstreamResponse([photoItem('p1'), videoItem('v1')]) });

    expect(await fetchSharedStreamsAlbumForImport(TOKEN)).toEqual([
      { url: 'https://cvws.icloud-content.com/S/p1-large', type: 'image', guid: 'p1' },
      {
        url: 'https://cvws.icloud-content.com/S/v1-720',
        type: 'video',
        guid: 'v1',
        posterUrl: 'https://cvws.icloud-content.com/S/v1-poster',
      },
    ]);
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

    expect(await fetchSharedStreamsAlbumForImport(TOKEN)).toHaveLength(60);
    expect(batchSizes).toEqual([25, 25, 10]);
  });

  it('skips items whose checksum is missing from webasseturls', async () => {
    routeFetch({
      webstream: () => webstreamResponse([photoItem('p1'), photoItem('p2')]),
      webasseturls: () => assetUrlsResponse(['p1']),
    });

    expect((await fetchSharedStreamsAlbumForImport(TOKEN))?.map((i) => i.guid)).toEqual(['p1']);
  });

  it('says an album that is gone is gone', async () => {
    routeFetch({ webstream: () => new Response('', { status: 404 }) });
    expect(await fetchSharedStreamsAlbumForImport(TOKEN)).toBeNull();
  });

  it('reads an album with nothing in it as empty, not gone', async () => {
    routeFetch({ webstream: () => webstreamResponse([]) });
    expect(await fetchSharedStreamsAlbumForImport(TOKEN)).toEqual([]);
  });

  it('reads Apple afresh rather than the slideshow\'s kept copy', async () => {
    routeFetch({ webstream: () => webstreamResponse([]) });
    await listSharedStreamsAlbum(TOKEN);
    await fetchSharedStreamsAlbumForImport(TOKEN);
    expect(callsTo('webstream')).toBe(2);
  });
});
