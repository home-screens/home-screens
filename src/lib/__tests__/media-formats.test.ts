import { describe, it, expect } from 'vitest';
import { extensionForContentType, mediaKindOf } from '@/lib/media-formats';

describe('extensionForContentType', () => {
  it.each([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif'],
    ['image/avif', '.avif'],
    ['video/mp4', '.mp4'],
    ['video/quicktime', '.mov'],
    ['video/webm', '.webm'],
  ])('saves %s as %s', (type, ext) => {
    expect(extensionForContentType(type)).toBe(ext);
    // Every answer is a name the library lists as media.
    expect(mediaKindOf(`x${ext}`)).toBe(type.split('/')[0] === 'image' ? 'image' : 'video');
  });

  it('ignores parameters, spaces and case', () => {
    expect(extensionForContentType('image/jpeg; charset=binary')).toBe('.jpg');
    expect(extensionForContentType('  IMAGE/PNG ')).toBe('.png');
  });

  it('refuses what the display cannot show or should not take from another service', () => {
    for (const type of ['image/tiff', 'image/heic', 'image/bmp', 'image/svg+xml', 'text/html', 'application/octet-stream', '', null, undefined]) {
      expect(extensionForContentType(type)).toBeNull();
    }
  });

  it('answers only the asked-for kind', () => {
    expect(extensionForContentType('image/png', 'image')).toBe('.png');
    expect(extensionForContentType('video/mp4', 'image')).toBeNull();
    expect(extensionForContentType('video/mp4', 'video')).toBe('.mp4');
    expect(extensionForContentType('image/png', 'video')).toBeNull();
  });
});
