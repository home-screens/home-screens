import { describe, it, expect } from 'vitest';
import type { BackgroundRotation, PhotoSource } from '@/types/config';
import { pickedBackground, resolveScreenBackground, stopBackgroundRotation, withRotationUpdate } from '@/lib/screen-background';

const OWN = '/starter-backgrounds/ocean.svg';
const PHOTO = '/api/backgrounds/serve?file=rotation-unsplash-a.jpg';
const UNSPLASH: PhotoSource = { kind: 'unsplash', query: 'nature landscape' };
const ROTATION: BackgroundRotation = { intervalMinutes: 60, sources: [UNSPLASH] };
const OFF: BackgroundRotation = { intervalMinutes: 60, sources: [] };
const rotating = { backgroundImage: OWN, backgroundRotation: ROTATION };

describe('resolveScreenBackground', () => {
  it('paints the own picture when rotation is off, whatever rotation last answered', () => {
    expect(resolveScreenBackground({ backgroundImage: OWN }, undefined)).toBe(OWN);
    expect(resolveScreenBackground({ backgroundImage: OWN }, PHOTO)).toBe(OWN);
    expect(resolveScreenBackground({ backgroundImage: OWN, backgroundRotation: OFF }, PHOTO)).toBe(OWN);
  });

  it('treats a rotation whose sources name no pictures as off', () => {
    const empty: BackgroundRotation = { intervalMinutes: 60, sources: [{ kind: 'wall', group: 'color', ids: [] }] };
    expect(resolveScreenBackground({ backgroundImage: OWN, backgroundRotation: empty }, undefined)).toBe(OWN);
  });

  it('paints nothing, not the own picture, while rotation has not answered yet', () => {
    expect(resolveScreenBackground(rotating, undefined)).toBeUndefined();
  });

  it('paints the photo rotation answered with', () => {
    expect(resolveScreenBackground(rotating, PHOTO)).toBe(PHOTO);
  });

  it('falls back to the own picture when rotation has no photo', () => {
    expect(resolveScreenBackground(rotating, null)).toBe(OWN);
  });

  it('paints nothing when there is no picture at all', () => {
    expect(resolveScreenBackground({ backgroundImage: '' }, undefined)).toBeUndefined();
    expect(resolveScreenBackground({ ...rotating, backgroundImage: '' }, null)).toBeUndefined();
  });
});

describe('withRotationUpdate', () => {
  const WALLS: PhotoSource = { kind: 'wall', group: 'color', ids: ['ocean'] };
  const PATTERNS: PhotoSource = { kind: 'wall', group: 'pattern', ids: ['pattern-dots'] };

  it('builds a whole rotation from nothing, an hour apart by default', () => {
    expect(withRotationUpdate(undefined, { source: UNSPLASH })).toEqual({ intervalMinutes: 60, sources: [UNSPLASH] });
    expect(withRotationUpdate(undefined, { intervalMinutes: 15 })).toEqual({ intervalMinutes: 15, sources: [] });
  });

  it('adds a source of a new kind at the end', () => {
    expect(withRotationUpdate(ROTATION, { source: { kind: 'nasa' } }).sources).toEqual([UNSPLASH, { kind: 'nasa' }]);
  });

  it('replaces the entry of the same kind in place', () => {
    const words: PhotoSource = { kind: 'unsplash', query: 'lakes' };
    const current: BackgroundRotation = { intervalMinutes: 60, sources: [UNSPLASH, { kind: 'nasa' }] };
    expect(withRotationUpdate(current, { source: words }).sources).toEqual([words, { kind: 'nasa' }]);
  });

  it('keeps the two wall groups apart, replacing only the matching group', () => {
    const current: BackgroundRotation = { intervalMinutes: 60, sources: [WALLS, PATTERNS] };
    const more: PhotoSource = { kind: 'wall', group: 'color', ids: ['ocean', 'dusk'] };
    expect(withRotationUpdate(current, { source: more }).sources).toEqual([more, PATTERNS]);
  });

  it('takes out the entry of a kind, or of one wall group', () => {
    const current: BackgroundRotation = { intervalMinutes: 60, sources: [WALLS, PATTERNS, UNSPLASH] };
    expect(withRotationUpdate(current, { remove: { kind: 'unsplash' } }).sources).toEqual([WALLS, PATTERNS]);
    expect(withRotationUpdate(current, { remove: { kind: 'wall', group: 'pattern' } }).sources).toEqual([WALLS, UNSPLASH]);
    expect(withRotationUpdate(current, { remove: { kind: 'wall' } }).sources).toEqual([UNSPLASH]);
  });

  it('replaces the whole list when one is given, and keeps the interval', () => {
    expect(withRotationUpdate({ intervalMinutes: 30, sources: [UNSPLASH] }, { sources: [WALLS] })).toEqual({ intervalMinutes: 30, sources: [WALLS] });
  });

  it('drops an entry that does not read as a source, and tidies the ones that do', () => {
    const current = { intervalMinutes: 60, sources: [{ kind: 'dropbox' }, { kind: 'immich', albumId: 'abc' }] } as unknown as BackgroundRotation;
    expect(withRotationUpdate(current, { intervalMinutes: 15 })).toEqual({ intervalMinutes: 15, sources: [{ kind: 'immich', albumIds: ['abc'] }] });
  });
});

describe('stopBackgroundRotation', () => {
  it('empties the sources and keeps the interval', () => {
    expect(stopBackgroundRotation(ROTATION)).toEqual({ intervalMinutes: 60, sources: [] });
    expect(stopBackgroundRotation(undefined)).toBeUndefined();
  });
});

describe('pickedBackground', () => {
  it('turns rotation off and keeps its interval for next time', () => {
    expect(pickedBackground(rotating, PHOTO)).toEqual({
      backgroundImage: PHOTO,
      backgroundRotation: { intervalMinutes: 60, sources: [] },
    });
  });

  it('only sets the picture when rotation is off or was never set up', () => {
    expect(pickedBackground({ backgroundRotation: OFF }, PHOTO)).toEqual({ backgroundImage: PHOTO });
    expect(pickedBackground({}, PHOTO)).toEqual({ backgroundImage: PHOTO });
    expect(pickedBackground(undefined, PHOTO)).toEqual({ backgroundImage: PHOTO });
  });
});
