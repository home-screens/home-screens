import { describe, it, expect } from 'vitest';
import { pickedBackground, resolveScreenBackground } from '@/lib/screen-background';

const OWN = '/starter-backgrounds/ocean.svg';
const PHOTO = '/api/backgrounds/serve?file=rotation-unsplash-a.jpg';
const ROTATION = { enabled: true, sources: ['unsplash' as const], query: 'nature landscape', intervalMinutes: 60 };
const rotating = { backgroundImage: OWN, backgroundRotation: ROTATION };

describe('resolveScreenBackground', () => {
  it('paints the own picture when rotation is off, whatever rotation last answered', () => {
    expect(resolveScreenBackground({ backgroundImage: OWN }, undefined)).toBe(OWN);
    expect(resolveScreenBackground({ backgroundImage: OWN }, PHOTO)).toBe(OWN);
    // "Off" is now zero sources, not the legacy `enabled` flag — rotation
    // with sources still configured is active even if `enabled` is stale.
    expect(resolveScreenBackground({ backgroundImage: OWN, backgroundRotation: { ...ROTATION, sources: [] } }, PHOTO)).toBe(OWN);
  });

  it('is active from sources alone, even with the legacy enabled flag false', () => {
    expect(resolveScreenBackground({ backgroundImage: OWN, backgroundRotation: { ...ROTATION, enabled: false } }, PHOTO)).toBe(PHOTO);
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

describe('pickedBackground', () => {
  it('turns rotation off and keeps its settings for next time', () => {
    expect(pickedBackground(rotating, PHOTO)).toEqual({
      backgroundImage: PHOTO,
      // Stopping drops the legacy flag and empties `sources`; every other setting stays.
      backgroundRotation: { query: 'nature landscape', intervalMinutes: 60, sources: [] },
    });
  });

  it('only sets the picture when rotation is off or was never set up', () => {
    expect(pickedBackground({ backgroundRotation: { ...ROTATION, sources: [] } }, PHOTO)).toEqual({ backgroundImage: PHOTO });
    expect(pickedBackground({}, PHOTO)).toEqual({ backgroundImage: PHOTO });
    expect(pickedBackground(undefined, PHOTO)).toEqual({ backgroundImage: PHOTO });
  });
});
