// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { __resetAuthImageCacheForTests } from '../useAuthImage';
import { displayFetch } from '@/lib/display-fetch';
import { FAILED_SLIDE_SKIP_MS } from '@/components/modules/shared/useCrossfadeLayers';
import CrossfadeBackground, { CROSSFADE_MS } from '../CrossfadeBackground';

vi.mock('@/lib/display-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/display-fetch')>()),
  displayFetch: vi.fn(),
}));

afterEach(() => {
  cleanup();
  __resetAuthImageCacheForTests();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const imgs = (container: HTMLElement) => Array.from(container.querySelectorAll('img'));
const srcs = (container: HTMLElement) => imgs(container).map((img) => img.getAttribute('src'));

describe('CrossfadeBackground', () => {
  it('paints the first picture at once, at full opacity', () => {
    const { container } = render(<CrossfadeBackground src="/a.jpg" />);
    expect(srcs(container)).toEqual(['/a.jpg']);
    expect(imgs(container)[0].style.opacity).toBe('1');
    expect(imgs(container)[0].style.transition).toBe(`opacity ${CROSSFADE_MS}ms ease-in-out`);
  });

  it('loads a new picture hidden over the old one, fades it in once loaded, then empties the old layer', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<CrossfadeBackground src="/a.jpg" />);
    rerender(<CrossfadeBackground src="/b.jpg" />);

    // Both mounted: the old one still at full opacity underneath, the new one hidden on top.
    expect(srcs(container)).toEqual(['/a.jpg', '/b.jpg']);
    const [old, incoming] = imgs(container);
    expect(old.style.opacity).toBe('1');
    expect(incoming.style.opacity).toBe('0');
    expect(Number(incoming.style.zIndex)).toBeGreaterThan(Number(old.style.zIndex));

    act(() => { fireEvent.load(incoming); });
    expect(imgs(container)[1].style.opacity).toBe('1');
    // The outgoing picture stays underneath for the whole fade, then goes.
    expect(imgs(container)[0].style.opacity).toBe('1');
    act(() => { vi.advanceTimersByTime(CROSSFADE_MS - 1); });
    expect(srcs(container)).toEqual(['/a.jpg', '/b.jpg']);
    act(() => { vi.advanceTimersByTime(1); });
    expect(srcs(container)).toEqual(['/b.jpg']);
  });

  it('a newer picture while one is still loading takes its place instead of queueing', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<CrossfadeBackground src="/a.jpg" />);
    rerender(<CrossfadeBackground src="/b.jpg" />);
    rerender(<CrossfadeBackground src="/c.jpg" />);
    // Two layers at most: the one on screen and the newest, never a stack.
    expect(srcs(container)).toEqual(['/a.jpg', '/c.jpg']);
    act(() => { fireEvent.load(imgs(container)[1]); });
    act(() => { vi.advanceTimersByTime(CROSSFADE_MS); });
    expect(srcs(container)).toEqual(['/c.jpg']);
  });

  it('going back to the picture on screen while another loads drops the loader', () => {
    const { container, rerender } = render(<CrossfadeBackground src="/a.jpg" />);
    rerender(<CrossfadeBackground src="/b.jpg" />);
    rerender(<CrossfadeBackground src="/a.jpg" />);
    expect(srcs(container)).toEqual(['/a.jpg']);
    expect(imgs(container)[0].style.opacity).toBe('1');
  });

  it('treats a picture that finished before hydration as loaded, so a later swap can retire it', () => {
    vi.useFakeTimers();
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    const width = vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(640);
    try {
      const { container, rerender } = render(<CrossfadeBackground src="/a.jpg" />);
      rerender(<CrossfadeBackground src="/b.jpg" />);
      // The incoming layer's ref sees a complete picture and reports it without an onLoad.
      act(() => { vi.advanceTimersByTime(CROSSFADE_MS); });
      expect(srcs(container)).toEqual(['/b.jpg']);
    } finally {
      complete.mockRestore();
      width.mockRestore();
    }
  });

  it('treats a picture that failed before hydration as failed, not as a blank picture', () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    const width = vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0);
    try {
      const { container } = render(<CrossfadeBackground src="/gone.jpg" />);
      expect(container.querySelector('img')).toBeNull();
    } finally {
      complete.mockRestore();
      width.mockRestore();
    }
  });

  it('keeps the outgoing wall photo visible during an auth fetch, then fades over it', async () => {
    vi.useFakeTimers();
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    let count = 0;
    URL.createObjectURL = vi.fn(() => `blob:background-${++count}`);
    URL.revokeObjectURL = vi.fn();
    let releaseSecond!: (response: Response) => void;
    vi.mocked(displayFetch)
      .mockResolvedValueOnce(new Response('first'))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { releaseSecond = resolve; }));
    try {
      const { container, rerender } = render(<CrossfadeBackground src="/api/backgrounds/serve?file=first.jpg" authenticate />);
      await act(async () => { await Promise.resolve(); });
      expect(srcs(container)).toEqual(['blob:background-1']);
      act(() => { fireEvent.load(imgs(container)[0]); });

      rerender(<CrossfadeBackground src="/api/backgrounds/serve?file=second.jpg" authenticate />);
      // The second picture has no bytes yet, so its layer renders nothing and the first stays alone on screen.
      expect(srcs(container)).toEqual(['blob:background-1']);

      await act(async () => { releaseSecond(new Response('second')); });
      expect(srcs(container)).toEqual(['blob:background-1', 'blob:background-2']);
      expect(imgs(container)[1].style.opacity).toBe('0');
      act(() => { fireEvent.load(imgs(container)[1]); });
      expect(imgs(container)[1].style.opacity).toBe('1');
      act(() => { vi.advanceTimersByTime(CROSSFADE_MS); });
      expect(srcs(container)).toEqual(['blob:background-2']);
    } finally {
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
    }
  });

  it('drops a picture that fails, asks for it once more after a wait, then gives up', () => {
    vi.useFakeTimers();
    const { container } = render(<CrossfadeBackground src="/missing.jpg" />);
    act(() => { fireEvent.error(imgs(container)[0]); });
    // No broken-image glyph: the solid color shows.
    expect(container.querySelector('img')).toBeNull();

    act(() => { vi.advanceTimersByTime(FAILED_SLIDE_SKIP_MS); });
    expect(srcs(container)).toEqual(['/missing.jpg']);
    act(() => { fireEvent.error(imgs(container)[0]); });
    expect(container.querySelector('img')).toBeNull();

    act(() => { vi.advanceTimersByTime(FAILED_SLIDE_SKIP_MS * 2); });
    expect(container.querySelector('img')).toBeNull();
  });

  it('a retry is for the picture that failed, not for whatever src is current by then', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<CrossfadeBackground src="/missing.jpg" />);
    act(() => { fireEvent.error(imgs(container)[0]); });
    rerender(<CrossfadeBackground src="/other.jpg" />);
    act(() => { vi.advanceTimersByTime(FAILED_SLIDE_SKIP_MS); });
    expect(srcs(container)).toEqual(['/other.jpg']);
  });

  it('keeps the picture on screen when its replacement fails', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<CrossfadeBackground src="/ok.jpg" />);
    act(() => { fireEvent.load(imgs(container)[0]); });
    rerender(<CrossfadeBackground src="/broken.jpg" />);
    act(() => { fireEvent.error(imgs(container)[1]); });
    expect(srcs(container)).toEqual(['/ok.jpg']);
    expect(imgs(container)[0].style.opacity).toBe('1');
  });

  it('shows nothing for an empty src, and clears when the src goes away', () => {
    const { container, rerender } = render(<CrossfadeBackground src={undefined} />);
    expect(container.querySelector('img')).toBeNull();
    rerender(<CrossfadeBackground src="/a.jpg" />);
    expect(srcs(container)).toEqual(['/a.jpg']);
    rerender(<CrossfadeBackground src={undefined} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('applies the effects filter as it is, with no transition on it', () => {
    const { container } = render(<CrossfadeBackground src="/a.jpg" filter="brightness(1.20)" />);
    const image = imgs(container)[0];
    expect(image.style.filter).toBe('brightness(1.20)');
    expect(image.style.transition).toBe(`opacity ${CROSSFADE_MS}ms ease-in-out`);
  });
});
