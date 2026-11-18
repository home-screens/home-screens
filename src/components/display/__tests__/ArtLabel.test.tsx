// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import React from 'react';
import ArtLabel, { useArtLabelShown } from '../ArtLabel';
import type { ArtCaption } from '@/lib/art-presentation';

const art = (over: Partial<ArtCaption> = {}): ArtCaption => ({
  id: 'Q4429116', file: 'The Magpie.jpg', title: 'The Magpie', artist: 'Claude Monet', year: 1868, museum: "Musée d'Orsay",
  label: 'brief', place: { style: 'placard', x: 650, y: 1223, w: 330, tone: 'dark', unit: 1 }, ...over,
});

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useArtLabelShown', () => {
  it('shows a brief label for the first 15 seconds of each painting, then lets the corner caption take over', () => {
    const { result, rerender } = renderHook(({ a, path }) => useArtLabelShown(a, path), { initialProps: { a: art(), path: '/a.jpg' } });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(14_000); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(1_500); });
    expect(result.current).toBe(false);
    // The next painting starts its own 15 seconds.
    rerender({ a: art({ id: 'Q2', title: 'Poppy Field' }), path: '/b.jpg' });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(15_500); });
    expect(result.current).toBe(false);
  });

  it('keeps an "always" label up, never shows an "off" one, and shows none without a painting', () => {
    const always = renderHook(() => useArtLabelShown(art({ label: 'always' }), '/a.jpg'));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(always.result.current).toBe(true);
    expect(renderHook(() => useArtLabelShown(art({ label: 'off' }), '/a.jpg')).result.current).toBe(false);
    expect(renderHook(() => useArtLabelShown(undefined, '/a.jpg')).result.current).toBe(false);
  });
});

describe('ArtLabel', () => {
  it('draws the card where the hub put it, with the title, artist and year, and the museum', () => {
    render(<ArtLabel art={art()} shown />);
    const label = screen.getByTestId('art-label');
    expect(label.textContent).toBe("The MagpieClaude Monet, 1868Musée d'Orsay");
    expect(label.style.left).toBe('650px');
    expect(label.style.top).toBe('1223px');
    expect(label.style.width).toBe('330px');
    expect(label.style.opacity).toBe('1');
    expect(label.style.background).not.toBe('');
  });

  it('letters a matted painting on the mat, light on a dark one, and fades out when it is not shown', () => {
    render(<ArtLabel art={art({ artist: undefined, museum: undefined, place: { style: 'printed', x: 92, y: 1222, w: 896, tone: 'light', unit: 1 } })} shown={false} />);
    const label = screen.getByTestId('art-label');
    expect(label.textContent).toBe('The Magpie1868');
    expect(label.style.textAlign).toBe('center');
    expect(label.style.background).toBe('');
    expect(label.style.color).toBe('rgb(236, 230, 216)');
    expect(label.style.opacity).toBe('0');
    expect(label.getAttribute('aria-hidden')).toBe('true');
  });

  it('letters a framed painting in two short lines, in the strip of mat under it', () => {
    render(<ArtLabel art={art({ place: { style: 'printed', x: 272, y: 922, w: 1377, tone: 'dark', unit: 1, band: 74 } })} shown />);
    const label = screen.getByTestId('art-label');
    // Artist, year and museum share the second line.
    expect(label.textContent).toBe("The MagpieClaude Monet, 1868 \u00a0\u00b7\u00a0 Musée d'Orsay");
    expect(label.children).toHaveLength(2);
    expect([label.style.left, label.style.top, label.style.width, label.style.height]).toEqual(['272px', '922px', '1377px', '74px']);
    expect([label.style.textAlign, label.style.justifyContent, label.style.overflow, label.style.background]).toEqual(['center', 'center', 'hidden', '']);
    // Neither line wraps: a long title is cut short and never pushes out of the strip.
    const [title, second] = Array.from(label.children) as HTMLElement[];
    expect([title.style.fontSize, title.style.whiteSpace, title.style.textOverflow]).toEqual(['22px', 'nowrap', 'ellipsis']);
    expect([second.style.fontSize, second.style.whiteSpace]).toEqual(['14px', 'nowrap']);
    cleanup();
    // With no artist or year the museum stands alone, and with nothing but a title there is one line.
    render(<ArtLabel art={art({ artist: undefined, year: undefined, place: { style: 'printed', x: 272, y: 922, w: 1377, tone: 'dark', unit: 1, band: 74 } })} shown />);
    expect(screen.getByTestId('art-label').textContent).toBe("The MagpieMusée d'Orsay");
    cleanup();
    render(<ArtLabel art={art({ artist: undefined, year: undefined, museum: undefined, place: { style: 'printed', x: 272, y: 922, w: 1377, tone: 'dark', unit: 1, band: 74 } })} shown />);
    expect(screen.getByTestId('art-label').children).toHaveLength(1);
    cleanup();
    // A mat that fills the screen has no strip to stay within, larger lettering, and the museum on its own line.
    render(<ArtLabel art={art({ place: { style: 'printed', x: 92, y: 1222, w: 896, tone: 'dark', unit: 1 } })} shown />);
    const open = screen.getByTestId('art-label');
    expect(open.style.height).toBe('');
    expect(open.children).toHaveLength(3);
    expect((open.children[0] as HTMLElement).style.fontSize).toBe('36px');
  });
});
