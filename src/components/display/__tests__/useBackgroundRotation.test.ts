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
      source: 'immich',
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
      { id: 'b', name: 'b', backgroundImage: '', modules: [], backgroundRotation: { enabled: false, query: '', intervalMinutes: 30 } },
    ];
    // '[]' is the sentinel that the consuming useEffect uses to skip polling.
    expect(buildRotationKey(screens)).toBe('[]');
  });

  it('includes source, query, and interval', () => {
    const key = buildRotationKey([screen('s1', { source: 'unsplash', query: 'mountains', intervalMinutes: 15 })]);
    expect(key).toContain('unsplash');
    expect(key).toContain('mountains');
    expect(key).toContain('15');
  });

  // Regression: see code-review-remediation.md item 6.
  // Previously the key only contained source/query/intervalMinutes, so
  // changing an Immich filter would not invalidate the key and the polling
  // effect would not re-run. Each Immich-specific field must affect the key.
  it('changes when immichAlbumId changes', () => {
    const a = buildRotationKey([screen('s1', { immichAlbumId: 'album-1' })]);
    const b = buildRotationKey([screen('s1', { immichAlbumId: 'album-2' })]);
    expect(a).not.toBe(b);
  });

  it('changes when immichPersonId changes', () => {
    const a = buildRotationKey([screen('s1', { immichPersonId: 'person-a' })]);
    const b = buildRotationKey([screen('s1', { immichPersonId: 'person-b' })]);
    expect(a).not.toBe(b);
  });

  it('changes when immichFavoritesOnly toggles', () => {
    const a = buildRotationKey([screen('s1', { immichFavoritesOnly: false })]);
    const b = buildRotationKey([screen('s1', { immichFavoritesOnly: true })]);
    expect(a).not.toBe(b);
  });

  it('treats undefined Immich fields consistently (does not collapse to same key as set values)', () => {
    const blank = buildRotationKey([screen('s1', { immichAlbumId: undefined })]);
    const setVal = buildRotationKey([screen('s1', { immichAlbumId: 'real' })]);
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
    const a = buildRotationKey([screen('s1', { query: 'a:b', immichAlbumId: 'c' })]);
    const b = buildRotationKey([screen('s1', { query: 'a', immichAlbumId: 'b:c' })]);
    expect(a).not.toBe(b);
  });
});
