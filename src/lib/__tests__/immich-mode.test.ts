import { describe, it, expect } from 'vitest';
import { effectiveImmichMode } from '../immich-mode';
import type { BackgroundRotation } from '@/types/config';

const base: BackgroundRotation = { sources: [], query: '', intervalMinutes: 60 };

describe('effectiveImmichMode', () => {
  it('starts new configs on pictures', () => {
    expect(effectiveImmichMode(undefined)).toBe('pick');
    expect(effectiveImmichMode(base)).toBe('pick');
  });
  it('keeps legacy configs without a stored mode on filters', () => {
    expect(effectiveImmichMode({ ...base, sources: ['immich'] })).toBe('filters');
    expect(effectiveImmichMode({ ...base, immichAlbumIds: ['a'] })).toBe('filters');
    expect(effectiveImmichMode({ ...base, immichPersonIds: ['p'] })).toBe('filters');
    expect(effectiveImmichMode({ ...base, immichPersonIdsExclude: ['p'] })).toBe('filters');
    expect(effectiveImmichMode({ ...base, immichFavoritesOnly: true })).toBe('filters');
  });
  it('an explicit mode always wins', () => {
    expect(effectiveImmichMode({ ...base, sources: ['immich'], immichMode: 'pick' })).toBe('pick');
    expect(effectiveImmichMode({ ...base, immichMode: 'filters' })).toBe('filters');
  });
});
