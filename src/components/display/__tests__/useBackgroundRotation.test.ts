import { describe, it, expect } from 'vitest';
import type { Screen } from '@/types/config';
import { buildRotationKey } from '@/components/display/useBackgroundRotation';

// Helper: build a minimal Screen with a rotation config
function screen(id: string, rotation: Partial<NonNullable<Screen['backgroundRotation']>> = {}): Screen {
  return {
    id,
    name: id,
    backgroundImage: '',
    modules: [],
    backgroundRotation: {
      enabled: true,
      sources: ['immich'],
      query: '',
      intervalMinutes: 30,
      ...rotation,
    },
  };
}

describe('buildRotationKey', () => {
  it('returns the empty-array sentinel when no screens have rotation enabled', () => {
    const screens: Screen[] = [
      { id: 'a', name: 'a', backgroundImage: '', modules: [] },
      { id: 'b', name: 'b', backgroundImage: '', modules: [], backgroundRotation: { enabled: false, sources: [], query: '', intervalMinutes: 30 } },
    ];
    // '[]' is the sentinel that the consuming useEffect uses to skip polling.
    expect(buildRotationKey(screens)).toBe('[]');
  });

  it('includes source, query, and interval', () => {
    const key = buildRotationKey([screen('s1', { sources: ['unsplash'], query: 'mountains', intervalMinutes: 15 })]);
    expect(key).toContain('unsplash');
    expect(key).toContain('mountains');
    expect(key).toContain('15');
  });

  // Regression: previously the key only contained source/query/intervalMinutes, so
  // changing an Immich filter would not invalidate the key and the polling
  // effect would not re-run. Each Immich-specific field must affect the key.
  it('changes when immichAlbumIds changes', () => {
    const a = buildRotationKey([screen('s1', { immichAlbumIds: ['album-1'] })]);
    const b = buildRotationKey([screen('s1', { immichAlbumIds: ['album-2'] })]);
    expect(a).not.toBe(b);
  });

  it('changes when immichPersonIds changes', () => {
    const a = buildRotationKey([screen('s1', { immichPersonIds: ['person-a'] })]);
    const b = buildRotationKey([screen('s1', { immichPersonIds: ['person-b'] })]);
    expect(a).not.toBe(b);
  });

  it('changes when immichPersonIdsExclude changes', () => {
    const a = buildRotationKey([screen('s1', { immichPersonIdsExclude: ['person-a'] })]);
    const b = buildRotationKey([screen('s1', { immichPersonIdsExclude: ['person-b'] })]);
    expect(a).not.toBe(b);
  });

  it('changes when immichFavoritesOnly toggles', () => {
    const a = buildRotationKey([screen('s1', { immichFavoritesOnly: false })]);
    const b = buildRotationKey([screen('s1', { immichFavoritesOnly: true })]);
    expect(a).not.toBe(b);
  });

  it('changes when the selected starter walls change, so the wall re-asks at once', () => {
    const a = buildRotationKey([screen('s1', { sources: ['color'], starterBackgroundIds: { color: ['blush'] } })]);
    const b = buildRotationKey([screen('s1', { sources: ['color'], starterBackgroundIds: { color: ['blush', 'sage'] } })]);
    expect(a).not.toBe(b);
  });

  it('changes when the local pictures or mode change', () => {
    const base = { sources: ['local'] as never };
    const a = buildRotationKey([screen('s1', { ...base, localMode: 'images', localImages: ['/api/backgrounds/serve?file=a.jpg'] })]);
    const b = buildRotationKey([screen('s1', { ...base, localMode: 'images', localImages: ['/api/backgrounds/serve?file=b.jpg'] })]);
    const c = buildRotationKey([screen('s1', { ...base, localMode: 'folder', localImages: ['/api/backgrounds/serve?file=a.jpg'] })]);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('changes when the picked Unsplash photos change', () => {
    const a = buildRotationKey([screen('s1', { sources: ['unsplash'], unsplashImages: ['/api/backgrounds/serve?file=rotation-unsplash-pick-a.jpg'] })]);
    const b = buildRotationKey([screen('s1', { sources: ['unsplash'], unsplashImages: ['/api/backgrounds/serve?file=rotation-unsplash-pick-b.jpg'] })]);
    expect(a).not.toBe(b);
  });

  it('changes when icloudAlbumUrl changes', () => {
    const a = buildRotationKey([screen('s1', { sources: ['icloud'], icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#AAA111' })]);
    const b = buildRotationKey([screen('s1', { sources: ['icloud'], icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#BBB222' })]);
    expect(a).not.toBe(b);
  });

  it('changes when unsplashCollections changes', () => {
    const a = buildRotationKey([screen('s1', { sources: ['unsplash'], unsplashCollections: ['coll-1'] })]);
    const b = buildRotationKey([screen('s1', { sources: ['unsplash'], unsplashCollections: ['coll-2'] })]);
    expect(a).not.toBe(b);
  });

  it('distinguishes an unset unsplashCollections from a set one', () => {
    const blank = buildRotationKey([screen('s1', { sources: ['unsplash'], query: 'mountains' })]);
    const withCollections = buildRotationKey([screen('s1', { sources: ['unsplash'], unsplashCollections: ['coll-1'] })]);
    expect(blank).not.toBe(withCollections);
  });

  it('treats undefined Immich fields consistently (does not collapse to same key as set values)', () => {
    const blank = buildRotationKey([screen('s1', { immichAlbumIds: undefined })]);
    const setVal = buildRotationKey([screen('s1', { immichAlbumIds: ['real'] })]);
    expect(blank).not.toBe(setVal);
  });

  it('combines multiple screens distinctly', () => {
    const key = buildRotationKey([
      screen('s1', { query: 'foo', intervalMinutes: 10 }),
      screen('s2', { query: 'bar', intervalMinutes: 20 }),
    ]);
    expect(key).toContain('s1');
    expect(key).toContain('s2');
    expect(key).toContain('foo');
    expect(key).toContain('bar');
  });

  // Regression: previous delimiter-joined format would collide on field
  // values containing `:` or `|`. JSON-encoding makes the key injective.
  it('does not collide when fields contain delimiter characters', () => {
    const a = buildRotationKey([screen('s1', { query: 'a:b', immichAlbumIds: ['c'] })]);
    const b = buildRotationKey([screen('s1', { query: 'a', immichAlbumIds: ['b:c'] })]);
    expect(a).not.toBe(b);
  });
});
