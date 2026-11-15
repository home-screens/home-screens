import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/icloud-album', () => ({
  listSharedStreamsAlbum: vi.fn(),
  findSharedStreamsItem: vi.fn(),
  fetchSharedStreamsAlbumForImport: vi.fn(),
}));
vi.mock('@/lib/icloud-link', () => ({
  listCloudKitAlbum: vi.fn(),
  findCloudKitItem: vi.fn(),
  fetchCloudKitAlbumForImport: vi.fn(),
}));
vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchSharedStreamsAlbumForImport, findSharedStreamsItem, listSharedStreamsAlbum } from '@/lib/icloud-album';
import { fetchCloudKitAlbumForImport, findCloudKitItem, listCloudKitAlbum } from '@/lib/icloud-link';
import { fetchWithTimeout } from '@/lib/api-utils';
import { fetchICloudMediaForImport, fetchICloudPicture, findICloudItem, listICloudAlbum } from '@/lib/icloud-media';

const mockLegacyList = vi.mocked(listSharedStreamsAlbum);
const mockLegacyFind = vi.mocked(findSharedStreamsItem);
const mockLiveList = vi.mocked(listCloudKitAlbum);
const mockLiveFind = vi.mocked(findCloudKitItem);
const mockFetch = vi.mocked(fetchWithTimeout);

const NEW_ALBUM = 'https://photos.icloud.com/shared/album/03c4SA2q7HwyPw7YOwfXTn0mg';
const LEGACY_ALBUM = 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC';
const PHOTO = { url: 'https://cvws.icloud-content.com/x', type: 'image' as const, guid: 'g' };
const VIDEO = { url: 'https://cvws.icloud-content.com/v', type: 'video' as const, guid: 'v', posterUrl: 'https://cvws.icloud-content.com/v.jpg' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listICloudAlbum', () => {
  const ENTRIES = [
    { guid: 'g', type: 'image' as const, hasPoster: false },
    { guid: 'v', type: 'video' as const, hasPoster: true },
  ];

  it('lists a new-format album from the CloudKit backend', async () => {
    mockLiveList.mockResolvedValue(ENTRIES);

    expect(await listICloudAlbum(NEW_ALBUM)).toEqual(ENTRIES);
    expect(mockLiveList).toHaveBeenCalledWith('03c4SA2q7HwyPw7YOwfXTn0mg');
    expect(mockLegacyList).not.toHaveBeenCalled();
  });

  it('lists a legacy album from the sharedstreams backend', async () => {
    mockLegacyList.mockResolvedValue(ENTRIES);

    expect(await listICloudAlbum(LEGACY_ALBUM)).toEqual(ENTRIES);
    expect(mockLegacyList).toHaveBeenCalledWith('B125ON9t3mbLNC');
    expect(mockLiveList).not.toHaveBeenCalled();
  });

  it('maps an album that is gone to an empty list, on either backend', async () => {
    mockLiveList.mockResolvedValue(null);
    mockLegacyList.mockResolvedValue(null);
    expect(await listICloudAlbum(NEW_ALBUM)).toEqual([]);
    expect(await listICloudAlbum(LEGACY_ALBUM)).toEqual([]);
  });

  it('returns an empty list for an unrecognized link', async () => {
    expect(await listICloudAlbum('not a link')).toEqual([]);
    expect(mockLegacyList).not.toHaveBeenCalled();
    expect(mockLiveList).not.toHaveBeenCalled();
  });

  it('lets a failed read through, so it is never shown as an empty album', async () => {
    mockLegacyList.mockRejectedValue(new Error('iCloud webstream failed with status 503'));
    await expect(listICloudAlbum(LEGACY_ALBUM)).rejects.toThrow('503');
    mockLiveList.mockRejectedValue(new Error('iCloud link query failed with status 503'));
    await expect(listICloudAlbum(NEW_ALBUM)).rejects.toThrow('503');
  });
});

describe('findICloudItem', () => {
  it('asks the CloudKit backend for a new-format album\'s item', async () => {
    mockLiveFind.mockResolvedValue(VIDEO);
    expect(await findICloudItem(NEW_ALBUM, 'v')).toEqual(VIDEO);
    expect(mockLiveFind).toHaveBeenCalledWith('03c4SA2q7HwyPw7YOwfXTn0mg', 'v');
    expect(mockLegacyFind).not.toHaveBeenCalled();
  });

  it('asks the sharedstreams backend for a legacy album\'s item', async () => {
    mockLegacyFind.mockResolvedValue(PHOTO);
    expect(await findICloudItem(LEGACY_ALBUM, 'g')).toEqual(PHOTO);
    expect(mockLegacyFind).toHaveBeenCalledWith('B125ON9t3mbLNC', 'g');
    expect(mockLiveFind).not.toHaveBeenCalled();
  });

  it('has nothing for an unrecognized link or an item the album does not have', async () => {
    mockLiveFind.mockResolvedValue(null);
    expect(await findICloudItem('not a link', 'g')).toBeNull();
    expect(await findICloudItem(NEW_ALBUM, 'g')).toBeNull();
  });
});

describe('fetchICloudMediaForImport', () => {
  it('reads either kind of album whole, and says when one is gone', async () => {
    vi.mocked(fetchCloudKitAlbumForImport).mockResolvedValue([PHOTO]);
    vi.mocked(fetchSharedStreamsAlbumForImport).mockResolvedValue(null);

    expect(await fetchICloudMediaForImport(NEW_ALBUM)).toEqual([PHOTO]);
    expect(fetchCloudKitAlbumForImport).toHaveBeenCalledWith('03c4SA2q7HwyPw7YOwfXTn0mg');
    expect(await fetchICloudMediaForImport(LEGACY_ALBUM)).toBeNull();
    expect(fetchSharedStreamsAlbumForImport).toHaveBeenCalledWith('B125ON9t3mbLNC');
    expect(await fetchICloudMediaForImport('not a link')).toBeNull();
  });
});

describe('fetchICloudPicture', () => {
  const URL = 'https://cvws.icloud-content.com/B/photo';
  const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00];
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48];

  /** A body that arrives a few bytes at a time, as a download does. */
  function inPieces(bytes: number[], size: number): ReadableStream<Uint8Array> {
    let at = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (at >= bytes.length) return controller.close();
        controller.enqueue(new Uint8Array(bytes.slice(at, at + size)));
        at += size;
      },
    });
  }

  function answer(bytes: number[], contentType: string | null, size = bytes.length) {
    return new Response(inPieces(bytes, size), { status: 200, headers: contentType ? { 'Content-Type': contentType } : undefined });
  }

  it('names a picture a newer album answers as a plain download, and keeps every byte', async () => {
    mockFetch.mockResolvedValue(answer(JPEG, 'application/octet-stream', 5));
    const res = await fetchICloudPicture(URL);

    expect(mockFetch).toHaveBeenCalledWith(URL, { timeout: 30_000 });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual(JPEG);
  });

  it('reads the type from the bytes, not from a guess: a PNG is a PNG', async () => {
    mockFetch.mockResolvedValue(answer(PNG, 'application/octet-stream', 1));
    const res = await fetchICloudPicture(URL);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual(PNG);
  });

  it('names a picture that came with no type at all', async () => {
    mockFetch.mockResolvedValue(answer(JPEG, null));
    expect((await fetchICloudPicture(URL)).headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('hands on an answer Apple already named as a picture untouched', async () => {
    const named = answer(PNG, 'image/jpeg');
    mockFetch.mockResolvedValue(named);
    expect(await fetchICloudPicture(URL)).toBe(named);
  });

  it('keeps the type Apple gave for bytes that are no picture the wall can show', async () => {
    const heic = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0];
    mockFetch.mockResolvedValue(answer(heic, 'application/octet-stream'));
    const res = await fetchICloudPicture(URL);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual(heic);
  });

  it('copes with a picture shorter than the bytes it looks at', async () => {
    mockFetch.mockResolvedValue(answer([0xff, 0xd8, 0xff], 'application/octet-stream'));
    const res = await fetchICloudPicture(URL);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect((await res.arrayBuffer()).byteLength).toBe(3);
  });

  it('hands on a refusal as it is', async () => {
    const refused = new Response('gone', { status: 410 });
    mockFetch.mockResolvedValue(refused);
    expect(await fetchICloudPicture(URL)).toBe(refused);
  });
});
