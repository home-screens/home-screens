// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { __resetAuthImageCacheForTests } from '../useAuthImage';
import { displayFetch } from '@/lib/display-fetch';
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

function finishLoadFrame() {
  act(() => { vi.advanceTimersByTime(35); });
}

describe('CrossfadeBackground', () => {
  it('renders a single image layer for the initial src', () => {
    const { container } = render(<CrossfadeBackground src="/a.jpg" />);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].src).toContain('/a.jpg');
  });

  it('shows the first layer immediately without waiting for onLoad', () => {
    const { container } = render(<CrossfadeBackground src="/a.jpg" />);
    expect((container.querySelector('img') as HTMLImageElement).style.opacity).toBe('1');
  });

  it('marks an already-complete image as loaded on mount so a later swap can retire it', () => {
    vi.useFakeTimers();
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    const width = vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(640);
    try {
      const { container, rerender } = render(<CrossfadeBackground src="/a.jpg" />);
      finishLoadFrame();
      rerender(<CrossfadeBackground src="/b.jpg" />);
      const imgs = Array.from(container.querySelectorAll('img'));
      expect(imgs).toHaveLength(2);
      // The new layer starts hidden over the old one, then both complete-checks pass and it fades in.
      finishLoadFrame();
      expect((container.querySelectorAll('img')[1] as HTMLImageElement).style.opacity).toBe('1');
    } finally {
      complete.mockRestore();
      width.mockRestore();
    }
  });

  it('keeps the previous image mounted underneath while the new one loads, then drops it after the fade', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<CrossfadeBackground src="/a.jpg" />);
    rerender(<CrossfadeBackground src="/b.jpg" />);

    // Both layers present: the old one still visible, the new one fading in.
    let imgs = Array.from(container.querySelectorAll('img'));
    expect(imgs.map((img) => img.src.split('/').pop())).toEqual(['a.jpg', 'b.jpg']);

    // The new layer finishes loading and starts its fade.
    act(() => { fireEvent.load(imgs[1]); });
    finishLoadFrame();

    // After the fade completes, only the new layer remains.
    act(() => { vi.advanceTimersByTime(CROSSFADE_MS); });
    imgs = Array.from(container.querySelectorAll('img'));
    expect(imgs.map((img) => img.src.split('/').pop())).toEqual(['b.jpg']);
  });

  it('keeps the outgoing wall photo visible during auth fetch, then fades over it', async () => {
    vi.useFakeTimers();
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    let count = 0;
    URL.createObjectURL = vi.fn(() => `blob:background-${++count}`);
    URL.revokeObjectURL = vi.fn();
    let releaseSecond!: (response: Response) => void;
    vi.mocked(displayFetch)
      .mockResolvedValueOnce(new Response(new Blob(['first'])))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { releaseSecond = resolve; }));
    try {
      const { container, rerender } = render(<CrossfadeBackground src="/api/backgrounds/serve?file=first.jpg" authenticate />);
      await act(async () => { await Promise.resolve(); });
      let images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);
      expect(images[0].getAttribute('src')).toBe('blob:background-1');
      fireEvent.load(images[0]);

      rerender(<CrossfadeBackground src="/api/backgrounds/serve?file=second.jpg" authenticate />);
      expect(container.querySelectorAll('img')).toHaveLength(1);
      expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:background-1');

      await act(async () => { releaseSecond(new Response(new Blob(['second']))); });
      images = container.querySelectorAll('img');
      expect(images).toHaveLength(2);
      expect(images[0].getAttribute('src')).toBe('blob:background-1');
      expect(images[1].getAttribute('src')).toBe('blob:background-2');
      expect(images[1].style.opacity).toBe('0');
      fireEvent.load(images[1]);
      finishLoadFrame();
      expect(images[1].style.opacity).toBe('1');
      act(() => { vi.advanceTimersByTime(CROSSFADE_MS - 1); });
      expect(container.querySelectorAll('img')).toHaveLength(2);
      act(() => { vi.advanceTimersByTime(1); });
      expect(container.querySelectorAll('img')).toHaveLength(1);
      expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:background-2');
    } finally {
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
    }
  });

  it('drops failed initial media instead of leaving a broken image', () => {
    const { container } = render(<CrossfadeBackground src="/missing.jpg" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
  });

  it.each(['/broken.jpg', '/broken.mp4'])('retains the last loaded image when %s fails', (failedSrc) => {
    const { container, rerender } = render(<CrossfadeBackground src="/ok.jpg" />);
    fireEvent.load(container.querySelector('img')!);
    rerender(<CrossfadeBackground src={failedSrc} />);

    const candidate = container.querySelector(failedSrc.endsWith('.mp4') ? 'video' : 'img[src="/broken.jpg"]');
    fireEvent.error(candidate!);

    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/ok.jpg');
    expect(container.querySelector('video')).toBeNull();
  });

  it('renders a video element for a video-extension src', () => {
    const { container } = render(<CrossfadeBackground src="/clip.mp4" />);
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.autoplay).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.muted).toBe(true);
  });

  it('renders nothing for an empty src', () => {
    const { container } = render(<CrossfadeBackground src={undefined} />);
    expect(container.querySelectorAll('img, video')).toHaveLength(0);
  });

  it('applies the same transition timing to filter changes', () => {
    const { container } = render(<CrossfadeBackground src="/a.jpg" filter="brightness(1.20)" />);
    const image = container.querySelector('img') as HTMLImageElement;

    expect(image.style.filter).toBe('brightness(1.20)');
    expect(image.style.transition).toBe(`opacity ${CROSSFADE_MS}ms ease-in-out, filter ${CROSSFADE_MS}ms ease-in-out`);
  });
});
