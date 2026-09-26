// @vitest-environment jsdom

/**
 * DayArtLayer is the whole per-pixel dimming story: the image is the
 * layer's own background and dimming is element opacity, so transparent
 * pixels contribute nothing at any dim value (a scrim layer in the cell's
 * background stack could never do this, it always covers the full box).
 * It also has to sit under the cell's content and, for uploaded art, fetch
 * the picture with the display token like every other API-served image.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { DayArtLayer } from '../DayArtLayer';
import { __resetAuthImageCacheForTests } from '@/components/display/useAuthImage';
import { NO_DECOR, type DayDecor } from '@/lib/calendar-rules';

const displayFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/display-fetch', () => ({ displayFetch }));

const art = (over: Partial<DayDecor>): DayDecor => ({ ...NO_DECOR, backgroundImage: '/a.png', ...over });

describe('DayArtLayer', () => {
  beforeEach(() => {
    __resetAuthImageCacheForTests();
    displayFetch.mockReset();
    // jsdom has no object URLs; the hook only needs a stable string back.
    URL.createObjectURL = vi.fn(() => 'blob:art');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(cleanup);

  it('paints the image on an inner painter under the cell content, inheriting the rounding', () => {
    const { container } = render(<DayArtLayer decor={art({})} />);
    const el = container.querySelector('[data-day-art]') as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.style.zIndex).toBe('-1');
    expect(el.style.borderRadius).toBe('inherit');
    const img = el.querySelector('[data-day-art-image]') as HTMLElement;
    expect(img.style.backgroundImage).toBe('url("/a.png")');
    expect(img.style.borderRadius).toBe('inherit');
    // Default size is plain cover from globals.css: no opt-in attribute and
    // no scale variable, so the @container axis-bound rules cannot match.
    expect(img.hasAttribute('data-day-art-scaled')).toBe(false);
    expect(img.style.getPropertyValue('--day-art-scale')).toBe('');
    // A static path never needs the display token.
    expect(displayFetch).not.toHaveBeenCalled();
  });

  it('positions by percentage: given values land inline, default is centered', () => {
    const { container } = render(
      <>
        <DayArtLayer decor={art({})} />
        <DayArtLayer decor={art({ backgroundScale: 40, backgroundPositionX: 0, backgroundPositionY: 100 })} />
      </>,
    );
    const imgs = container.querySelectorAll<HTMLElement>('[data-day-art-image]');
    expect(imgs[0].style.backgroundPosition).toBe('50% 50%');
    expect(imgs[0].hasAttribute('data-day-art-scaled')).toBe(false);
    expect(imgs[1].style.backgroundPosition).toBe('0% 100%');
    // Below 100 opts into the axis-bound size (globals.css @container rules).
    expect(imgs[1].hasAttribute('data-day-art-scaled')).toBe(true);
    expect(imgs[1].style.getPropertyValue('--day-art-scale')).toBe('40');
  });

  it('an explicit 100 is the default, not a 100% axis binding', () => {
    const { container } = render(<DayArtLayer decor={art({ backgroundScale: 100 })} />);
    const img = container.querySelector('[data-day-art-image]') as HTMLElement;
    expect(img.hasAttribute('data-day-art-scaled')).toBe(false);
    expect(img.style.getPropertyValue('--day-art-scale')).toBe('');
  });

  it('keeps dimming on the layer element regardless of scale and position', () => {
    const { container } = render(<DayArtLayer decor={art({ backgroundDim: 0.7, backgroundScale: 25 })} />);
    const el = container.querySelector('[data-day-art]') as HTMLElement;
    expect(el.style.opacity).toBe('0.3');
  });

  it('maps dimming to opacity: default 0.4 dim renders at 0.6, 0.7 dim at 0.3', () => {
    const { container } = render(
      <>
        <DayArtLayer decor={art({})} />
        <DayArtLayer decor={art({ backgroundDim: 0.7 })} />
        <DayArtLayer decor={art({ backgroundDim: 0 })} />
      </>,
    );
    const els = container.querySelectorAll<HTMLElement>('[data-day-art]');
    expect(els[0].style.opacity).toBe('0.6');
    expect(els[1].style.opacity).toBe('0.3');
    expect(els[2].style.opacity).toBe('1');
  });

  it('fetches uploaded art through the display token and paints the blob', async () => {
    let resolveFetch: (res: unknown) => void = () => {};
    displayFetch.mockImplementation(() => new Promise((r) => { resolveFetch = r; }));
    const serve = '/api/backgrounds/serve?file=calendar-art%2Fparty.png';
    const { container } = render(<DayArtLayer decor={art({ backgroundImage: serve })} />);

    // Nothing paints until the bytes arrive: a raw serve URL in CSS would
    // be a 401 on a password-protected wall.
    expect(container.querySelector('[data-day-art]')).toBeNull();
    expect(displayFetch).toHaveBeenCalledWith(serve);

    await act(async () => {
      resolveFetch({ ok: true, headers: new Headers(), blob: async () => new Blob(['x']) });
    });
    const el = container.querySelector('[data-day-art-image]') as HTMLElement;
    expect(el.style.backgroundImage).toBe('url("blob:art")');
  });

  it('paints nothing when the fetch is refused', async () => {
    displayFetch.mockResolvedValue({ ok: false });
    const { container } = render(<DayArtLayer decor={art({ backgroundImage: '/api/backgrounds/serve?file=x.png' })} />);
    await act(async () => {});
    expect(container.querySelector('[data-day-art]')).toBeNull();
  });
});
