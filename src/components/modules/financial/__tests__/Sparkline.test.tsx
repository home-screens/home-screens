// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline } from '../shared';

function svgOf(container: HTMLElement) {
  const svg = container.querySelector('svg.financial-sparkline');
  expect(svg).not.toBeNull();
  return svg as SVGSVGElement;
}

describe('Sparkline', () => {
  it('renders nothing for fewer than two points', () => {
    const { container } = render(<Sparkline points={[1]} positive scale={1} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('classic mode keeps the plain line: no backdrop, no tint, even spacing', () => {
    const { container } = render(<Sparkline points={[1, 2, 3]} positive scale={1} />);
    const svg = svgOf(container);
    expect(svg.querySelector('rect')).toBeNull();
    expect(svg.querySelector('path')).toBeNull();
    const pts = svg.querySelector('polyline')!.getAttribute('points')!.split(' ');
    expect(pts[0].split(',')[0]).toBe('0.00');
    expect(pts[2].split(',')[0]).toBe('100.00');
    // jsdom exposes svg.className as SVGAnimatedString, so assert on the attribute
    expect(svg.getAttribute('class')).not.toContain('financial-sparkline-shaded');
  });

  it('classic mode ignores xs (current scaling, retained exactly)', () => {
    const { container } = render(<Sparkline points={[1, 2, 3]} positive scale={1} xs={[0, 0.1, 0.2]} />);
    const pts = svgOf(container).querySelector('polyline')!.getAttribute('points')!.split(' ');
    expect(pts[2].split(',')[0]).toBe('100.00'); // even spacing, not 20
  });

  it('shaded mode adds backdrop rect and tint path', () => {
    const { container } = render(<Sparkline points={[1, 2, 3]} positive scale={1} shaded />);
    const svg = svgOf(container);
    expect(svg.getAttribute('class')).toContain('financial-sparkline-shaded');
    const rect = svg.querySelector('rect');
    expect(rect).not.toBeNull();
    expect(rect!.getAttribute('opacity')).toBe('0.1');
    const path = svg.querySelector('path');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('fill')).toMatch(/^url\(#/);
    const gradientId = svg.querySelector('linearGradient')!.id;
    expect(path!.getAttribute('fill')).toBe(`url(#${gradientId})`);
  });

  it('shaded mode positions points by xs so the line stops at "now"', () => {
    const { container } = render(
      <Sparkline points={[1, 2, 3]} positive scale={1} shaded xs={[0, 0.3, 0.6]} />,
    );
    const pts = svgOf(container).querySelector('polyline')!.getAttribute('points')!.split(' ');
    expect(pts[0].split(',')[0]).toBe('0.00');
    expect(pts[1].split(',')[0]).toBe('30.00');
    expect(pts[2].split(',')[0]).toBe('60.00');
  });

  it('shaded mode falls back to even spacing when xs is missing or mismatched', () => {
    const mismatched = render(<Sparkline points={[1, 2, 3]} positive scale={1} shaded xs={[0, 0.5]} />);
    const pts = svgOf(mismatched.container).querySelector('polyline')!.getAttribute('points')!.split(' ');
    expect(pts[2].split(',')[0]).toBe('100.00');
  });

  it('shades the region from highlightFromX to the right edge (shaded only)', () => {
    const { container } = render(
      <Sparkline points={[1, 2, 3]} positive scale={1} shaded highlightFromX={0.5} />,
    );
    const svg = svgOf(container);
    const rects = svg.querySelectorAll('rect');
    expect(rects).toHaveLength(2); // backdrop + highlight band
    const band = rects[1];
    expect(band.getAttribute('x')).toBe('50.00');
    expect(band.getAttribute('width')).toBe('50.00');
    expect(band.getAttribute('opacity')).toBe('0.15');

    // No prop → backdrop only; classic ignores the prop entirely.
    const plain = render(<Sparkline points={[1, 2, 3]} positive scale={1} shaded />);
    expect(svgOf(plain.container).querySelectorAll('rect')).toHaveLength(1);
    const classic = render(<Sparkline points={[1, 2, 3]} positive scale={1} highlightFromX={0.5} />);
    expect(svgOf(classic.container).querySelectorAll('rect')).toHaveLength(0);
  });

  it('flat series draws a horizontal band at y=16 (range === 0)', () => {
    const { container } = render(
      <Sparkline points={[5, 5, 5]} positive scale={1} shaded xs={[0, 0.5, 1]} />,
    );
    const svg = svgOf(container);
    expect(svg.querySelector('path')).not.toBeNull();
    const pts = svg.querySelector('polyline')!.getAttribute('points')!.split(' ');
    for (const pt of pts) expect(pt.split(',')[1]).toBe('16.00');
  });

  it('colors by the positive flag', () => {
    const up = render(<Sparkline points={[1, 2, 3]} positive scale={1} />);
    expect(svgOf(up.container).getAttribute('class')).toContain('text-green-400');
    const down = render(<Sparkline points={[3, 2, 1]} positive={false} scale={1} />);
    expect(svgOf(down.container).getAttribute('class')).toContain('text-red-400');
  });

  it('honors widthEm (half-width charts in both mode)', () => {
    const { container } = render(<Sparkline points={[1, 2, 3]} positive scale={2} widthEm={2.6} />);
    expect(svgOf(container).style.width).toBe('5.2em');
  });

  it('fillWidth stretches the svg to the container', () => {
    const { container } = render(<Sparkline points={[1, 2, 3]} positive scale={1} fillWidth widthEm={9} />);
    expect(svgOf(container).style.width).toBe('100%');
  });
});
