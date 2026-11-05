import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsMock = vi.hoisted(() => ({ readdir: vi.fn(), stat: vi.fn(), unlink: vi.fn() }));
vi.mock('fs', () => ({ promises: fsMock }));
vi.mock('@/lib/thumbnails', () => ({ removeThumbnails: vi.fn() }));

import { pruneRotationFiles } from '@/lib/background-rotation-prune';
import { removeThumbnails } from '@/lib/thumbnails';
import type { BackgroundCache } from '@/lib/background-rotation-cache';
import type { ScreenConfiguration } from '@/types/config';

const HOUR = 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function library(files: Record<string, number>) {
  fsMock.readdir.mockResolvedValue(Object.keys(files).map((name) => ({ name, isFile: () => true })));
  fsMock.stat.mockImplementation(async (p: string) => ({ mtimeMs: NOW - files[String(p).split('/').pop()!] }));
}

const pick = (id: string) => `/api/backgrounds/serve?file=rotation-unsplash-pick-${id}.jpg`;
const configWith = (urls: string[], where: 'screens' | 'displays' = 'screens'): Pick<ScreenConfiguration, 'screens' | 'displays'> => {
  const screen = { id: 's1', name: 'S', backgroundImage: '', modules: [], backgroundRotation: { sources: ['unsplash'], query: '', intervalMinutes: 60, unsplashImages: urls } };
  return where === 'screens' ? { screens: [screen as never], displays: [] } : { screens: [], displays: [{ id: 'd', name: 'D', screens: [screen as never] }] as never };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  fsMock.unlink.mockResolvedValue(undefined);
});

describe('pruneRotationFiles', () => {
  it('keeps a picked photo the screen still names, however old, and drops one nothing names', async () => {
    library({ 'rotation-unsplash-pick-keep.jpg': 40 * HOUR, 'rotation-unsplash-pick-gone.jpg': 40 * HOUR });
    await pruneRotationFiles({}, configWith([pick('keep')]));
    expect(fsMock.unlink).toHaveBeenCalledTimes(1);
    expect(fsMock.unlink.mock.calls[0][0]).toContain('rotation-unsplash-pick-gone.jpg');
    expect(removeThumbnails).toHaveBeenCalledWith('rotation-unsplash-pick-gone.jpg');
  });

  it('finds picks on a display-owned screen too', async () => {
    library({ 'rotation-unsplash-pick-a.jpg': 40 * HOUR });
    await pruneRotationFiles({}, configWith([pick('a')], 'displays'));
    expect(fsMock.unlink).not.toHaveBeenCalled();
  });

  it('leaves a just-downloaded pick alone until autosave has had time to record it', async () => {
    library({ 'rotation-unsplash-pick-fresh.jpg': 60 * 1000 });
    await pruneRotationFiles({}, configWith([]));
    expect(fsMock.unlink).not.toHaveBeenCalled();
  });

  it('still keeps the newest unreferenced rotation photos as a grace buffer', async () => {
    const files: Record<string, number> = {};
    for (let i = 0; i < 10; i++) files[`rotation-unsplash-${i}.jpg`] = (i + 1) * HOUR;
    library(files);
    await pruneRotationFiles({}, configWith([]));
    expect(fsMock.unlink).toHaveBeenCalledTimes(2);
  });

  it('never touches a photo a cache entry names, or files that are not rotation files', async () => {
    library({ 'rotation-immich-x.jpg': 40 * HOUR, 'holiday.jpg': 40 * HOUR });
    const cache = { s1: { path: '/api/backgrounds/serve?file=rotation-immich-x.jpg' } } as unknown as BackgroundCache;
    await pruneRotationFiles(cache, configWith([]));
    expect(fsMock.unlink).not.toHaveBeenCalled();
  });

  it('keeps Immich picks a screen names and drops unchosen ones past the grace period', async () => {
    library({ 'rotation-immich-pick-keep.jpg': 40 * HOUR, 'rotation-immich-pick-gone.jpg': 40 * HOUR, 'rotation-immich-pick-fresh.jpg': 60 * 1000 });
    const screen = { id: 's1', name: 'S', backgroundImage: '', modules: [], backgroundRotation: { sources: ['immich'], query: '', intervalMinutes: 60, immichMode: 'pick', immichImages: ['/api/backgrounds/serve?file=rotation-immich-pick-keep.jpg'] } };
    await pruneRotationFiles({}, { screens: [screen as never], displays: [] });
    expect(fsMock.unlink).toHaveBeenCalledTimes(1);
    expect(fsMock.unlink.mock.calls[0][0]).toContain('rotation-immich-pick-gone.jpg');
  });
});
