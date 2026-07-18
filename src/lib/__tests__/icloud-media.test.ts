import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/icloud-album', () => ({ fetchSharedStreamsAlbum: vi.fn() }));
vi.mock('@/lib/icloud-link', () => ({ fetchCloudKitAlbum: vi.fn() }));

import { fetchSharedStreamsAlbum } from '@/lib/icloud-album';
import { fetchCloudKitAlbum } from '@/lib/icloud-link';
import { fetchICloudMedia } from '@/lib/icloud-media';

const mockLegacy = vi.mocked(fetchSharedStreamsAlbum);
const mockLive = vi.mocked(fetchCloudKitAlbum);

const NEW_ALBUM = 'https://photos.icloud.com/shared/album/03c4SA2q7HwyPw7YOwfXTn0mg';
const LEGACY_ALBUM = 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC';
const PHOTO = { url: 'https://cvws.icloud-content.com/x', type: 'image' as const, guid: 'g' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchICloudMedia', () => {
  it('routes a new-format album to the CloudKit backend', async () => {
    mockLive.mockResolvedValue([PHOTO]);

    const items = await fetchICloudMedia(NEW_ALBUM);

    expect(items).toEqual([PHOTO]);
    expect(mockLive).toHaveBeenCalledWith('03c4SA2q7HwyPw7YOwfXTn0mg');
    expect(mockLegacy).not.toHaveBeenCalled();
  });

  it('routes a legacy album to the sharedstreams backend', async () => {
    mockLegacy.mockResolvedValue([PHOTO]);

    const items = await fetchICloudMedia(LEGACY_ALBUM);

    expect(items).toEqual([PHOTO]);
    expect(mockLegacy).toHaveBeenCalledWith('B125ON9t3mbLNC');
    expect(mockLive).not.toHaveBeenCalled();
  });

  it('maps a null CloudKit result (private/expired) to an empty list', async () => {
    mockLive.mockResolvedValue(null);
    expect(await fetchICloudMedia(NEW_ALBUM)).toEqual([]);
  });

  it('returns an empty list for an unrecognized link', async () => {
    expect(await fetchICloudMedia('not a link')).toEqual([]);
    expect(mockLegacy).not.toHaveBeenCalled();
    expect(mockLive).not.toHaveBeenCalled();
  });
});
