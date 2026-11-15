import { describe, it, expect } from 'vitest';
import { extensionForContentType, mediaKindOf, sniffImageContentType } from '@/lib/media-formats';

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

describe('sniffImageContentType', () => {
  const bytes = (...parts: Array<number[] | string>) => new Uint8Array(
    parts.flatMap((part) => (typeof part === 'string' ? [...part].map((char) => char.charCodeAt(0)) : part)),
  );

  it.each([
    ['image/jpeg', bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'JFIF')],
    ['image/png', bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d])],
    ['image/gif', bytes('GIF89a', [1, 0, 1, 0])],
    ['image/gif', bytes('GIF87a', [1, 0, 1, 0])],
    ['image/webp', bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 ')],
    ['image/avif', bytes([0, 0, 0, 0x20], 'ftypavif')],
  ])('reads %s from the first bytes', (type, head) => {
    expect(sniffImageContentType(head)).toBe(type);
  });

  it('has no answer for bytes that are not a picture the wall can show', () => {
    // HEIC shares AVIF's container; only the brand tells them apart.
    expect(sniffImageContentType(bytes([0, 0, 0, 0x18], 'ftypheic'))).toBeNull();
    expect(sniffImageContentType(bytes([0, 0, 0, 0x18], 'ftypmp42'))).toBeNull();
    expect(sniffImageContentType(bytes('RIFF', [0x24, 0, 0, 0], 'WAVEfmt '))).toBeNull();
    expect(sniffImageContentType(bytes('<svg xmlns='))).toBeNull();
    expect(sniffImageContentType(bytes([0xff, 0xd8]))).toBeNull();
    expect(sniffImageContentType(new Uint8Array())).toBeNull();
  });
});
