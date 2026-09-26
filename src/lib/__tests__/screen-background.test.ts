import { describe, it, expect } from 'vitest';
import { resolveScreenBackground } from '@/lib/screen-background';

const OWN = '/starter-backgrounds/ocean.svg';
const PHOTO = '/api/backgrounds/serve?file=rotation-unsplash-a.jpg';
const ROTATION = { enabled: true, source: 'unsplash' as const, query: 'nature landscape', intervalMinutes: 60 };
const rotating = { backgroundImage: OWN, backgroundRotation: ROTATION };

describe('resolveScreenBackground', () => {
  it('paints the own picture when rotation is off, whatever rotation last answered', () => {
    expect(resolveScreenBackground({ backgroundImage: OWN }, undefined)).toBe(OWN);
    expect(resolveScreenBackground({ backgroundImage: OWN }, PHOTO)).toBe(OWN);
    expect(resolveScreenBackground({ backgroundImage: OWN, backgroundRotation: { ...ROTATION, enabled: false } }, PHOTO)).toBe(OWN);
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
