import { describe, it, expect } from 'vitest';
import {
  parseICloudSharedAlbumUrl,
  parseICloudAlbumToken,
  detectICloudSource,
} from '@/lib/icloud-parse';

const NEW_ALBUM = 'https://photos.icloud.com/shared/album/03c4SA2q7HwyPw7YOwfXTn0mg';
const LEGACY_ALBUM = 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC';

describe('parseICloudSharedAlbumUrl', () => {
  it('extracts the token from a new-format shared album URL', () => {
    expect(parseICloudSharedAlbumUrl(NEW_ALBUM)).toBe('03c4SA2q7HwyPw7YOwfXTn0mg');
  });

  it('tolerates a trailing slash and no scheme', () => {
    expect(parseICloudSharedAlbumUrl('photos.icloud.com/shared/album/03c4SA2q7HwyPw7YOwfXTn0mg/'))
      .toBe('03c4SA2q7HwyPw7YOwfXTn0mg');
  });

  it('rejects the legacy album URL, iCloud Links, and bare tokens', () => {
    expect(parseICloudSharedAlbumUrl(LEGACY_ALBUM)).toBeNull();
    expect(parseICloudSharedAlbumUrl('https://share.icloud.com/photos/0f0a3hdUxHZ0-C8uQ7Dq1JxLw')).toBeNull();
    expect(parseICloudSharedAlbumUrl('03c4SA2q7HwyPw7YOwfXTn0mg')).toBeNull();
  });

  it('rejects a /shared/album/ path on a non-icloud host', () => {
    expect(parseICloudSharedAlbumUrl('https://evil.example.com/shared/album/03c4SA2q7HwyPw7YOwfXTn0mg')).toBeNull();
  });
});

describe('detectICloudSource with the new album format', () => {
  it('classifies the new-format album as a live "album" source', () => {
    expect(detectICloudSource(NEW_ALBUM)).toBe('album');
  });

  it('still classifies the legacy album and iCloud Link', () => {
    expect(detectICloudSource(LEGACY_ALBUM)).toBe('album');
    expect(detectICloudSource('https://share.icloud.com/photos/0f0a3hdUxHZ0-C8uQ7Dq1JxLw')).toBe('link');
  });
});

describe('parseICloudAlbumToken is unchanged for legacy links', () => {
  it('does not extract a token from the new-format URL (routes via URL shape instead)', () => {
    expect(parseICloudAlbumToken(NEW_ALBUM)).toBeNull();
    expect(parseICloudAlbumToken(LEGACY_ALBUM)).toBe('B125ON9t3mbLNC');
  });
});
