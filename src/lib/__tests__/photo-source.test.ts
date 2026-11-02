import { describe, it, expect } from 'vitest';
import type { PhotoSource } from '@/types/config';
import {
  PHOTO_SOURCE_KINDS,
  canPlayVideo,
  clampPhotoCount,
  cleanLibraryFolder,
  defaultPhotoSource,
  emptyStateFor,
  isMediaTypes,
  isPhotoSourceKind,
  isPickImportKind,
  isReady,
  isValidPickRef,
  maxPhotoCount,
  needs,
  normalizePhotoSource,
  offeredFor,
  parsePhotoSourceParams,
  photoSourceParams,
  sourceCacheKey,
  usesCount,
  type PhotoSourceKind,
} from '@/lib/photo-source';

/** Every secret saved. */
const ALL_KEYS = {
  immich_url: true, immich_api_key: true, microsoft_client_id: true, unsplash_access_key: true,
};

describe('per-kind rules', () => {
  it.each<[PhotoSourceKind, string[], boolean, boolean, boolean, string]>([
    // kind, secrets, sign-in, plays video, has a count, why empty
    ['library', [], false, true, false, 'addPhotos'],
    ['immich', ['immich_url', 'immich_api_key'], false, true, true, 'checkFilters'],
    ['icloud', [], false, true, true, 'checkLink'],
    ['onedrive', ['microsoft_client_id'], true, false, true, 'checkFolder'],
    ['unsplash', ['unsplash_access_key'], false, false, true, 'checkSearch'],
    ['nasa', [], false, false, true, 'tryLater'],
  ])('%s', (kind, secrets, signIn, video, counted, empty) => {
    expect(needs(kind).secrets).toEqual(secrets);
    expect(needs(kind).signIn).toBe(signIn);
    expect(canPlayVideo(kind)).toBe(video);
    expect(usesCount(kind)).toBe(counted);
    expect(emptyStateFor({ kind })).toBe(empty);
    expect(isPhotoSourceKind(kind)).toBe(true);
    expect(defaultPhotoSource(kind).kind).toBe(kind);
    // A fresh source survives a round trip through the config reader.
    expect(normalizePhotoSource(defaultPhotoSource(kind))).toEqual(defaultPhotoSource(kind));
  });

  it('lists the kinds in the editor order', () => {
    expect(PHOTO_SOURCE_KINDS).toEqual(['library', 'immich', 'icloud', 'onedrive', 'unsplash', 'nasa']);
    expect(isPhotoSourceKind('dropbox')).toBe(false);
    expect(isPhotoSourceKind(undefined)).toBe(false);
  });

  it('starts Unsplash on some search words and everything else empty', () => {
    expect(defaultPhotoSource('library')).toEqual({ kind: 'library', folder: '' });
    expect(defaultPhotoSource('unsplash')).toEqual({ kind: 'unsplash', query: 'nature landscape' });
    expect(defaultPhotoSource('icloud')).toEqual({ kind: 'icloud', albumUrl: '' });
    expect(defaultPhotoSource('onedrive')).toEqual({ kind: 'onedrive', folderId: '' });
  });
});

describe('offeredFor', () => {
  it('offers the browsable sources for picking one picture', () => {
    expect(offeredFor('pick')).toEqual(['library', 'immich', 'unsplash', 'nasa']);
  });

  it('offers every kind for a stream and for a rotating background', () => {
    expect(offeredFor('stream')).toEqual(PHOTO_SOURCE_KINDS);
    expect(offeredFor('background')).toEqual(PHOTO_SOURCE_KINDS);
  });
});

describe('isReady', () => {
  it.each<PhotoSourceKind>(['library', 'icloud'])('%s needs no key', (kind) => {
    expect(isReady(kind, {})).toBe(true);
    expect(isReady(kind, {}, 'pick')).toBe(true);
  });

  it.each<PhotoSourceKind>(['immich', 'onedrive', 'unsplash'])('%s is ready with every key and not without its own', (kind) => {
    expect(isReady(kind, ALL_KEYS)).toBe(true);
    const missing = { ...ALL_KEYS, [needs(kind).secrets[0]]: false };
    expect(isReady(kind, missing)).toBe(false);
    expect(isReady(kind, missing, 'background')).toBe(false);
  });

  it('wants both Immich secrets, not just one', () => {
    expect(isReady('immich', { immich_url: true })).toBe(false);
    expect(isReady('immich', { immich_api_key: true })).toBe(false);
  });

  it('needs no key for NASA anywhere, as science.nasa.gov asks for none', () => {
    for (const use of ['pick', 'stream', 'background'] as const) expect(isReady('nasa', {}, use)).toBe(true);
    expect(isReady('unsplash', {}, 'pick')).toBe(false);
    expect(isReady('immich', {}, 'pick')).toBe(false);
  });
});

describe('normalizePhotoSource', () => {
  it('reads every good shape and drops unknown fields', () => {
    expect(normalizePhotoSource({ kind: 'library', folder: 'trips', extra: 1 })).toEqual({ kind: 'library', folder: 'trips' });
    expect(normalizePhotoSource({ kind: 'immich', albumId: 'abc-123', personId: 'DEF-456', favoritesOnly: true }))
      .toEqual({ kind: 'immich', albumId: 'abc-123', personId: 'DEF-456', favoritesOnly: true });
    expect(normalizePhotoSource({ kind: 'icloud', albumUrl: '  https://www.icloud.com/sharedalbum/#B0  ' }))
      .toEqual({ kind: 'icloud', albumUrl: 'https://www.icloud.com/sharedalbum/#B0' });
    expect(normalizePhotoSource({ kind: 'onedrive', folderId: 'ABC!123', folderName: 'Family' }))
      .toEqual({ kind: 'onedrive', folderId: 'ABC!123', folderName: 'Family' });
    expect(normalizePhotoSource({ kind: 'unsplash', query: ' lakes ' })).toEqual({ kind: 'unsplash', query: 'lakes' });
    expect(normalizePhotoSource({ kind: 'nasa', query: 'x' })).toEqual({ kind: 'nasa' });
  });

  it('returns null for anything that is not a source', () => {
    for (const value of [null, undefined, 'library', 42, [], {}, { kind: 'dropbox' }, { kind: 7 }]) {
      expect(normalizePhotoSource(value)).toBeNull();
    }
  });

  it('cleans the slashes off a library folder and reads a missing one as the top level', () => {
    expect(normalizePhotoSource({ kind: 'library', folder: '/photos/' })).toEqual({ kind: 'library', folder: 'photos' });
    expect(normalizePhotoSource({ kind: 'library', folder: 'a/b//' })).toEqual({ kind: 'library', folder: 'a/b' });
    expect(normalizePhotoSource({ kind: 'library' })).toEqual({ kind: 'library', folder: '' });
    expect(normalizePhotoSource({ kind: 'library', folder: 5 })).toEqual({ kind: 'library', folder: '' });
    expect(cleanLibraryFolder(' /x/ ')).toBe('x');
  });

  it('drops ids that could not be Immich or OneDrive ids', () => {
    expect(normalizePhotoSource({ kind: 'immich', albumId: '../albums', personId: 'zz', favoritesOnly: 'yes' })).toEqual({ kind: 'immich' });
    expect(normalizePhotoSource({ kind: 'immich', albumId: 'a'.repeat(65) })).toEqual({ kind: 'immich' });
    expect(normalizePhotoSource({ kind: 'onedrive', folderId: 'a b/c' })).toEqual({ kind: 'onedrive', folderId: '' });
  });

  it('holds Unsplash search words to 100 characters', () => {
    const source = normalizePhotoSource({ kind: 'unsplash', query: 'x'.repeat(150) });
    expect(source).toEqual({ kind: 'unsplash', query: 'x'.repeat(100) });
  });
});

describe('sourceCacheKey', () => {
  const key = (source: PhotoSource) => sourceCacheKey(source);

  it.each<[string, PhotoSource, PhotoSource]>([
    ['library folder', { kind: 'library', folder: 'a' }, { kind: 'library', folder: 'b' }],
    ['Immich album', { kind: 'immich', albumId: 'a1' }, { kind: 'immich', albumId: 'a2' }],
    ['Immich person', { kind: 'immich', personId: 'b1' }, { kind: 'immich', personId: 'b2' }],
    ['Immich favorites', { kind: 'immich' }, { kind: 'immich', favoritesOnly: true }],
    ['iCloud link', { kind: 'icloud', albumUrl: 'https://a' }, { kind: 'icloud', albumUrl: 'https://b' }],
    ['OneDrive folder', { kind: 'onedrive', folderId: 'A!1' }, { kind: 'onedrive', folderId: 'A!2' }],
    ['Unsplash words', { kind: 'unsplash', query: 'lakes' }, { kind: 'unsplash', query: 'trees' }],
    ['kind', { kind: 'library', folder: '' }, { kind: 'nasa' }],
  ])('changes with the %s', (_label, a, b) => {
    expect(key(a)).not.toBe(key(b));
  });

  it('ignores what never changes the pictures: a OneDrive label, Unsplash case and spacing, folder slashes', () => {
    expect(key({ kind: 'onedrive', folderId: 'A!1', folderName: 'Old' })).toBe(key({ kind: 'onedrive', folderId: 'A!1', folderName: 'New' }));
    expect(key({ kind: 'unsplash', query: 'Lakes ' })).toBe(key({ kind: 'unsplash', query: 'lakes' }));
    expect(key({ kind: 'library', folder: '/trips/' })).toBe(key({ kind: 'library', folder: 'trips' }));
    expect(key({ kind: 'immich', favoritesOnly: false })).toBe(key({ kind: 'immich' }));
  });

  it('cannot collide across fields that hold delimiter characters', () => {
    expect(key({ kind: 'immich', albumId: 'a', personId: 'b' })).not.toBe(key({ kind: 'immich', albumId: 'a,b' }));
  });
});

describe('counts', () => {
  it('caps Unsplash at one request (30) and every other kind at 200', () => {
    expect(maxPhotoCount('unsplash')).toBe(30);
    for (const kind of PHOTO_SOURCE_KINDS.filter((k) => k !== 'unsplash')) expect(maxPhotoCount(kind)).toBe(200);
  });

  it('clamps to the kind, defaults to 50 (or the cap), and rounds', () => {
    expect(clampPhotoCount(undefined)).toBe(50);
    expect(clampPhotoCount('abc')).toBe(50);
    expect(clampPhotoCount(0)).toBe(50);
    expect(clampPhotoCount(-4)).toBe(50);
    expect(clampPhotoCount(500)).toBe(200);
    expect(clampPhotoCount('120')).toBe(120);
    expect(clampPhotoCount(12.6)).toBe(13);
    expect(clampPhotoCount(0.4)).toBe(1);
    expect(clampPhotoCount(100, 'unsplash')).toBe(30);
    expect(clampPhotoCount(undefined, 'unsplash')).toBe(30);
    expect(clampPhotoCount(10, 'unsplash')).toBe(10);
    expect(clampPhotoCount(300, 'immich')).toBe(200);
  });

  it('knows the three media choices', () => {
    for (const value of ['photos', 'videos', 'both']) expect(isMediaTypes(value)).toBe(true);
    for (const value of ['all', '', null, 1]) expect(isMediaTypes(value)).toBe(false);
  });
});

describe('photoSourceParams and parsePhotoSourceParams', () => {
  it.each<PhotoSource>([
    { kind: 'library', folder: '' },
    { kind: 'library', folder: 'trips/2026' },
    { kind: 'immich' },
    { kind: 'immich', albumId: 'abc-123', personId: 'def-456', favoritesOnly: true },
    { kind: 'icloud', albumUrl: 'https://www.icloud.com/sharedalbum/#B0aG' },
    { kind: 'onedrive', folderId: 'ABC!123' },
    { kind: 'unsplash', query: 'mountains lake' },
    { kind: 'nasa' },
  ])('round-trips %j', (source) => {
    expect(parsePhotoSourceParams(new URLSearchParams(photoSourceParams(source).toString()))).toEqual(source);
  });

  it('leaves the OneDrive label out of the URL', () => {
    const params = photoSourceParams({ kind: 'onedrive', folderId: 'A!1', folderName: 'Family' });
    expect(params.toString()).toBe('kind=onedrive&folderId=A%211');
  });

  it('writes empty fields as absent', () => {
    expect(photoSourceParams({ kind: 'library', folder: '' }).toString()).toBe('kind=library');
    expect(photoSourceParams({ kind: 'icloud', albumUrl: '' }).toString()).toBe('kind=icloud');
    expect(photoSourceParams({ kind: 'immich', favoritesOnly: false }).toString()).toBe('kind=immich');
  });

  it('reads no source from an unknown or missing kind', () => {
    expect(parsePhotoSourceParams(new URLSearchParams(''))).toBeNull();
    expect(parsePhotoSourceParams(new URLSearchParams('kind=dropbox&folder=x'))).toBeNull();
  });

  it('cleans what it reads the same way the config reader does', () => {
    expect(parsePhotoSourceParams(new URLSearchParams('kind=library&folder=%2Fphotos%2F'))).toEqual({ kind: 'library', folder: 'photos' });
    expect(parsePhotoSourceParams(new URLSearchParams('kind=immich&album=..%2Fx&favorites=true'))).toEqual({ kind: 'immich' });
  });
});

describe('picking one picture', () => {
  it('knows which sources copy single pictures', () => {
    for (const kind of ['immich', 'unsplash', 'nasa']) expect(isPickImportKind(kind)).toBe(true);
    for (const kind of ['library', 'icloud', 'onedrive', '', null]) expect(isPickImportKind(kind)).toBe(false);
  });

  it.each<['immich' | 'unsplash' | 'nasa', string, boolean]>([
    ['immich', '8d1d93ea-60f5-497d-96f4-5f3cb72e1474', true],
    ['immich', 'abc', true],
    ['immich', '../etc', false],
    ['immich', 'xyz', false],
    ['unsplash', 'aB3_-x', true],
    ['unsplash', 'a/b', false],
    ['unsplash', '', false],
    ['nasa', 'apod:2026-11-01', true],
    ['nasa', 'apod:2026-1-1', false],
    ['nasa', 'image:PIA12345', true],
    ['nasa', 'image:as11-40-5874.v2', true],
    ['nasa', 'image:../x', false],
    ['nasa', 'PIA12345', false],
  ])('%s ref %j is valid: %s', (kind, ref, valid) => {
    expect(isValidPickRef(kind, ref)).toBe(valid);
  });
});
