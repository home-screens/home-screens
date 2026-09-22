// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import BackgroundShadeOverlay, { buildShadeBackground } from '@/components/BackgroundShadeOverlay';
import type { BackgroundShade } from '@/types/config';

const base: BackgroundShade = { enabled: true, style: 'even', strength: 50, color: '#000000' };

describe('buildShadeBackground', () => {
  it('builds a flat rgba fill for the even preset', () => {
    expect(buildShadeBackground(base)).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('builds top/bottom gradients for the topBottom preset', () => {
    const css = buildShadeBackground({ ...base, style: 'topBottom' });
    expect(css).toContain('linear-gradient(to bottom');
    expect(css).toContain('linear-gradient(to top');
  });

  it('builds a radial gradient for the edges preset', () => {
    const css = buildShadeBackground({ ...base, style: 'edges' });
    expect(css).toContain('radial-gradient');
  });

  it('combines top/bottom bars and edge vignette for the both preset', () => {
    const css = buildShadeBackground({ ...base, style: 'both' });
    expect(css).toContain('linear-gradient(to bottom');
    expect(css).toContain('radial-gradient');
  });

  it('respects a custom color', () => {
    expect(buildShadeBackground({ ...base, color: '#ff0000' })).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('reads rgb() and short hex colors the picker can store', () => {
    expect(buildShadeBackground({ ...base, color: 'rgb(255, 0, 0)' })).toBe('rgba(255, 0, 0, 0.5)');
    expect(buildShadeBackground({ ...base, color: 'rgba(0, 128, 255, 0.3)' })).toBe('rgba(0, 128, 255, 0.5)');
    expect(buildShadeBackground({ ...base, color: '#f00' })).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('clamps strength to 0-100', () => {
    expect(buildShadeBackground({ ...base, strength: 150 })).toBe('rgba(0, 0, 0, 1)');
    expect(buildShadeBackground({ ...base, strength: -10 })).toBe('rgba(0, 0, 0, 0)');
  });
});

describe('BackgroundShadeOverlay', () => {
  it('renders nothing when disabled', () => {
    const { queryByTestId } = render(<BackgroundShadeOverlay shade={{ ...base, enabled: false }} />);
    expect(queryByTestId('background-shade-overlay')).toBeNull();
  });

  it('renders nothing when shade is undefined', () => {
    const { queryByTestId } = render(<BackgroundShadeOverlay shade={undefined} />);
    expect(queryByTestId('background-shade-overlay')).toBeNull();
  });

  it('renders the overlay when enabled', () => {
    const { getByTestId } = render(<BackgroundShadeOverlay shade={base} />);
    expect(getByTestId('background-shade-overlay')).toBeTruthy();
  });
});
