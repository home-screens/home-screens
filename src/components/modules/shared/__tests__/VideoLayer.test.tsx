// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { StrictMode } from 'react';
import VideoLayer from '../VideoLayer';

// jsdom doesn't implement media playback — stub the methods VideoLayer calls.
beforeAll(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderLayer(props: Partial<React.ComponentProps<typeof VideoLayer>> = {}) {
  const onEnded = vi.fn();
  const utils = render(
    <VideoLayer src="/api/backgrounds/serve?file=clip.mp4" active autoPlay onEnded={onEnded} {...props} />,
  );
  const video = utils.container.querySelector('video')!;
  return { ...utils, video, onEnded };
}

describe('VideoLayer completion paths', () => {
  it('fires onEnded when the video ends', () => {
    const { video, onEnded } = renderLayer();
    fireEvent(video, new Event('ended'));
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('fires onEnded on a decode/network error', () => {
    const { video, onEnded } = renderLayer();
    fireEvent(video, new Event('error'));
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('force-advances when the max-duration cap elapses', () => {
    const { onEnded } = renderLayer({ maxDurationMs: 5000 });
    vi.advanceTimersByTime(4999);
    expect(onEnded).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('force-advances after a stall outlives the grace window', () => {
    const { video, onEnded } = renderLayer();
    fireEvent(video, new Event('stalled'));
    vi.advanceTimersByTime(9_999);
    expect(onEnded).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('a recovering stall (playing resumes) cancels the grace timer', () => {
    const { video, onEnded } = renderLayer();
    fireEvent(video, new Event('stalled'));
    vi.advanceTimersByTime(5_000);
    fireEvent(video, new Event('playing'));
    vi.advanceTimersByTime(60_000);
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('fires onEnded at most once per activation', () => {
    const { video, onEnded } = renderLayer({ maxDurationMs: 5000 });
    fireEvent(video, new Event('ended'));
    fireEvent(video, new Event('error'));
    vi.advanceTimersByTime(10_000);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('does not fire onEnded on `ended` when looping', () => {
    const { video, onEnded } = renderLayer({ loop: true });
    fireEvent(video, new Event('ended'));
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('pauses instead when no onEnded handler is provided', () => {
    const { container } = render(
      <VideoLayer src="/x.mp4" active autoPlay maxDurationMs={1000} />,
    );
    const video = container.querySelector('video')!;
    const pause = vi.spyOn(video, 'pause');
    vi.advanceTimersByTime(1001);
    expect(pause).toHaveBeenCalled();
  });
});

describe('VideoLayer activation states', () => {
  it('detaches src and pauses when inactive (frees the decoder)', () => {
    const { video } = renderLayer({ active: false });
    expect(video.getAttribute('src')).toBeNull();
    expect(video.style.visibility).toBe('hidden');
  });

  it('keeps src but never plays in editor mode (autoPlay false)', () => {
    const play = HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>;
    play.mockClear();
    const { video } = renderLayer({ autoPlay: false });
    expect(video.getAttribute('src')).toContain('clip.mp4');
    expect(play).not.toHaveBeenCalled();
  });

  it('does not arm stall timers in editor mode', () => {
    const { video, onEnded } = renderLayer({ autoPlay: false });
    fireEvent(video, new Event('stalled'));
    vi.advanceTimersByTime(60_000);
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('sets kiosk-safe playback attributes when playing', () => {
    const { video } = renderLayer();
    expect(video.hasAttribute('autoplay')).toBe(true);
    expect(video.hasAttribute('playsinline')).toBe(true);
    expect(video.muted).toBe(true);
  });
});

describe('letting go of the element', () => {
  const load = () => HTMLMediaElement.prototype.load as ReturnType<typeof vi.fn>;
  const pause = () => HTMLMediaElement.prototype.pause as ReturnType<typeof vi.fn>;
  const SRC = '/api/backgrounds/serve?file=clip.mp4';

  /** What the element looked like each time it was told to load. */
  function recordLoads(): Array<string | null> {
    const seen: Array<string | null> = [];
    load().mockReset();
    load().mockImplementation(function (this: HTMLMediaElement) {
      seen.push(this.getAttribute('src'));
    });
    return seen;
  }

  afterEach(() => {
    load().mockReset();
  });

  it('unloads the clip when the layer goes inactive', () => {
    // Taking the src attribute off does not make an element give up what it
    // has loaded; only a load() with nothing to load does.
    const seen = recordLoads();
    const onEnded = vi.fn();
    const { rerender, container } = render(<VideoLayer src={SRC} active autoPlay onEnded={onEnded} />);
    const video = container.querySelector('video')!;
    expect(video.getAttribute('src')).toBe(SRC);
    expect(seen).toEqual([]);
    pause().mockClear();

    rerender(<VideoLayer src={SRC} active={false} autoPlay onEnded={onEnded} />);
    expect(pause()).toHaveBeenCalled();
    expect(video.getAttribute('src')).toBeNull();
    expect(seen).toEqual([null]);
  });

  it('unloads the clip when the layer is unmounted', () => {
    const seen = recordLoads();
    const { unmount, container } = render(<VideoLayer src={SRC} active autoPlay onEnded={vi.fn()} />);
    const video = container.querySelector('video')!;
    pause().mockClear();

    unmount();
    expect(pause()).toHaveBeenCalled();
    expect(video.getAttribute('src')).toBeNull();
    expect(seen).toEqual([null]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not unload a layer that never held a clip', () => {
    const seen = recordLoads();
    const { unmount } = render(<VideoLayer src={SRC} active={false} autoPlay onEnded={vi.fn()} />);
    unmount();
    expect(seen).toEqual([]);
  });

  it('takes the clip back when the layer is active again', () => {
    recordLoads();
    const { rerender, container } = render(<VideoLayer src={SRC} active autoPlay onEnded={vi.fn()} />);
    const video = container.querySelector('video')!;
    rerender(<VideoLayer src={SRC} active={false} autoPlay onEnded={vi.fn()} />);
    const play = HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>;
    play.mockClear();

    rerender(<VideoLayer src={SRC} active autoPlay onEnded={vi.fn()} />);
    expect(video.getAttribute('src')).toBe(SRC);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('never reports the clip finished because it was let go', () => {
    // Whatever the browser says while the element empties (a real one fires
    // `abort` and `emptied`; these are the worst it could say) is about the
    // unloading, not about the clip.
    load().mockReset();
    load().mockImplementation(function (this: HTMLMediaElement) {
      for (const type of ['abort', 'emptied', 'error', 'stalled', 'waiting', 'ended']) fireEvent(this, new Event(type));
    });
    const onEnded = vi.fn();
    const { rerender, unmount } = render(<VideoLayer src={SRC} active autoPlay onEnded={onEnded} />);

    rerender(<VideoLayer src={SRC} active={false} autoPlay onEnded={onEnded} />);
    vi.advanceTimersByTime(60_000);
    expect(onEnded).not.toHaveBeenCalled();

    rerender(<VideoLayer src={SRC} active autoPlay onEnded={onEnded} />);
    unmount();
    vi.advanceTimersByTime(60_000);
    expect(onEnded).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still reports a clip that fails after coming back', () => {
    recordLoads();
    const onEnded = vi.fn();
    const { rerender, container } = render(<VideoLayer src={SRC} active autoPlay onEnded={onEnded} />);
    rerender(<VideoLayer src={SRC} active={false} autoPlay onEnded={onEnded} />);
    rerender(<VideoLayer src={SRC} active autoPlay onEnded={onEnded} />);
    fireEvent(container.querySelector('video')!, new Event('error'));
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('survives a doubled mount with its clip attached', () => {
    recordLoads();
    const { container } = render(
      <StrictMode><VideoLayer src={SRC} active autoPlay onEnded={vi.fn()} /></StrictMode>,
    );
    expect(container.querySelector('video')!.getAttribute('src')).toBe(SRC);
  });
});

describe('replaying in place', () => {
  it('reports the end of every run, not just the first', () => {
    // The finished latch exists so one run cannot fire onEnded twice. A
    // replay is a new run, so it has to clear it. Without that the caller
    // never hears the second clip finish, and a Live Photo set to play twice
    // leaves its last frame sitting over the still Apple chose.
    const onEnded = vi.fn();
    const { rerender } = render(
      <VideoLayer src="/api/backgrounds/serve?file=clip.mp4" active autoPlay onEnded={onEnded} restartSignal={0} />,
    );
    const video = document.querySelector('video')!;
    fireEvent(video, new Event('ended'));
    expect(onEnded).toHaveBeenCalledTimes(1);

    rerender(
      <VideoLayer src="/api/backgrounds/serve?file=clip.mp4" active autoPlay onEnded={onEnded} restartSignal={1} />,
    );
    fireEvent(video, new Event('ended'));
    expect(onEnded).toHaveBeenCalledTimes(2);
  });

  it('seeks back to the top rather than remounting', () => {
    // Remounting was the obvious way to replay and the expensive one: it
    // destroys and rebuilds a compositing layer, which forces every element
    // sampling a backdrop to re-sample. Seeking leaves the layer tree alone,
    // so the same element must survive the replay.
    const onEnded = vi.fn();
    const { rerender } = render(
      <VideoLayer src="/api/backgrounds/serve?file=clip.mp4" active autoPlay onEnded={onEnded} restartSignal={0} />,
    );
    const before = document.querySelector('video')!;
    before.currentTime = 1.2;

    rerender(
      <VideoLayer src="/api/backgrounds/serve?file=clip.mp4" active autoPlay onEnded={onEnded} restartSignal={1} />,
    );
    const after = document.querySelector('video')!;
    expect(after).toBe(before);
    expect(after.currentTime).toBe(0);
  });
});
