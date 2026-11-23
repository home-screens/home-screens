// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { MediaListItem } from '@/types/config';

// The picture is fetched through displayFetch for auth; here it is ready at once.
vi.mock('../useCrossfadeLayers', () => ({
  useSlideImage: (src: string) => ({ url: src, status: 'ready' }),
  readyWhenDecoded: () => {},
}));

import { SlideLayer } from '../SlideImage';

beforeAll(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();
});

afterEach(cleanup);

const live: MediaListItem = { url: '/api/backgrounds/serve?file=a.jpg', type: 'image', liveUrl: '/api/backgrounds/serve?file=a.live.mov' };
const plain: MediaListItem = { url: '/api/backgrounds/serve?file=b.jpg', type: 'image' };

function layer(item: MediaListItem, props: Partial<React.ComponentProps<typeof SlideLayer>> = {}) {
  return (
    <div>
      <SlideLayer
        item={item}
        active={false}
        transition="fade"
        fadeMs={800}
        playVideos
        loopVideo={false}
        onEnded={() => {}}
        live={{ motion: 'once', slideMs: 30_000 }}
        {...props}
      />
    </div>
  );
}

describe('a Live Photo on a slide layer', () => {
  it('keeps the same picture element as its layer turns active and inactive', () => {
    // Remounting the <img> threw the decoded picture away and landed the new
    // one at full opacity: a cut where the crossfade should be.
    const { container, rerender } = render(layer(live));
    const img = container.querySelector('img');
    expect(container.querySelector('[data-testid="live-photo-motion"]')).toBeNull();

    rerender(layer(live, { active: true }));
    expect(container.querySelector('img')).toBe(img);
    expect(container.querySelector('[data-testid="live-photo-motion"] video')).not.toBeNull();

    rerender(layer(live, { active: false }));
    expect(container.querySelector('img')).toBe(img);
    expect(container.querySelector('[data-testid="live-photo-motion"]')).toBeNull();
  });

  it('keeps the same picture element when a layer moves from a plain photo to a Live Photo', () => {
    const { container, rerender } = render(layer(plain, { active: true }));
    const img = container.querySelector('img');
    rerender(layer({ ...live, url: plain.url }, { active: true }));
    expect(container.querySelector('img')).toBe(img);
  });

  it('does not pan a photo that moves, and still pans one that does not', () => {
    const { container, rerender } = render(layer(live, { active: true, kenBurns: true }));
    expect(container.querySelector('img')!.style.animation).toBe('');

    rerender(layer(live, { active: true, kenBurns: true, live: { motion: 'still', slideMs: 30_000 } }));
    expect(container.querySelector('img')!.style.animation).toContain('kb-');

    rerender(layer(plain, { active: true, kenBurns: true }));
    expect(container.querySelector('img')!.style.animation).toContain('kb-');
  });

  it('starts the clip once a sliding picture has landed, and with a fading one at once', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(layer(live, { active: true, transition: 'slide' }));
    expect(container.querySelector('[data-testid="live-photo-motion"] video')!.getAttribute('src')).toBeNull();
    act(() => { vi.advanceTimersByTime(800); });
    expect(container.querySelector('[data-testid="live-photo-motion"] video')!.getAttribute('src')).not.toBeNull();
    rerender(layer({ ...live, url: '/api/backgrounds/serve?file=c.jpg' }, { active: true, transition: 'fade' }));
    expect(container.querySelector('[data-testid="live-photo-motion"] video')!.getAttribute('src')).not.toBeNull();
    vi.useRealTimers();
  });

  it('plays nothing when set not to, or in the editor preview', () => {
    const { container, rerender } = render(layer(live, { active: true, live: { motion: 'still', slideMs: 30_000 } }));
    expect(container.querySelector('video')).toBeNull();
    rerender(layer(live, { active: true, playVideos: false }));
    expect(container.querySelector('video')).toBeNull();
  });
});

describe('a picture leaving the screen', () => {
  const frame = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-slide-layer]')!;

  it('holds its slow pan where it is, rather than snapping back as it fades', () => {
    const { container, rerender } = render(layer(plain, { active: true, kenBurns: true }));
    const img = container.querySelector('img')!;
    expect(img.style.animationPlayState).toBe('running');
    rerender(layer(plain, { active: false, kenBurns: true }));
    // Still the same pan, held: removing it would jump the picture to its first frame mid-fade.
    expect(img.style.animation).toContain('kb-');
    expect(img.style.animationPlayState).toBe('paused');
  });

  it('slides in from the right and out to the left, staying painted until it is out', () => {
    const { container, rerender } = render(layer(plain, { active: true, transition: 'slide', kenBurns: true }));
    expect(frame(container).style.animation).toContain('hs-slide-in');
    rerender(layer(plain, { active: false, transition: 'slide', kenBurns: true }));
    expect(frame(container).style.animation).toContain('hs-slide-out');
    expect(frame(container).style.transition).toBe('opacity 0s linear 800ms');
    // The pan is on the picture, the slide on its frame, so neither overrides the other.
    expect(container.querySelector('img')!.style.animation).toContain('kb-');
  });

  it('fades out where it is on a zoom, while only the arriving picture zooms', () => {
    const { container, rerender } = render(layer(plain, { active: true, transition: 'zoom' }));
    expect(frame(container).style.animation).toContain('hs-zoom-in');
    rerender(layer(plain, { active: false, transition: 'zoom' }));
    expect(frame(container).style.animation).toBe('');
    expect(frame(container).style.opacity).toBe('0');
  });
});
