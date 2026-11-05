import { describe, it, expect } from 'vitest';
import type { PhotoSource } from '@/types/config';
import {
  MAX_PICKED_PICTURES,
  PHOTO_SOURCE_KINDS,
  candidateCount,
  canPlayVideo,
  canRotate,
  clampPhotoCount,
  cleanLibraryFolder,
  cleanLibraryPath,
  defaultPhotoSource,
  emptyStateFor,
  hasContent,
  isMediaTypes,
  isPhotoSourceKind,
  isPickImportKind,
  isReady,
  isRotationActive,
  isValidPickRef,
  maxPhotoCount,
  needs,
  normalizePhotoSource,
  offeredFor,
  parsePhotoSourceParams,
  photoSourceParams,
  rotationBreadth,
  rotationCacheKey,
  rotationSources,
  sourceCacheKey,
  usesCount,
  type PhotoSourceKind,
} from '@/lib/photo-source';

/** Every secret saved. */
const ALL_KEYS = {
  immich_url: true, immich_api_key: true, microsoft_client_id: true, unsplash_access_key: true,
};
const ICLOUD_LINK = 'https://www.icloud.com/sharedalbum/#B0aGcD12';

describe('per-kind rules', () => {
  it.each<[PhotoSourceKind, string[], boolean, boolean, boolean, string]>([
    // kind, secrets, sign-in, plays video, has a count, why empty
    ['wall', [], false, false, false, 'pickPictures'],
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
    expect(emptyStateFor(defaultPhotoSource(kind))).toBe(empty);
    expect(isPhotoSourceKind(kind)).toBe(true);
    expect(defaultPhotoSource(kind).kind).toBe(kind);
    // A fresh source survives a round trip through the config reader.
    expect(normalizePhotoSource(defaultPhotoSource(kind))).toEqual(defaultPhotoSource(kind));
  });

  it('lists the kinds in the editor order', () => {
    expect(PHOTO_SOURCE_KINDS).toEqual(['wall', 'library', 'immich', 'icloud', 'onedrive', 'unsplash', 'nasa']);
    expect(isPhotoSourceKind('dropbox')).toBe(false);
    expect(isPhotoSourceKind(undefined)).toBe(false);
  });

  it('starts Unsplash on some search words and everything else empty', () => {
    expect(defaultPhotoSource('library')).toEqual({ kind: 'library', folder: '' });
    expect(defaultPhotoSource('unsplash')).toEqual({ kind: 'unsplash', query: 'nature landscape' });
    expect(defaultPhotoSource('icloud')).toEqual({ kind: 'icloud', albumUrl: '' });
    expect(defaultPhotoSource('onedrive')).toEqual({ kind: 'onedrive', folderId: '' });
    expect(defaultPhotoSource('wall')).toEqual({ kind: 'wall', group: 'color', ids: [] });
  });

  it('names why a picked-pictures mode is empty', () => {
    expect(emptyStateFor({ kind: 'library', folder: '', pictures: [] })).toBe('pickPictures');
    expect(emptyStateFor({ kind: 'immich', assetIds: [] })).toBe('pickPictures');
    expect(emptyStateFor({ kind: 'unsplash', query: '', photoIds: [] })).toBe('pickPictures');
  });
});

describe('offeredFor', () => {
  it('offers the browsable sources for picking one picture', () => {
    expect(offeredFor('pick')).toEqual(['library', 'immich', 'unsplash', 'nasa']);
  });

  it('offers every photo kind for a stream, and the walls too for a rotating background', () => {
    expect(offeredFor('stream')).toEqual(['library', 'immich', 'icloud', 'onedrive', 'unsplash', 'nasa']);
    expect(offeredFor('background')).toEqual(PHOTO_SOURCE_KINDS);
  });
});

describe('isReady', () => {
  it.each<PhotoSourceKind>(['wall', 'library', 'icloud'])('%s needs no key', (kind) => {
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

describe('hasContent, candidateCount and canRotate', () => {
  it.each<[string, PhotoSource, boolean, number | undefined]>([
    ['walls with picks', { kind: 'wall', group: 'color', ids: ['ocean', 'dusk'] }, true, 2],
    ['walls with none', { kind: 'wall', group: 'pattern', ids: [] }, false, 0],
    ['a library folder', { kind: 'library', folder: '' }, true, undefined],
    ['chosen library pictures', { kind: 'library', folder: '', pictures: ['a.jpg'] }, true, 1],
    ['no library pictures chosen', { kind: 'library', folder: '', pictures: [] }, false, 0],
    ['Immich filters', { kind: 'immich', albumIds: ['abc'] }, true, undefined],
    ['Immich picks', { kind: 'immich', assetIds: ['abc', 'def', 'ghi'] }, true, 3],
    ['no Immich picks', { kind: 'immich', assetIds: [] }, false, 0],
    ['an iCloud link', { kind: 'icloud', albumUrl: ICLOUD_LINK }, true, undefined],
    ['a bare iCloud token', { kind: 'icloud', albumUrl: 'B0aGcD12' }, true, undefined],
    ['no iCloud link', { kind: 'icloud', albumUrl: '' }, false, undefined],
    ['a torn iCloud link', { kind: 'icloud', albumUrl: 'https://www.icloud.com/sharedalbum/#B0' }, false, undefined],
    ['a OneDrive folder', { kind: 'onedrive', folderId: 'ABC!1' }, true, undefined],
    ['no OneDrive folder', { kind: 'onedrive', folderId: '' }, false, undefined],
    ['Unsplash words', { kind: 'unsplash', query: 'lakes' }, true, undefined],
    ['Unsplash collections', { kind: 'unsplash', query: '', collections: ['abc'] }, true, undefined],
    ['Unsplash picks', { kind: 'unsplash', query: '', photoIds: ['p1'] }, true, 1],
    ['blank Unsplash words', { kind: 'unsplash', query: '  ' }, false, undefined],
    ['NASA', { kind: 'nasa' }, true, undefined],
  ])('%s', (_label, source, content, count) => {
    expect(hasContent(source)).toBe(content);
    expect(candidateCount(source)).toBe(count);
  });

  it('can rotate only with pictures named and the keys saved', () => {
    expect(canRotate({ kind: 'immich' }, ALL_KEYS)).toBe(true);
    expect(canRotate({ kind: 'immich' }, {})).toBe(false);
    expect(canRotate({ kind: 'immich', assetIds: [] }, ALL_KEYS)).toBe(false);
    expect(canRotate({ kind: 'nasa' }, {})).toBe(true);
  });
});

describe('rotationSources, isRotationActive and rotationBreadth', () => {
  it('reads every entry that is a source and skips the rest', () => {
    expect(rotationSources({ sources: [{ kind: 'nasa' }, { kind: 'dropbox' } as unknown as PhotoSource, 'x' as unknown as PhotoSource] }))
      .toEqual([{ kind: 'nasa' }]);
    expect(rotationSources(undefined)).toEqual([]);
    expect(rotationSources({ sources: 'nope' as unknown as PhotoSource[] })).toEqual([]);
  });

  it('is on when any source names pictures, keys or not', () => {
    expect(isRotationActive(undefined)).toBe(false);
    expect(isRotationActive({ sources: [] })).toBe(false);
    expect(isRotationActive({ sources: [{ kind: 'wall', group: 'color', ids: [] }] })).toBe(false);
    expect(isRotationActive({ sources: [{ kind: 'wall', group: 'color', ids: [] }, { kind: 'immich' }] })).toBe(true);
  });

  it('counts what the rotation can show: none, exactly one, or many', () => {
    expect(rotationBreadth(undefined)).toBe('none');
    expect(rotationBreadth({ sources: [{ kind: 'wall', group: 'color', ids: [] }] })).toBe('none');
    expect(rotationBreadth({ sources: [{ kind: 'wall', group: 'color', ids: ['ocean'] }] })).toBe('one');
    expect(rotationBreadth({ sources: [{ kind: 'library', folder: '', pictures: ['a.jpg'] }] })).toBe('one');
    expect(rotationBreadth({ sources: [{ kind: 'wall', group: 'color', ids: ['ocean'] }, { kind: 'wall', group: 'pattern', ids: ['pattern-dots'] }] })).toBe('many');
    expect(rotationBreadth({ sources: [{ kind: 'wall', group: 'color', ids: ['ocean'] }, { kind: 'nasa' }] })).toBe('many');
    expect(rotationBreadth({ sources: [{ kind: 'library', folder: 'trips' }] })).toBe('many');
  });

  it('leaves a keyless source out of the count when the keys are known', () => {
    const sources: PhotoSource[] = [{ kind: 'wall', group: 'color', ids: ['ocean'] }, { kind: 'immich' }];
    expect(rotationBreadth({ sources }, ALL_KEYS)).toBe('many');
    expect(rotationBreadth({ sources }, {})).toBe('one');
    expect(rotationBreadth({ sources: [{ kind: 'immich' }] }, {})).toBe('none');
  });
});

describe('normalizePhotoSource', () => {
  it('reads every good shape and drops unknown fields', () => {
    expect(normalizePhotoSource({ kind: 'library', folder: 'trips', extra: 1 })).toEqual({ kind: 'library', folder: 'trips' });
    expect(normalizePhotoSource({ kind: 'immich', albumIds: ['abc-123'], personIds: ['DEF-456'], excludePersonIds: ['c0ffee'], favoritesOnly: true }))
      .toEqual({ kind: 'immich', albumIds: ['abc-123'], personIds: ['DEF-456'], excludePersonIds: ['c0ffee'], favoritesOnly: true });
    expect(normalizePhotoSource({ kind: 'icloud', albumUrl: `  ${ICLOUD_LINK}  ` })).toEqual({ kind: 'icloud', albumUrl: ICLOUD_LINK });
    expect(normalizePhotoSource({ kind: 'onedrive', folderId: 'ABC!123', folderName: 'Family' }))
      .toEqual({ kind: 'onedrive', folderId: 'ABC!123', folderName: 'Family' });
    expect(normalizePhotoSource({ kind: 'unsplash', query: ' lakes ' })).toEqual({ kind: 'unsplash', query: 'lakes' });
    expect(normalizePhotoSource({ kind: 'nasa', query: 'x' })).toEqual({ kind: 'nasa' });
    expect(normalizePhotoSource({ kind: 'wall', group: 'pattern', ids: ['pattern-dots'], extra: 1 })).toEqual({ kind: 'wall', group: 'pattern', ids: ['pattern-dots'] });
  });

  it('returns null for anything that is not a source', () => {
    for (const value of [null, undefined, 'library', 42, [], {}, { kind: 'dropbox' }, { kind: 7 }, { kind: 'wall' }, { kind: 'wall', group: 'theme' }]) {
      expect(normalizePhotoSource(value)).toBeNull();
    }
  });

  it('reads a singular Immich album or person from before the lists as a one-entry list', () => {
    expect(normalizePhotoSource({ kind: 'immich', albumId: 'abc-123', personId: 'def-456' }))
      .toEqual({ kind: 'immich', albumIds: ['abc-123'], personIds: ['def-456'] });
    // A list beside the singular wins.
    expect(normalizePhotoSource({ kind: 'immich', albumId: 'a0', albumIds: ['b1'] })).toEqual({ kind: 'immich', albumIds: ['b1'] });
  });

  it('cleans the slashes off a library folder and reads a missing one as the top level', () => {
    expect(normalizePhotoSource({ kind: 'library', folder: '/photos/' })).toEqual({ kind: 'library', folder: 'photos' });
    expect(normalizePhotoSource({ kind: 'library', folder: 'a/b//' })).toEqual({ kind: 'library', folder: 'a/b' });
    expect(normalizePhotoSource({ kind: 'library' })).toEqual({ kind: 'library', folder: '' });
    expect(normalizePhotoSource({ kind: 'library', folder: 5 })).toEqual({ kind: 'library', folder: '' });
    expect(cleanLibraryFolder(' /x/ ')).toBe('x');
  });

  it('keeps only library paths that stay inside the library as chosen pictures', () => {
    expect(normalizePhotoSource({ kind: 'library', folder: '', pictures: ['trips/a.jpg', '../x.jpg', '/api/backgrounds/serve?file=b.jpg', 'trips/a.jpg', ''] }))
      .toEqual({ kind: 'library', folder: '', pictures: ['trips/a.jpg'] });
    // Nothing usable means no picked set at all.
    // The Pictures mode stays (an empty list), with the bad path gone.
    expect(normalizePhotoSource({ kind: 'library', folder: 'x', pictures: ['../x'] })).toEqual({ kind: 'library', folder: 'x', pictures: [] });
    expect(cleanLibraryPath(' /trips/a.jpg')).toBe('trips/a.jpg');
    expect(cleanLibraryPath('a/./b.jpg')).toBeNull();
    expect(cleanLibraryPath('')).toBeNull();
  });

  it('drops ids that could not be Immich, Unsplash, wall or OneDrive ids, without repeats, up to the cap', () => {
    expect(normalizePhotoSource({ kind: 'immich', albumIds: ['../albums'], personIds: ['zz'], assetIds: ['abc', 'abc', 'q'], favoritesOnly: 'yes' }))
      .toEqual({ kind: 'immich', assetIds: ['abc'] });
    expect(normalizePhotoSource({ kind: 'immich', albumIds: ['a'.repeat(65)] })).toEqual({ kind: 'immich' });
    expect(normalizePhotoSource({ kind: 'onedrive', folderId: 'a b/c' })).toEqual({ kind: 'onedrive', folderId: '' });
    expect(normalizePhotoSource({ kind: 'unsplash', query: '', collections: ['ok_1', 'no/slash'], photoIds: ['p-1', 'p 2'] }))
      .toEqual({ kind: 'unsplash', query: '', collections: ['ok_1'], photoIds: ['p-1'] });
    expect(normalizePhotoSource({ kind: 'wall', group: 'color', ids: ['ocean', 'Not Ok', 'ocean'] })).toEqual({ kind: 'wall', group: 'color', ids: ['ocean'] });
    const many = Array.from({ length: MAX_PICKED_PICTURES + 5 }, (_, i) => `p${i}`);
    expect(normalizePhotoSource({ kind: 'unsplash', query: '', photoIds: many })).toMatchObject({ photoIds: many.slice(0, MAX_PICKED_PICTURES) });
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
    ['library pictures', { kind: 'library', folder: '', pictures: ['a.jpg'] }, { kind: 'library', folder: '', pictures: ['b.jpg'] }],
    ['Immich albums', { kind: 'immich', albumIds: ['a1'] }, { kind: 'immich', albumIds: ['a2'] }],
    ['Immich people', { kind: 'immich', personIds: ['b1'] }, { kind: 'immich', personIds: ['b2'] }],
    ['Immich left-out people', { kind: 'immich' }, { kind: 'immich', excludePersonIds: ['b1'] }],
    ['Immich favorites', { kind: 'immich' }, { kind: 'immich', favoritesOnly: true }],
    ['Immich picks', { kind: 'immich', assetIds: ['a'] }, { kind: 'immich', assetIds: ['a', 'b'] }],
    ['iCloud link', { kind: 'icloud', albumUrl: 'https://a' }, { kind: 'icloud', albumUrl: 'https://b' }],
    ['OneDrive folder', { kind: 'onedrive', folderId: 'A!1' }, { kind: 'onedrive', folderId: 'A!2' }],
    ['Unsplash words', { kind: 'unsplash', query: 'lakes' }, { kind: 'unsplash', query: 'trees' }],
    ['Unsplash collections', { kind: 'unsplash', query: '', collections: ['c1'] }, { kind: 'unsplash', query: '', collections: ['c2'] }],
    ['Unsplash picks', { kind: 'unsplash', query: '', photoIds: ['p1'] }, { kind: 'unsplash', query: '', photoIds: ['p2'] }],
    ['walls', { kind: 'wall', group: 'color', ids: ['ocean'] }, { kind: 'wall', group: 'color', ids: ['dusk'] }],
    ['wall group', { kind: 'wall', group: 'color', ids: [] }, { kind: 'wall', group: 'pattern', ids: [] }],
    ['kind', { kind: 'library', folder: '' }, { kind: 'nasa' }],
  ])('changes with the %s', (_label, a, b) => {
    expect(key(a)).not.toBe(key(b));
  });

  it('ignores what never changes the pictures: a OneDrive label, Unsplash case and spacing, folder slashes, list order', () => {
    expect(key({ kind: 'onedrive', folderId: 'A!1', folderName: 'Old' })).toBe(key({ kind: 'onedrive', folderId: 'A!1', folderName: 'New' }));
    expect(key({ kind: 'unsplash', query: 'Lakes ' })).toBe(key({ kind: 'unsplash', query: 'lakes' }));
    expect(key({ kind: 'library', folder: '/trips/' })).toBe(key({ kind: 'library', folder: 'trips' }));
    expect(key({ kind: 'immich', favoritesOnly: false })).toBe(key({ kind: 'immich' }));
    expect(key({ kind: 'immich', albumIds: ['a', 'b'] })).toBe(key({ kind: 'immich', albumIds: ['b', 'a'] }));
    expect(key({ kind: 'wall', group: 'color', ids: ['ocean', 'dusk'] })).toBe(key({ kind: 'wall', group: 'color', ids: ['dusk', 'ocean'] }));
  });

  it('cannot collide across fields that hold delimiter characters', () => {
    expect(key({ kind: 'immich', albumIds: ['a'], personIds: ['b'] })).not.toBe(key({ kind: 'immich', albumIds: ['a,b'] }));
  });
});

describe('rotationCacheKey', () => {
  const NASA: PhotoSource = { kind: 'nasa' };
  const WORDS: PhotoSource = { kind: 'unsplash', query: 'lakes' };

  it('is the same whatever order the sources are in, and changes with any source or the interval', () => {
    expect(rotationCacheKey({ sources: [NASA, WORDS], intervalMinutes: 60 })).toBe(rotationCacheKey({ sources: [WORDS, NASA], intervalMinutes: 60 }));
    expect(rotationCacheKey({ sources: [NASA], intervalMinutes: 60 })).not.toBe(rotationCacheKey({ sources: [NASA, WORDS], intervalMinutes: 60 }));
    expect(rotationCacheKey({ sources: [NASA], intervalMinutes: 60 })).not.toBe(rotationCacheKey({ sources: [NASA], intervalMinutes: 30 }));
  });

  it('leaves out an entry that names nothing, so ticking an empty group changes nothing', () => {
    expect(rotationCacheKey({ sources: [NASA, { kind: 'wall', group: 'color', ids: [] }], intervalMinutes: 60 }))
      .toBe(rotationCacheKey({ sources: [NASA], intervalMinutes: 60 }));
    expect(rotationCacheKey(undefined)).toBe('');
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
    { kind: 'library', folder: '', pictures: ['trips/a b.jpg', 'c.png'] },
    { kind: 'immich' },
    { kind: 'immich', albumIds: ['abc-123', 'abc-124'], personIds: ['def-456'], excludePersonIds: ['abc-789'], favoritesOnly: true },
    { kind: 'immich', assetIds: ['a1', 'a2'] },
    { kind: 'icloud', albumUrl: ICLOUD_LINK },
    { kind: 'onedrive', folderId: 'ABC!123' },
    { kind: 'unsplash', query: 'mountains lake' },
    { kind: 'unsplash', query: '', collections: ['c1', 'c2'] },
    { kind: 'unsplash', query: '', photoIds: ['p1'] },
    { kind: 'nasa' },
    { kind: 'wall', group: 'pattern', ids: ['pattern-dots', 'pattern-grid'] },
    { kind: 'wall', group: 'color', ids: [] },
  ])('round-trips %j', (source) => {
    expect(parsePhotoSourceParams(new URLSearchParams(photoSourceParams(source).toString()))).toEqual(source);
  });

  it('leaves the OneDrive label out of the URL', () => {
    const params = photoSourceParams({ kind: 'onedrive', folderId: 'A!1', folderName: 'Family' });
    expect(params.toString()).toBe('kind=onedrive&folderId=A%211');
  });

  it('writes empty fields as absent, and lists comma-joined', () => {
    expect(photoSourceParams({ kind: 'library', folder: '' }).toString()).toBe('kind=library');
    expect(photoSourceParams({ kind: 'icloud', albumUrl: '' }).toString()).toBe('kind=icloud');
    expect(photoSourceParams({ kind: 'immich', favoritesOnly: false }).toString()).toBe('kind=immich');
    expect(photoSourceParams({ kind: 'immich', albumIds: ['a', 'b'] }).toString()).toBe('kind=immich&albums=a%2Cb');
  });

  it('reads no source from an unknown or missing kind', () => {
    expect(parsePhotoSourceParams(new URLSearchParams(''))).toBeNull();
    expect(parsePhotoSourceParams(new URLSearchParams('kind=dropbox&folder=x'))).toBeNull();
  });

  it('cleans what it reads the same way the config reader does', () => {
    expect(parsePhotoSourceParams(new URLSearchParams('kind=library&folder=%2Fphotos%2F'))).toEqual({ kind: 'library', folder: 'photos' });
    expect(parsePhotoSourceParams(new URLSearchParams('kind=immich&albums=..%2Fx&favorites=true'))).toEqual({ kind: 'immich' });
  });
});

describe('picking one picture', () => {
  it('knows which sources copy single pictures', () => {
    for (const kind of ['immich', 'unsplash', 'nasa']) expect(isPickImportKind(kind)).toBe(true);
    for (const kind of ['library', 'icloud', 'onedrive', 'wall', '', null]) expect(isPickImportKind(kind)).toBe(false);
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
