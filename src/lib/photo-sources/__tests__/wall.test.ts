import { describe, it, expect } from 'vitest';
import { wallPhotoSource } from '../wall';

describe('wallPhotoSource', () => {
  it('is never a stream', async () => {
    expect(await wallPhotoSource.list({ source: { kind: 'wall', group: 'color', ids: ['ocean'] }, count: 10, media: 'photos' })).toEqual([]);
  });

  it('picks one of the chosen walls by its own path, avoiding the one showing', async () => {
    const source = { kind: 'wall' as const, group: 'color' as const, ids: ['ocean', 'dusk'] };
    const picked = await wallPhotoSource.pickOne({ source, canvas: { w: 1, h: 1 }, previous: '/starter-backgrounds/ocean.svg' });
    expect(picked).toEqual({ kind: 'static', path: '/starter-backgrounds/dusk.svg' });
  });

  it('shows the only wall again when it is the only one', async () => {
    const source = { kind: 'wall' as const, group: 'pattern' as const, ids: ['pattern-dots'] };
    const picked = await wallPhotoSource.pickOne({ source, canvas: { w: 1, h: 1 }, previous: '/starter-backgrounds/pattern-dots.svg' });
    expect(picked).toEqual({ kind: 'static', path: '/starter-backgrounds/pattern-dots.svg' });
  });

  it('has nothing for ids that are not walls of the group, or none at all', async () => {
    expect(await wallPhotoSource.pickOne({ source: { kind: 'wall', group: 'color', ids: ['pattern-dots', 'nope'] }, canvas: { w: 1, h: 1 } })).toBeNull();
    expect(await wallPhotoSource.pickOne({ source: { kind: 'wall', group: 'color', ids: [] }, canvas: { w: 1, h: 1 } })).toBeNull();
  });
});
