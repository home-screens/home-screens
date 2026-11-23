// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { LivePhotoMotionLayer } from '../LivePhotoMotion';

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

function renderMotion(props: Partial<React.ComponentProps<typeof LivePhotoMotionLayer>> = {}) {
  const utils = render(<LivePhotoMotionLayer src="/api/backgrounds/serve?file=a.live.mov" motion="once" slideMs={30_000} {...props} />);
  const wrapper = utils.container.querySelector<HTMLElement>('[data-testid="live-photo-motion"]')!;
  const video = () => utils.container.querySelector('video')!;
  return { ...utils, wrapper, video };
}

describe('LivePhotoMotionLayer', () => {
  it('fades in when the clip plays and out when it ends', () => {
    const { wrapper, video } = renderMotion();
    expect(wrapper.style.opacity).toBe('0');
    fireEvent(video(), new Event('playing'));
    expect(wrapper.style.opacity).toBe('1');
    fireEvent(video(), new Event('ended'));
    expect(wrapper.style.opacity).toBe('0');
  });

  it('stays hidden when a clip that stalled out finds its data after all', () => {
    // VideoLayer's finish latch swallows the later `ended`, so showing it
    // again would leave the clip's last frame over the still all slide.
    const { wrapper, video } = renderMotion();
    fireEvent(video(), new Event('playing'));
    fireEvent(video(), new Event('waiting'));
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(wrapper.style.opacity).toBe('0');
    fireEvent(video(), new Event('playing'));
    expect(wrapper.style.opacity).toBe('0');
  });

  it('lets the decoder go once the clip is done and will not play again', () => {
    const { video } = renderMotion();
    fireEvent(video(), new Event('playing'));
    fireEvent(video(), new Event('ended'));
    expect(video().getAttribute('src')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(450); });
    expect(video().getAttribute('src')).toBeNull();
  });

  it('plays again halfway through a slide set to twice, and only then lets go', () => {
    const { wrapper, video } = renderMotion({ motion: 'twice', slideMs: 20_000 });
    fireEvent(video(), new Event('playing'));
    fireEvent(video(), new Event('ended'));
    act(() => { vi.advanceTimersByTime(1_000); });
    // Kept for the replay.
    expect(video().getAttribute('src')).not.toBeNull();

    act(() => { vi.advanceTimersByTime(9_000); });
    fireEvent(video(), new Event('playing'));
    expect(wrapper.style.opacity).toBe('1');
    fireEvent(video(), new Event('ended'));
    expect(wrapper.style.opacity).toBe('0');
    act(() => { vi.advanceTimersByTime(450); });
    expect(video().getAttribute('src')).toBeNull();
  });

  it('holds the clip back until a sliding picture has landed', () => {
    const { video } = renderMotion({ startAfterMs: 800 });
    expect(video().getAttribute('src')).toBeNull();
    act(() => { vi.advanceTimersByTime(800); });
    expect(video().getAttribute('src')).not.toBeNull();
  });

  it('plays once on a slide too short to fit a second play', () => {
    const { video } = renderMotion({ motion: 'twice', slideMs: 5_000 });
    fireEvent(video(), new Event('playing'));
    fireEvent(video(), new Event('ended'));
    act(() => { vi.advanceTimersByTime(450); });
    expect(video().getAttribute('src')).toBeNull();
  });
});
