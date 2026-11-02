import { describe, it, expect } from 'vitest';
import type { PhotoSource, Screen } from '@/types/config';
import { buildRotationKey } from '@/components/display/useBackgroundRotation';

// Helper: build a minimal Screen with a rotation config
function screen(id: string, photoSource: PhotoSource = { kind: 'immich' }, intervalMinutes = 30): Screen {
  return {
    id,
    name: id,
    backgroundImage: '',
    modules: [],
    backgroundRotation: { enabled: true, intervalMinutes, photoSource },
  };
}

describe('buildRotationKey', () => {
  it('returns the empty-array sentinel when no screens have rotation enabled', () => {
    const screens: Screen[] = [
      { id: 'a', name: 'a', backgroundImage: '', modules: [] },
      { id: 'b', name: 'b', backgroundImage: '', modules: [], backgroundRotation: { enabled: false, intervalMinutes: 30, photoSource: { kind: 'nasa' } } },
    ];
    // '[]' is the sentinel that the consuming useEffect uses to skip polling.
    expect(buildRotationKey(screens)).toBe('[]');
  });

  it('includes the source and the interval', () => {
    const key = buildRotationKey([screen('s1', { kind: 'unsplash', query: 'mountains' }, 15)]);
    expect(key).toContain('unsplash');
    expect(key).toContain('mountains');
    expect(key).toContain('15');
  });

  // Every field that changes which picture the hub hands back must change
  // the key, or the polling effect never re-runs after an edit.
  it.each<[string, PhotoSource, PhotoSource]>([
    ['Immich album', { kind: 'immich', albumId: 'a1' }, { kind: 'immich', albumId: 'a2' }],
    ['Immich person', { kind: 'immich', personId: 'b1' }, { kind: 'immich', personId: 'b2' }],
    ['Immich favorites', { kind: 'immich' }, { kind: 'immich', favoritesOnly: true }],
    ['iCloud link', { kind: 'icloud', albumUrl: 'https://www.icloud.com/sharedalbum/#AAA111' }, { kind: 'icloud', albumUrl: 'https://www.icloud.com/sharedalbum/#BBB222' }],
    ['library folder', { kind: 'library', folder: 'a' }, { kind: 'library', folder: 'b' }],
    ['OneDrive folder', { kind: 'onedrive', folderId: 'X!1' }, { kind: 'onedrive', folderId: 'X!2' }],
    ['kind', { kind: 'nasa' }, { kind: 'unsplash', query: 'nasa' }],
  ])('changes when the %s changes', (_label, a, b) => {
    expect(buildRotationKey([screen('s1', a)])).not.toBe(buildRotationKey([screen('s1', b)]));
  });

  it('ignores a OneDrive folder label, which never changes the pictures', () => {
    const a = buildRotationKey([screen('s1', { kind: 'onedrive', folderId: 'X!1', folderName: 'Old' })]);
    const b = buildRotationKey([screen('s1', { kind: 'onedrive', folderId: 'X!1', folderName: 'New' })]);
    expect(a).toBe(b);
  });

  it('combines multiple screens distinctly', () => {
    const key = buildRotationKey([
      screen('s1', { kind: 'unsplash', query: 'foo' }, 10),
      screen('s2', { kind: 'unsplash', query: 'bar' }, 20),
    ]);
    expect(key).toContain('s1');
    expect(key).toContain('s2');
    expect(key).toContain('foo');
    expect(key).toContain('bar');
  });
});
