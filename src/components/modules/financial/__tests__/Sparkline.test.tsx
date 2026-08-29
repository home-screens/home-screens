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

  it('domain override positions points against the shared scale', () => {
    // Values 5-7 inside a 0-10 domain sit in the UPPER half of the value
    // range, i.e. the small-y (upper) half of the 0..32 viewBox box.
    // Mapping: y = 30 - ((p - min) / range) * 28 with domain {min: 0, max: 10}
    // gives 30 - 14 = 16, 30 - 16.8 = 13.2, 30 - 19.6 = 10.4.
    const { container } = render(
      <Sparkline points={[5, 6, 7]} positive scale={1} shaded domain={{ min: 0, max: 10 }} />,
    );
    const pts = svgOf(container).querySelector('polyline')!.getAttribute('points')!.split(' ');
    const ys = pts.map((p) => p.split(',')[1]);
    expect(ys).toEqual(['16.00', '13.20', '10.40']);
  });

  it('dividers render in classic too when passed (Single layout gridlines)', () => {
    const { container } = render(
      <Sparkline points={[1, 2, 3]} positive scale={1} dividers={[0.25, 0.5, 0.75]} />,
    );
    const lines = svgOf(container).querySelectorAll('line.financial-sparkline-divider');
    expect(lines).toHaveLength(3);
    expect(lines[0].getAttribute('x1')).toBe('25.00');
    expect(lines[2].getAttribute('x2')).toBe('75.00');
  });

  it('level lines only in the single layout, at the domain extremes', () => {
    const withLines = render(<Sparkline points={[1, 2, 3]} positive scale={1} shaded layout="single" />);
    expect(withLines.container.querySelectorAll('svg.financial-sparkline line.financial-sparkline-level')).toHaveLength(2);
    const lines = withLines.container.querySelectorAll('line.financial-sparkline-level');
    expect(lines[0].getAttribute('y1')).toBe('2');
    expect(lines[1].getAttribute('y1')).toBe('30');

    const without = render(<Sparkline points={[1, 2, 3]} positive scale={1} shaded />);
    expect(without.container.querySelectorAll('svg.financial-sparkline line.financial-sparkline-level')).toHaveLength(0);
  });

  it('flat domain draws one mid level line, not two stacked', () => {
    const { container } = render(
      <Sparkline points={[5, 5, 5]} positive scale={1} shaded layout="single" />,
    );
    const lines = container.querySelectorAll('line.financial-sparkline-level');
    expect(lines).toHaveLength(1);
    expect(lines[0].getAttribute('y1')).toBe('16');
  });

  it('single layout stretches the svg to its container in both directions', () => {
    const { container } = render(<Sparkline points={[1, 2, 3]} positive scale={1} layout="single" />);
    expect(svgOf(container).style.height).toBe('100%');
    expect(svgOf(container).style.width).toBe('100%');
  });

  it('shaded tint stops one unit above the backdrop bottom (cards look, unchanged)', () => {
    const { container } = render(<Sparkline points={[1, 2, 3]} positive scale={1} shaded xs={[0, 0.5, 1]} />);
    const d = svgOf(container).querySelector('path')!.getAttribute('d')!;
    expect(d.startsWith('M0.00,31')).toBe(true);
    expect(d.endsWith('L100.00,31 Z')).toBe(true);
  });

  it('single layout runs the tint to the chart bottom', () => {
    const { container } = render(
      <Sparkline points={[1, 2, 3]} positive scale={1} shaded xs={[0, 0.5, 1]} layout="single" />,
    );
    const d = svgOf(container).querySelector('path')!.getAttribute('d')!;
    expect(d.startsWith('M0.00,32')).toBe(true);
    expect(d.endsWith('L100.00,32 Z')).toBe(true);
  });

  it('dividers draw beneath the tint fill by default (cards look, unchanged)', () => {
    const { container } = render(
      <Sparkline points={[1, 2, 3]} positive scale={1} shaded dividers={[0.5]} />,
    );
    const html = svgOf(container).innerHTML;
    expect(html.indexOf('<path')).toBeGreaterThan(html.indexOf('financial-sparkline-divider'));
  });

  it('single layout paints dividers over the tint', () => {
    const { container } = render(
      <Sparkline points={[1, 2, 3]} positive scale={1} shaded dividers={[0.5]} layout="single" />,
    );
    const html = svgOf(container).innerHTML;
    expect(html.indexOf('<path')).toBeLessThan(html.indexOf('financial-sparkline-divider'));
  });
});
