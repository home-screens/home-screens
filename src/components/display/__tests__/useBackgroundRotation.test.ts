import { describe, it, expect } from 'vitest';
import type { PhotoSource, Screen } from '@/types/config';
import { buildRotationKey } from '@/components/display/useBackgroundRotation';

// Helper: build a minimal Screen with a rotation config
function screen(id: string, sources: PhotoSource[] = [{ kind: 'immich' }], intervalMinutes = 30): Screen {
  return {
    id,
    name: id,
    backgroundImage: '',
    modules: [],
    backgroundRotation: { intervalMinutes, sources },
  };
}

describe('buildRotationKey', () => {
  it('returns the empty-array sentinel when no screen can rotate', () => {
    const screens: Screen[] = [
      { id: 'a', name: 'a', backgroundImage: '', modules: [] },
      screen('b', []),
      // Sources that name no pictures do not count as rotating.
      screen('c', [{ kind: 'wall', group: 'color', ids: [] }, { kind: 'icloud', albumUrl: '' }]),
    ];
    // '[]' is the sentinel that the consuming useEffect uses to skip polling.
    expect(buildRotationKey(screens)).toBe('[]');
  });

  it('includes the source and the interval', () => {
    const key = buildRotationKey([screen('s1', [{ kind: 'unsplash', query: 'mountains' }], 15)]);
    expect(key).toContain('unsplash');
    expect(key).toContain('mountains');
    expect(key).toContain('15');
  });

  // Every field that changes which picture the hub hands back must change
  // the key, or the polling effect never re-runs after an edit.
  it.each<[string, PhotoSource, PhotoSource]>([
    ['Immich albums', { kind: 'immich', albumIds: ['a1'] }, { kind: 'immich', albumIds: ['a2'] }],
    ['Immich people', { kind: 'immich', personIds: ['b1'] }, { kind: 'immich', personIds: ['b2'] }],
    ['Immich left-out people', { kind: 'immich' }, { kind: 'immich', excludePersonIds: ['b1'] }],
    ['Immich favorites', { kind: 'immich' }, { kind: 'immich', favoritesOnly: true }],
    ['Immich picks', { kind: 'immich', assetIds: ['a1'] }, { kind: 'immich', assetIds: ['a1', 'a2'] }],
    ['iCloud link', { kind: 'icloud', albumUrl: 'https://www.icloud.com/sharedalbum/#AAA111' }, { kind: 'icloud', albumUrl: 'https://www.icloud.com/sharedalbum/#BBB222' }],
    ['library folder', { kind: 'library', folder: 'a' }, { kind: 'library', folder: 'b' }],
    ['library pictures', { kind: 'library', folder: '', pictures: ['a.jpg'] }, { kind: 'library', folder: '', pictures: ['b.jpg'] }],
    ['OneDrive folder', { kind: 'onedrive', folderId: 'X!1' }, { kind: 'onedrive', folderId: 'X!2' }],
    ['Unsplash collections', { kind: 'unsplash', query: '', collections: ['c1'] }, { kind: 'unsplash', query: '', collections: ['c2'] }],
    ['Unsplash picks', { kind: 'unsplash', query: '', photoIds: ['p1'] }, { kind: 'unsplash', query: '', photoIds: ['p2'] }],
    ['walls', { kind: 'wall', group: 'color', ids: ['ocean'] }, { kind: 'wall', group: 'color', ids: ['dusk'] }],
    ['kind', { kind: 'nasa' }, { kind: 'unsplash', query: 'nasa' }],
  ])('changes when the %s change', (_label, a, b) => {
    expect(buildRotationKey([screen('s1', [a])])).not.toBe(buildRotationKey([screen('s1', [b])]));
  });

  it('changes when a source is added, and not when the sources are reordered', () => {
    const one = buildRotationKey([screen('s1', [{ kind: 'nasa' }])]);
    const two = buildRotationKey([screen('s1', [{ kind: 'nasa' }, { kind: 'unsplash', query: 'x' }])]);
    const swapped = buildRotationKey([screen('s1', [{ kind: 'unsplash', query: 'x' }, { kind: 'nasa' }])]);
    expect(two).not.toBe(one);
    expect(swapped).toBe(two);
  });

  it('ignores a OneDrive folder label, which never changes the pictures', () => {
    const a = buildRotationKey([screen('s1', [{ kind: 'onedrive', folderId: 'X!1', folderName: 'Old' }])]);
    const b = buildRotationKey([screen('s1', [{ kind: 'onedrive', folderId: 'X!1', folderName: 'New' }])]);
    expect(a).toBe(b);
  });

  it('combines multiple screens distinctly', () => {
    const key = buildRotationKey([
      screen('s1', [{ kind: 'unsplash', query: 'foo' }], 10),
      screen('s2', [{ kind: 'unsplash', query: 'bar' }], 20),
    ]);
    expect(key).toContain('s1');
    expect(key).toContain('s2');
    expect(key).toContain('foo');
    expect(key).toContain('bar');
  });
});
