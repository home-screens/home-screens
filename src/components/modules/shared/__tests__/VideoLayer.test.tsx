// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import VideoLayer from '../VideoLayer';

// jsdom doesn't implement media playback — stub the methods VideoLayer calls.
beforeAll(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
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
