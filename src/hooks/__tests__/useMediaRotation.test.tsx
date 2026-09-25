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

describe('useMediaRotation resume across remounts', () => {
  // A screen unmounts its modules when it rotates away. Each case uses its
  // own id: the saved points outlive any one render, as they do on a wall.
  const items = [photo(0), photo(1), photo(2), photo(3)];
  const mount = (id: string | undefined, list = items, key = '/api/photos', shuffle = false) => renderHook(
    ({ list: current, key: source }) => useMediaRotation(current, 5000, shuffle, true, source, id),
    { initialProps: { list, key } },
  );
  /** Show the second slide for most of its turn, then leave. */
  const leaveOnSecondSlide = (first: ReturnType<typeof mount>) => {
    act(() => vi.advanceTimersByTime(5001)); // → index 1
    act(() => vi.advanceTimersByTime(4000));
    first.unmount();
  };

  it('comes back on the slide after the one that was showing', () => {
    leaveOnSecondSlide(mount('resume-next'));

    const second = mount('resume-next', [...items]);
    expect(second.result.current[1]).toBe(2);
    act(() => vi.advanceTimersByTime(5001));
    expect(second.result.current[1]).toBe(3);
  });

  it('shows a slide again when the screen left just after it came up', () => {
    // The default interval and screen dwell are both 30 s, so the advance and
    // the rotation land together: the slide that just came up was never seen.
    const first = mount('resume-same');
    act(() => vi.advanceTimersByTime(5001)); // → index 1
    act(() => vi.advanceTimersByTime(100));
    first.unmount();

    expect(mount('resume-same', [...items]).result.current[1]).toBe(1);
  });

  it('waits for the list to arrive, as a module does on a cold mount', () => {
    leaveOnSecondSlide(mount('resume-late'));

    const second = mount('resume-late', []);
    expect(second.result.current[0]).toEqual([]);
    second.rerender({ list: [...items], key: '/api/photos' });
    expect(second.result.current[1]).toBe(2);
  });

  it('keeps the shuffled order, so a pass still visits every slide once', () => {
    const first = mount('resume-shuffle', items, '/api/photos', true);
    const seen = [first.result.current[1]];
    act(() => vi.advanceTimersByTime(5001));
    seen.push(first.result.current[1]);
    act(() => vi.advanceTimersByTime(4000));
    first.unmount();

    const second = mount('resume-shuffle', [...items], '/api/photos', true);
    seen.push(second.result.current[1]);
    act(() => vi.advanceTimersByTime(5001));
    seen.push(second.result.current[1]);
    expect(new Set(seen).size).toBe(items.length);
  });

  it('plays the fresh URLs of the list it came back to, in the saved order', () => {
    // Video URLs carry a signed token that runs out, and a screen can come
    // back hours later; the saved pass must not replay the old tokens.
    const signed = (token: string) => [
      { url: `/api/immich/video?assetId=a&mt=${token}`, type: 'video' as const },
      { url: `/api/immich/video?assetId=b&mt=${token}`, type: 'video' as const },
      { url: `/api/immich/video?assetId=c&mt=${token}`, type: 'video' as const },
      { url: `/api/immich/video?assetId=d&mt=${token}`, type: 'video' as const },
    ];
    const first = mount('resume-tokens', signed('old'));
    act(() => first.result.current[2]()); // → index 1
    act(() => vi.advanceTimersByTime(4000));
    first.unmount();

    // The list came back in another order, as a shuffled album's does.
    const fresh = signed('new').reverse();
    const second = mount('resume-tokens', fresh);
    const [batch, index] = second.result.current;
    expect(batch.every((item) => item.url.endsWith('mt=new'))).toBe(true);
    expect(batch[index].url).toBe('/api/immich/video?assetId=c&mt=new');
  });

  it('starts from the top on a new deal of different photos', () => {
    leaveOnSecondSlide(mount('resume-deal'));

    const dealt = [photo(10), photo(11), photo(12), photo(13)];
    const second = mount('resume-deal', dealt);
    expect(second.result.current[0]).toBe(dealt);
    expect(second.result.current[1]).toBe(0);
  });

  it('starts a new pass on the newest list when the last slide was already seen', () => {
    const first = mount('resume-wrap');
    for (let i = 0; i < 3; i++) act(() => vi.advanceTimersByTime(5001)); // → index 3
    act(() => vi.advanceTimersByTime(4000));
    first.unmount();

    const refreshed = [...items];
    const second = mount('resume-wrap', refreshed);
    expect(second.result.current[0]).toBe(refreshed);
    expect(second.result.current[1]).toBe(0);
  });

  it('starts from the top for a different folder or album', () => {
    leaveOnSecondSlide(mount('resume-source', items, '/api/photos?folder=a'));

    expect(mount('resume-source', [...items], '/api/photos?folder=b').result.current[1]).toBe(0);
  });

  it('starts from the top when the list grew or shrank', () => {
    leaveOnSecondSlide(mount('resume-length'));

    expect(mount('resume-length', [...items, photo(4)]).result.current[1]).toBe(0);
  });

  it('does not resume without an id (the editor preview)', () => {
    leaveOnSecondSlide(mount(undefined));

    expect(mount(undefined, [...items]).result.current[1]).toBe(0);
  });

  it('starts a new folder from the top when it is picked while the slideshow is up', () => {
    // An uncached folder clears the list while it loads. The same number of
    // photos coming back is the new folder, not the old one to resume.
    const folderA = [photo(0), photo(1), photo(2), photo(3)];
    const folderB = [photo(20), photo(21), photo(22), photo(23)];
    const view = mount('resume-switch', folderA, '/api/photos?folder=a');
    act(() => vi.advanceTimersByTime(5001)); // → index 1

    view.rerender({ list: folderA, key: '/api/photos?folder=b' }); // the old list, one render
    view.rerender({ list: [], key: '/api/photos?folder=b' });
    view.rerender({ list: folderB, key: '/api/photos?folder=b' });
    expect(view.result.current[0]).toBe(folderB);
    expect(view.result.current[1]).toBe(0);
  });

});
