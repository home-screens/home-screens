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

import { fetchSharedStreamsAlbumForImport, findSharedStreamsItem, listSharedStreamsAlbum } from '@/lib/icloud-album';
import { fetchCloudKitAlbumForImport, findCloudKitItem, listCloudKitAlbum } from '@/lib/icloud-link';
import { fetchICloudMediaForImport, findICloudItem, listICloudAlbum } from '@/lib/icloud-media';

const mockLegacyList = vi.mocked(listSharedStreamsAlbum);
const mockLegacyFind = vi.mocked(findSharedStreamsItem);
const mockLiveList = vi.mocked(listCloudKitAlbum);
const mockLiveFind = vi.mocked(findCloudKitItem);

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
