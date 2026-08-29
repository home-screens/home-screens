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

  it('classic week colors by the week change too (theme changes the look, not the data)', () => {
    const { container } = render(
      <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
        sparklineMode="week" sparklineTheme="classic"
        weekSparkline={[3, 2, 1]} weekPositive={false} />,
    );
    // Up day, down week: a falling line must never render green.
    expect(container.querySelector('svg.financial-sparkline')!.getAttribute('class')).toContain('text-red-400');
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

  it('both mode renders two charts side by side, week left of day', () => {
    const { container } = render(
      <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
        sparklineMode="both" sparklineTheme="shaded"
        sparkline={[1, 2, 3]} sparklineXs={[0, 0.5, 1]}
        weekSparkline={[3, 2, 1]} weekPositive={false} />,
    );
    const svgs = container.querySelectorAll('svg.financial-sparkline');
    expect(svgs).toHaveLength(2);
    // Chronological reading: the past week on the left, today on the right.
    expect(svgs[0].getAttribute('class')).toContain('text-red-400');   // week chart
    expect(svgs[1].getAttribute('class')).toContain('text-green-400'); // day chart
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
    // The negative margins only widen the box when the item stretches; a
    // percentage width would stay content-box wide and the centered parent
    // would swallow the margins (a layout no-op).
    expect(row.style.alignSelf).toBe('stretch');
    expect(row.style.marginInline).toBe('-0.25em');
    expect(row.className).not.toContain('w-full');
  });

  it('shaded single chart wrapper stretches with the side inset', () => {
    const { container } = render(
      <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
        sparkline={[1, 2, 3]} sparklineTheme="shaded" />,
    );
    const area = container.querySelector('.financial-sparkline-area') as HTMLElement;
    expect(area.style.alignSelf).toBe('stretch');
    expect(area.style.marginInline).toBe('-0.25em');
    expect(area.className).not.toContain('w-full');
  });

  describe('chart labels', () => {
    const LABELS = { day: '1D', week: '5D' };

    it('renders nothing extra when labels are off', () => {
      const { container } = render(
        <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
          sparklineMode="both" sparklineTheme="shaded"
          sparkline={[1, 2, 3]} weekSparkline={[3, 2, 1]} weekHighlightFromX={0.8} />,
      );
      expect(container.querySelectorAll('.financial-sparkline-label')).toHaveLength(0);
      expect(container.querySelectorAll('.financial-sparkline-divider')).toHaveLength(0);
    });

    it('captions both shaded charts and ticks the week chart into its sessions', () => {
      const { container } = render(
        <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
          sparklineMode="both" sparklineTheme="shaded" sparklineLabels={LABELS}
          sparkline={[1, 2, 3]} weekSparkline={[3, 2, 1]} weekHighlightFromX={0.8} />,
      );
      const labels = [...container.querySelectorAll('.financial-sparkline-label')].map((e) => e.textContent);
      expect(labels).toEqual(['5D', '1D']);
      // 0.8 = five sessions -> four dividers, on the week chart (left) only.
      const svgs = container.querySelectorAll<SVGSVGElement>('svg.financial-sparkline');
      expect(svgs[0].querySelectorAll('.financial-sparkline-divider')).toHaveLength(4);
      expect(svgs[1].querySelectorAll('.financial-sparkline-divider')).toHaveLength(0);
      // Each shaded chart lives in a relative slot that still fills its half.
      for (const svg of svgs) expect(svg.style.width).toBe('100%');
      expect(container.querySelectorAll('.financial-sparkline-slot')).toHaveLength(2);
    });

    it('puts the caption in the corner the line leaves empty', () => {
      const rising = render(
        <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
          sparklineTheme="shaded" sparklineLabels={LABELS} sparkline={[1, 2, 3]} />,
      );
      const risingCap = rising.container.querySelector('.financial-sparkline-label') as HTMLElement;
      expect(risingCap.style.top).toBe('0.35em');
      expect(risingCap.style.bottom).toBe('');

      const falling = render(
        <FinancialCard label="NVDA" price={150} scale={1} {...DAY}
          sparklineTheme="shaded" sparklineLabels={LABELS} sparkline={[3, 2, 1]} />,
      );
      const fallingCap = falling.container.querySelector('.financial-sparkline-label') as HTMLElement;
      expect(fallingCap.style.bottom).toBe('0.35em');
      expect(fallingCap.style.top).toBe('');
    });

    it('captions a week-only shaded tile so it cannot pass for a day tile', () => {
      const { container } = render(
        <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
          sparklineMode="week" sparklineTheme="shaded" sparklineLabels={LABELS}
          weekSparkline={[3, 2, 1]} weekHighlightFromX={0.75} />,
      );
      expect(container.querySelector('.financial-sparkline-label')!.textContent).toBe('5D');
      // 0.75 = a four-session holiday week -> three dividers.
      expect(container.querySelectorAll('.financial-sparkline-divider')).toHaveLength(3);
    });

    it('classic gets the caption under the line and no dividers', () => {
      const { container } = render(
        <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
          sparklineMode="both" sparklineTheme="classic" sparklineLabels={LABELS}
          sparkline={[1, 2, 3]} weekSparkline={[3, 2, 1]} weekHighlightFromX={0.8} />,
      );
      const labels = [...container.querySelectorAll('.financial-sparkline-label')].map((e) => e.textContent);
      expect(labels).toEqual(['5D', '1D']);
      expect(container.querySelectorAll('.financial-sparkline-divider')).toHaveLength(0);
      const svgs = container.querySelectorAll<SVGSVGElement>('svg.financial-sparkline');
      for (const svg of svgs) expect(svg.style.width).toBe('2.6em');
    });

    it('ticks the week chart at the exact boundaries the API reports', () => {
      const { container } = render(
        <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
          sparklineMode="week" sparklineTheme="shaded" sparklineLabels={LABELS}
          weekSparkline={[3, 2, 1]} weekHighlightFromX={0.55} weekDayBoundaries={[0.25, 0.55]} />,
      );
      const xs = [...container.querySelectorAll('.financial-sparkline-divider')].map((l) => l.getAttribute('x1'));
      // The unequal-session fractions as served — not the equal-session guess
      // the 0.55 lastDayStart would produce on its own.
      expect(xs).toEqual(['25.00', '55.00']);
    });

    it('skips dividers when the last-day fraction is unknown or nonsensical', () => {
      for (const from of [undefined, 0, 1, 0.5, 0.99]) {
        const { container } = render(
          <FinancialCard label="AAPL" price={150} scale={1} {...DAY}
            sparklineMode="week" sparklineTheme="shaded" sparklineLabels={LABELS}
            weekSparkline={[3, 2, 1]} weekHighlightFromX={from} />,
        );
        // 0.5 -> two sessions -> one divider is the only valid case here.
        expect(container.querySelectorAll('.financial-sparkline-divider')).toHaveLength(from === 0.5 ? 1 : 0);
      }
    });
  });
});
