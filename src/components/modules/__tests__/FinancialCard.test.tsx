// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import FinancialCard from '../FinancialCard';
import { FinancialCardsView } from '../financial/shared';

const DAY = { changeValue: 1.5, changeLabel: '+1.50 (+1.00%)' };

describe('FinancialCard sparkline modes', () => {
  it('classic day renders a single plain chart (current behavior)', () => {
    const { container } = render(
      <FinancialCard label="AAPL" price={150} scale={1} sparkline={[1, 2, 3]} {...DAY} />,
    );
    const svgs = container.querySelectorAll('svg.financial-sparkline');
    expect(svgs).toHaveLength(1);
    expect(svgs[0].querySelector('rect')).toBeNull();
  });

  it('shaded day renders the backdrop and keeps day color', () => {
    const { container } = render(
      <FinancialCard label="AAPL" price={150} scale={1} sparkline={[1, 2, 3]} {...DAY}
        sparklineMode="day" sparklineTheme="shaded" sparklineXs={[0, 0.5, 1]} />,
    );
    const svg = container.querySelector('svg.financial-sparkline')!;
    expect(svg.querySelector('rect')).not.toBeNull();
    expect(svg.getAttribute('class')).toContain('text-green-400');
    const pts = svg.querySelector('polyline')!.getAttribute('points')!.split(' ');
    expect(pts[1].split(',')[0]).toBe('50.00');
  });

  it('shaded week colors by the week change, not the day change', () => {
    const { container } = render(
      <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
        sparklineMode="week" sparklineTheme="shaded"
        weekSparkline={[3, 2, 1]} weekPositive={false} />,
    );
    const svg = container.querySelector('svg.financial-sparkline')!;
    expect(svg.getAttribute('class')).toContain('text-red-400');
  });

  it('classic week keeps the day color (classic ignores per-chart colors)', () => {
    const { container } = render(
      <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
        sparklineMode="week" sparklineTheme="classic"
        weekSparkline={[3, 2, 1]} weekPositive={false} />,
    );
    expect(container.querySelector('svg.financial-sparkline')!.getAttribute('class')).toContain('text-green-400');
  });

  it('week chart carries the last-day band in shaded mode only', () => {
    const shaded = render(
      <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
        sparklineMode="week" sparklineTheme="shaded"
        weekSparkline={[3, 2, 1]} weekPositive={false} weekHighlightFromX={0.75} />,
    );
    const shadedSvg = shaded.container.querySelector('svg.financial-sparkline')!;
    expect(shadedSvg.querySelectorAll('rect')).toHaveLength(2);
    const classic = render(
      <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
        sparklineMode="week" sparklineTheme="classic"
        weekSparkline={[3, 2, 1]} weekPositive={false} weekHighlightFromX={0.75} />,
    );
    expect(classic.container.querySelector('svg.financial-sparkline')!.querySelectorAll('rect')).toHaveLength(0);
  });

  it('both mode renders two charts side by side', () => {
    const { container } = render(
      <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
        sparklineMode="both" sparklineTheme="shaded"
        sparkline={[1, 2, 3]} sparklineXs={[0, 0.5, 1]}
        weekSparkline={[3, 2, 1]} weekPositive={false} />,
    );
    const svgs = container.querySelectorAll('svg.financial-sparkline');
    expect(svgs).toHaveLength(2);
    expect(svgs[0].getAttribute('class')).toContain('text-green-400'); // day chart
    expect(svgs[1].getAttribute('class')).toContain('text-red-400');   // week chart
    expect(container.querySelector('.financial-sparkline-row')).not.toBeNull();
  });

  it('both mode skips a chart with too few points instead of rendering an empty tint', () => {
    const { container } = render(
      <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
        sparklineMode="both" sparklineTheme="shaded"
        sparkline={[1]} weekSparkline={[3, 2, 1]} weekPositive />,
    );
    expect(container.querySelectorAll('svg.financial-sparkline')).toHaveLength(1);
  });

  it('week-only with no week data renders no chart', () => {
    const { container } = render(
      <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
        sparklineMode="week" sparklineTheme="shaded" sparkline={[1, 2, 3]} />,
    );
    expect(container.querySelector('svg.financial-sparkline')).toBeNull();
  });

  it('FinancialCardsView blanks all chart fields when showSparkline is false', () => {
    const { container } = render(
      <FinancialCardsView
        items={[{
          key: 'a', label: 'AAPL', price: 150, changeValue: 1.5, changeLabel: '+1.50',
          sparkline: [1, 2, 3], sparklineXs: [0, 0.5, 1], weekSparkline: [3, 2, 1], weekPositive: false,
        }]}
        scale={1}
        showSparkline={false}
        sparklineMode="both"
        sparklineTheme="shaded"
      />,
    );
    expect(container.querySelectorAll('svg.financial-sparkline')).toHaveLength(0);
  });

  it('week chart without a week baseline inherits the day color', () => {
    const { container } = render(
      <FinancialCard label="AAPL" price={150} scale={1}
        changeValue={-1.5} changeLabel="-1.50 (-1.00%)"
        sparklineMode="week" sparklineTheme="shaded"
        weekSparkline={[3, 2, 1]} />,
    );
    // Down day + no weekPositive: the fallback must inherit the day's red.
    // A missing baseline coerced to green would fail this, so red proves the
    // fallback fired.
    expect(container.querySelector('svg.financial-sparkline')!.getAttribute('class')).toContain('text-red-400');
  });

  it('shaded single chart fills the card width; classic keeps the fixed em width', () => {
    const shaded = render(
      <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
        sparkline={[1, 2, 3]} sparklineTheme="shaded" />,
    );
    const shadedSvg = shaded.container.querySelector<SVGSVGElement>('svg.financial-sparkline')!;
    expect(shadedSvg.style.width).toBe('100%');

    const classic = render(
      <FinancialCard label="AAPL" price={150} scale={1} {...DAY} sparkline={[1, 2, 3]} />,
    );
    const classicSvg = classic.container.querySelector<SVGSVGElement>('svg.financial-sparkline')!;
    expect(classicSvg.style.width).toBe('5.5em');
  });

  it('shaded both-mode charts stretch to equal halves with the side inset', () => {
    const { container } = render(
      <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
        sparklineMode="both" sparklineTheme="shaded"
        sparkline={[1, 2, 3]} weekSparkline={[3, 2, 1]} weekPositive={false} />,
    );
    const svgs = container.querySelectorAll<SVGSVGElement>('svg.financial-sparkline');
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) expect(svg.style.width).toBe('100%');
    const row = container.querySelector('.financial-sparkline-row') as HTMLElement;
    expect(row.style.marginInline).toBe('-0.25em');
  });
});
