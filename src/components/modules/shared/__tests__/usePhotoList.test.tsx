// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { MediaListItem } from '@/types/config';
import { signMediaToken, verifyMediaToken } from '@/lib/media-token';
import { stripMediaToken } from '@/lib/media-url';

// The list read is the one thing stubbed: each test hands the hook the list
// the hub would have answered with at that moment.
let listed: MediaListItem[] | null = null;
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: () => [listed, null, null],
}));
vi.mock('@/hooks/useModuleCommand', () => ({ useModuleCommand: () => {} }));

import { usePhotoList, withNewestTokens } from '../usePhotoList';

const SECRET = 'a-test-secret';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const clipResource = (n: number) => `family/photo${n}.live.mov`;
const tokened = (resource: string) =>
  `/api/backgrounds/serve?file=${encodeURIComponent(resource)}&mt=${encodeURIComponent(signMediaToken(SECRET, resource))}`;

/** What the hub answers with right now: the same pictures, tokens minted this minute. */
function livePhotoList(count: number): MediaListItem[] {
  return Array.from({ length: count }, (_, n) => ({
    url: `/api/backgrounds/serve?file=family/photo${n}.jpg`,
    type: 'image' as const,
    liveUrl: tokened(clipResource(n)),
  }));
}

function videoList(count: number): MediaListItem[] {
  return Array.from({ length: count }, (_, n) => ({ url: tokened(`family/film${n}.mp4`), type: 'video' as const }));
}

function tokenOf(url: string): string {
  return new URL(url, 'http://hub.local').searchParams.get('mt') ?? '';
}

function resourceOf(url: string): string {
  return new URL(url, 'http://hub.local').searchParams.get('file') ?? '';
}

const config = { photoSource: { kind: 'library' as const, directory: 'family' }, intervalMs: 5 * MINUTE, shuffle: false };

function mount() {
  return renderHook(() => usePhotoList('photo-slideshow', config as never, { playVideos: true }));
}

beforeEach(() => {
  vi.useFakeTimers();
  listed = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePhotoList access tokens', () => {
  it('keeps a Live Photo clip playable through a pass that outlives its first token', () => {
    // 100 pictures at five minutes each: one pass is over eight hours, and
    // the token minted with the first read is good for six.
    listed = livePhotoList(100);
    const { result, rerender } = mount();
    const firstBatch = result.current.batch;
    const started = Date.now();

    let lastIndex = -1;
    while (Date.now() - started < 8 * HOUR) {
      // One slide at a time, each picture reporting loaded so the layers flip.
      for (let slide = 0; slide < 2; slide++) {
        act(() => { vi.advanceTimersByTime(5 * MINUTE); });
        act(() => { result.current.layerReady(0); result.current.layerReady(1); });
      }
      // The ten minute list refresh: same pictures, new tokens.
      listed = livePhotoList(100);
      rerender();

      const shown = result.current.sources[result.current.activeLayer];
      expect(shown?.liveUrl).toBeTruthy();
      const hoursIn = ((Date.now() - started) / HOUR).toFixed(2);
      expect(
        verifyMediaToken(SECRET, resourceOf(shown!.liveUrl!), tokenOf(shown!.liveUrl!)),
        `clip token still good ${hoursIn} h in`,
      ).toBe(true);

      // The pass itself is untouched: same dealt batch, still walking forward.
      expect(result.current.batch).toBe(firstBatch);
      const index = firstBatch.findIndex((item) => item.url === shown!.url);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
    expect(lastIndex).toBeGreaterThan(90);
  });

  it('hands a video slide the newest token for the same film, and nothing else changes', () => {
    listed = videoList(3);
    const { result, rerender } = mount();
    const before = result.current.sources[result.current.activeLayer]!;
    const batch = result.current.batch;
    const position = result.current.position;

    act(() => { vi.advanceTimersByTime(10 * MINUTE); });
    listed = videoList(3);
    rerender();

    const after = result.current.sources[result.current.activeLayer]!;
    expect(after.url).not.toBe(before.url);
    expect(stripMediaToken(after.url)).toBe(stripMediaToken(before.url));
    expect(after.url).toBe(listed[0].url);
    expect(result.current.batch).toBe(batch);
    expect(result.current.position).toEqual(position);
    expect(result.current.activeLayer).toBe(0);
  });

  it('gives the layers the same objects again when a re-render brings no new list', () => {
    listed = livePhotoList(3);
    const { result, rerender } = mount();
    const before = result.current.sources;
    rerender();
    expect(result.current.sources).toBe(before);
  });

  it('keeps a slide as it was dealt when the newest list no longer has it', () => {
    const [gone, kept] = videoList(2);
    const newer = videoList(2)[1];
    const newest = new Map([[`video ${stripMediaToken(newer.url)}`, newer]]);
    expect(withNewestTokens([gone, kept], newest)).toEqual([gone, newer]);
  });

  it('never swaps a picture for a film at the same address', () => {
    const picture: MediaListItem = { url: '/api/backgrounds/serve?file=family/a', type: 'image' };
    const film: MediaListItem = { url: '/api/backgrounds/serve?file=family/a', type: 'video' };
    const newest = new Map([[`video ${stripMediaToken(film.url)}`, film]]);
    const sources: [MediaListItem, null] = [picture, null];
    expect(withNewestTokens(sources, newest)).toBe(sources);
  });
});
