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
});
