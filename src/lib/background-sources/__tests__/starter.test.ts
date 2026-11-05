import { describe, expect, it, vi } from 'vitest';
import { starterBackgroundsIn } from '@/lib/starter-backgrounds';
import type { BackgroundRotation } from '@/types/config';
import { backgroundSourceProviders, isSourceConfigured } from '..';

const rotation = (starterBackgroundIds?: BackgroundRotation['starterBackgroundIds']): BackgroundRotation => ({
  sources: ['color', 'pattern'], query: '', intervalMinutes: 60, starterBackgroundIds,
});

describe('built-in starter rotation providers', () => {
  it.each(['color', 'pattern'] as const)('%s is opt-in: absent or empty selection rotates nothing', async (group) => {
    expect(starterBackgroundsIn(group).length).toBeGreaterThan(1);
    expect(await backgroundSourceProviders[group].fetchRandom(rotation(), undefined)).toBeNull();
    expect(await backgroundSourceProviders[group].fetchRandom(rotation({ [group]: [] }), undefined)).toBeNull();
    expect(isSourceConfigured(group, rotation())).toBe(false);
    expect(isSourceConfigured(group, rotation({ [group]: [starterBackgroundsIn(group)[0].id] }))).toBe(true);
  });

  it('respects a single ID, a multi-ID subset, and never escapes the chosen group', async () => {
    const colors = starterBackgroundsIn('color');
    const first = colors[0];
    const last = colors.at(-1)!;
    const chosen = rotation({ color: [first.id, 'theme-horizon', last.id, first.id] });
    const pick = vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    try {
      expect(await backgroundSourceProviders.color.fetchRandom(chosen, undefined)).toBe(last.path);
      expect(await backgroundSourceProviders.color.fetchRandom(rotation({ color: [first.id] }), undefined)).toBe(first.path);
    } finally { pick.mockRestore(); }
  });

  it('skips invalid selections rather than accidentally falling back to all', async () => {
    const invalid = rotation({ pattern: ['missing', 'midnight', 42 as never] });
    expect(isSourceConfigured('pattern', invalid)).toBe(false);
    expect(await backgroundSourceProviders.pattern.fetchRandom(invalid, undefined)).toBeNull();
    expect(isSourceConfigured('toString' as never, invalid)).toBe(false);
  });

  it('theme is not a rotation source: a leftover entry is never configured', () => {
    expect(Object.hasOwn(backgroundSourceProviders, 'theme')).toBe(false);
    expect(isSourceConfigured('theme' as never, rotation())).toBe(false);
  });
});

describe('source readiness', () => {
  const base: BackgroundRotation = { sources: [], query: '', intervalMinutes: 60 };

  it('iCloud is ready only with a link that parses', () => {
    expect(isSourceConfigured('icloud', base)).toBe(false);
    expect(isSourceConfigured('icloud', { ...base, icloudAlbumUrl: 'not a link' })).toBe(false);
    expect(isSourceConfigured('icloud', { ...base, icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#B0aGdXWuDG1PYBr' })).toBe(true);
  });

  it('Unsplash Search mode is ready with a query or with picked photos, Collections mode only with collections', () => {
    expect(isSourceConfigured('unsplash', base)).toBe(false);
    expect(isSourceConfigured('unsplash', { ...base, query: 'space' })).toBe(true);
    expect(isSourceConfigured('unsplash', { ...base, unsplashImages: ['/api/backgrounds/serve?file=rotation-unsplash-pick-a.jpg'] })).toBe(true);
    expect(isSourceConfigured('unsplash', { ...base, unsplashMode: 'collections', query: 'space' })).toBe(false);
    expect(isSourceConfigured('unsplash', { ...base, unsplashMode: 'collections', unsplashCollections: ['c1'] })).toBe(true);
  });

  it('local is ready as a folder by default and in pictures mode only once pictures are chosen', () => {
    expect(isSourceConfigured('local', base)).toBe(true);
    expect(isSourceConfigured('local', { ...base, localMode: 'images' })).toBe(false);
    expect(isSourceConfigured('local', { ...base, localMode: 'images', localImages: ['nonsense'] })).toBe(false);
    expect(isSourceConfigured('local', { ...base, localMode: 'images', localImages: ['/api/backgrounds/serve?file=a.jpg'] })).toBe(true);
  });
});
