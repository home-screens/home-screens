// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaRotation } from '@/hooks/useRotatingIndex';
import type { MediaListItem } from '@/types/config';

const photo = (n: number): MediaListItem => ({ url: `/p${n}.jpg`, type: 'image' });
const video = (n: number): MediaListItem => ({ url: `/v${n}.mp4`, type: 'video' });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useMediaRotation', () => {
  it('advances photo slides on the interval timer', () => {
    const { result } = renderHook(() => useMediaRotation([photo(0), photo(1), photo(2)], 5000));
    expect(result.current[1]).toBe(0);
    act(() => vi.advanceTimersByTime(5001));
    expect(result.current[1]).toBe(1);
    act(() => vi.advanceTimersByTime(5001));
    expect(result.current[1]).toBe(2);
  });

  it('does not run a timer on video slides — they wait for advance()', () => {
    const { result } = renderHook(() => useMediaRotation([video(0), photo(1)], 5000));
    expect(result.current[1]).toBe(0);
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current[1]).toBe(0);
    act(() => result.current[2]());
    expect(result.current[1]).toBe(1);
  });

  it('resumes the timer on the photo that follows a video', () => {
    const { result } = renderHook(() => useMediaRotation([video(0), photo(1), photo(2)], 5000));
    act(() => result.current[2]()); // video ended
    expect(result.current[1]).toBe(1);
    act(() => vi.advanceTimersByTime(5001));
    expect(result.current[1]).toBe(2);
  });

  it('wraps around to the start after the last item', () => {
    const { result } = renderHook(() => useMediaRotation([photo(0), photo(1)], 5000));
    act(() => vi.advanceTimersByTime(5001));
    act(() => vi.advanceTimersByTime(5001));
    expect(result.current[1]).toBe(0);
  });

  it('treats videos as timed slides when playVideos is false (editor preview)', () => {
    const { result } = renderHook(() => useMediaRotation([video(0), photo(1)], 5000, false, false));
    act(() => vi.advanceTimersByTime(5001));
    expect(result.current[1]).toBe(1);
  });

  it('holds a single item without any timers', () => {
    const { result } = renderHook(() => useMediaRotation([photo(0)], 5000));
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current[1]).toBe(0);
    act(() => result.current[2]()); // advance() is a no-op for one item
    expect(result.current[1]).toBe(0);
  });

  it('visits every index exactly once per cycle when shuffled', () => {
    const items = [photo(0), photo(1), photo(2), photo(3)];
    const { result } = renderHook(() => useMediaRotation(items, 1000, true));
    const seen = new Set<number>();
    for (let i = 0; i < items.length; i++) {
      seen.add(result.current[1]);
      act(() => vi.advanceTimersByTime(1001));
    }
    expect(seen.size).toBe(items.length);
  });
});

describe('useMediaRotation batch holding', () => {
  it('keeps the current batch until the pass wraps, then adopts the refresh', () => {
    const batchA = [photo(0), photo(1), photo(2)];
    const batchB = [photo(10), photo(11), photo(12)];
    const { result, rerender } = renderHook(
      ({ items }) => useMediaRotation(items, 5000, false, true, '/api/photos'),
      { initialProps: { items: batchA } },
    );

    act(() => vi.advanceTimersByTime(5001)); // → index 1
    act(() => vi.advanceTimersByTime(5001)); // → index 2

    // A same-source refresh arrives mid-pass: the current batch keeps
    // running — no silent photo swaps and no repeats from the new deal.
    rerender({ items: batchB });
    expect(result.current[0]).toBe(batchA);
    expect(result.current[1]).toBe(2);

    // The wrap commits pos 0 and the held refresh takes over in the same
    // flush — the pass restarts on the new batch.
    act(() => vi.advanceTimersByTime(5001));
    expect(result.current[0]).toBe(batchB);
    expect(result.current[1]).toBe(0);
    act(() => vi.advanceTimersByTime(5001));
    expect(result.current[1]).toBe(1);
    expect(result.current[0][1]).toBe(batchB[1]); // walking the new batch's content
  });

  it('adopts a new batch immediately when the source key changes', () => {
    const batchA = [photo(0), photo(1)];
    const batchB = [photo(10), photo(11)];
    const { result, rerender } = renderHook(
      ({ items, key }) => useMediaRotation(items, 5000, false, true, key),
      { initialProps: { items: batchA, key: '/api/photos?folder=a' } },
    );

    act(() => vi.advanceTimersByTime(5001)); // → index 1
    rerender({ items: batchB, key: '/api/photos?folder=b' });

    expect(result.current[0]).toBe(batchB);
    expect(result.current[1]).toBe(0);
  });

  it('adopts a same-key refresh immediately for a one-item batch', () => {
    const fresh = [photo(9)];
    const { result, rerender } = renderHook(
      ({ items }) => useMediaRotation(items, 5000, false, true, '/api/photos'),
      { initialProps: { items: [photo(0)] } },
    );

    rerender({ items: fresh });

    expect(result.current[0]).toBe(fresh);
  });

  it('adopts length changes when no batch key is given (legacy callers)', () => {
    const batchA = [photo(0), photo(1)];
    const batchB = [photo(10), photo(11), photo(12)];
    const { result, rerender } = renderHook(
      ({ items }) => useMediaRotation(items, 5000),
      { initialProps: { items: batchA } },
    );

    act(() => vi.advanceTimersByTime(5001)); // → index 1
    rerender({ items: batchB });

    expect(result.current[0]).toBe(batchB);
    expect(result.current[1]).toBe(0);
  });
});

describe('useMediaRotation shuffle toggle', () => {
  it('restores sequential order when shuffle is turned off', () => {
    // advance()'s reshuffle-on-wrap only fires while shuffle is on, so
    // without an explicit rebuild the batch would walk its shuffled order
    // forever after the toggle went off.
    const items = Array.from({ length: 6 }, (_, i) => photo(i));
    const { result, rerender } = renderHook(
      ({ shuffle }) => useMediaRotation(items, 5000, shuffle, true, '/api/photos'),
      { initialProps: { shuffle: true } },
    );

    act(() => vi.advanceTimersByTime(5001));
    rerender({ shuffle: false });

    // The rebuild happens in place, so the pass carries on from where it was
    // (pos 1) rather than jumping the slideshow back to its first photo.
    const seen: number[] = [];
    for (let i = 0; i < items.length; i++) {
      seen.push(result.current[1]);
      act(() => vi.advanceTimersByTime(5001));
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 0]);
  });

  it('reshuffles immediately when shuffle is turned on', () => {
    const items = Array.from({ length: 12 }, (_, i) => photo(i));
    const { result, rerender } = renderHook(
      ({ shuffle }) => useMediaRotation(items, 5000, shuffle, true, '/api/photos'),
      { initialProps: { shuffle: false } },
    );

    act(() => vi.advanceTimersByTime(5001)); // → index 1, sequential
    rerender({ shuffle: true });

    // Walk out the rest of the pass (pos 1..11) without wrapping, so this
    // reads the order the toggle built rather than advance()'s wrap reshuffle.
    const seen: number[] = [];
    for (let i = 1; i < items.length; i++) {
      seen.push(result.current[1]);
      act(() => vi.advanceTimersByTime(5001));
    }
    expect(new Set(seen).size).toBe(seen.length); // no repeats
    expect(seen).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); // not still sequential
  });

  it('a shuffle toggle does not pull a held refresh in early', () => {
    const batchA = [photo(0), photo(1), photo(2), photo(3)];
    const batchB = [photo(10), photo(11), photo(12), photo(13)];
    const { result, rerender } = renderHook(
      ({ items, shuffle }) => useMediaRotation(items, 5000, shuffle, true, '/api/photos'),
      { initialProps: { items: batchA, shuffle: false } },
    );

    act(() => vi.advanceTimersByTime(5001)); // → index 1
    rerender({ items: batchB, shuffle: false }); // same-key refresh: held
    expect(result.current[0]).toBe(batchA);

    rerender({ items: batchB, shuffle: true });
    expect(result.current[0]).toBe(batchA);
  });
});
