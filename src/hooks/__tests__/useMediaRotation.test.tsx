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
    expect(result.current[0]).toBe(0);
    act(() => vi.advanceTimersByTime(5001));
    expect(result.current[0]).toBe(1);
    act(() => vi.advanceTimersByTime(5001));
    expect(result.current[0]).toBe(2);
  });

  it('does not run a timer on video slides — they wait for advance()', () => {
    const { result } = renderHook(() => useMediaRotation([video(0), photo(1)], 5000));
    expect(result.current[0]).toBe(0);
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current[0]).toBe(0);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(1);
  });

  it('resumes the timer on the photo that follows a video', () => {
    const { result } = renderHook(() => useMediaRotation([video(0), photo(1), photo(2)], 5000));
    act(() => result.current[1]()); // video ended
    expect(result.current[0]).toBe(1);
    act(() => vi.advanceTimersByTime(5001));
    expect(result.current[0]).toBe(2);
  });

  it('wraps around to the start after the last item', () => {
    const { result } = renderHook(() => useMediaRotation([photo(0), photo(1)], 5000));
    act(() => vi.advanceTimersByTime(5001));
    act(() => vi.advanceTimersByTime(5001));
    expect(result.current[0]).toBe(0);
  });

  it('treats videos as timed slides when playVideos is false (editor preview)', () => {
    const { result } = renderHook(() => useMediaRotation([video(0), photo(1)], 5000, false, false));
    act(() => vi.advanceTimersByTime(5001));
    expect(result.current[0]).toBe(1);
  });

  it('holds a single item without any timers', () => {
    const { result } = renderHook(() => useMediaRotation([photo(0)], 5000));
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current[0]).toBe(0);
    act(() => result.current[1]()); // advance() is a no-op for one item
    expect(result.current[0]).toBe(0);
  });

  it('visits every index exactly once per cycle when shuffled', () => {
    const items = [photo(0), photo(1), photo(2), photo(3)];
    const { result } = renderHook(() => useMediaRotation(items, 1000, true));
    const seen = new Set<number>();
    for (let i = 0; i < items.length; i++) {
      seen.add(result.current[0]);
      act(() => vi.advanceTimersByTime(1001));
    }
    expect(seen.size).toBe(items.length);
  });
});
