// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

beforeAll(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
});

vi.mock('@/components/display/useAuthImage', () => ({
  useAuthImage: (src?: string) => src,
}));

import VideoLayer from '../shared/VideoLayer';

afterEach(cleanup);

const FAR_EXP = Date.now() + 6 * 60 * 60 * 1000; // ~6h out, like a fresh mint
const NEAR_EXP = Date.now() + 10 * 60 * 1000; // inside the 30min refresh margin

function tokenUrl(file: string, exp: number, sig = 'sig') {
  return `/api/backgrounds/serve?file=${encodeURIComponent(file)}&mt=${exp}.${sig}`;
}

function renderLayer(src: string) {
  return render(<VideoLayer src={src} active autoPlay />);
}

function videoSrc(container: HTMLElement): string | null {
  return container.querySelector('video')!.getAttribute('src');
}

describe('VideoLayer held src (media-token churn)', () => {
  it('keeps the current src when only the mt token changed', () => {
    const first = tokenUrl('a.mp4', FAR_EXP, 'one');
    const { container, rerender } = renderLayer(first);

    rerender(<VideoLayer src={tokenUrl('a.mp4', FAR_EXP + 60_000, 'two')} active autoPlay />);

    expect(videoSrc(container)).toBe(first);
  });

  it('adopts the new src when the underlying asset changed', () => {
    const { container, rerender } = renderLayer(tokenUrl('a.mp4', FAR_EXP));
    const next = tokenUrl('b.mp4', FAR_EXP);

    rerender(<VideoLayer src={next} active autoPlay />);

    expect(videoSrc(container)).toBe(next);
  });

  it('adopts a fresh token when the held one nears expiry', () => {
    const { container, rerender } = renderLayer(tokenUrl('a.mp4', NEAR_EXP, 'stale'));
    const fresh = tokenUrl('a.mp4', FAR_EXP, 'fresh');

    rerender(<VideoLayer src={fresh} active autoPlay />);

    expect(videoSrc(container)).toBe(fresh);
  });

  it('adopts changes to tokenless URLs normally', () => {
    const { container, rerender } = renderLayer('https://example.com/a.mp4');

    rerender(<VideoLayer src="https://example.com/b.mp4" active autoPlay />);

    expect(videoSrc(container)).toBe('https://example.com/b.mp4');
  });
});
