// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SingleTile from '../SingleTile';
import { formatAxisValue } from '../shared';

const BASE = {
  symbol: 'NVDA', name: 'NVIDIA Corporation',
  price: 184.22, change: -2.31, changePercent: -1.24,
  sparkline: [186, 185.2, 184.9, 184.22], sparklineXs: [0, 0.3, 0.6, 0.9],
  sparklineHourMarks: [0.0769, 0.3846, 0.6923],
  sparklineMode: 'day' as const, sparklineTheme: 'shaded' as const,
};

describe('formatAxisValue', () => {
  it('uses tiered rounding', () => {
    expect(formatAxisValue(322.37)).toBe('$322');
    expect(formatAxisValue(184.9)).toBe('$185');
    expect(formatAxisValue(9.456)).toBe('$9.5');
    expect(formatAxisValue(0.874)).toBe('$0.87');
  });

  it('groups thousands in the locale, matching the price header', () => {
    expect(formatAxisValue(2023.45, 'en-US')).toBe('$2,023');
    expect(formatAxisValue(2023.45, 'de-DE')).toBe('$2.023');
  });

  it('formats decimals in the locale', () => {
    expect(formatAxisValue(9.456, 'de-DE')).toBe('$9,5');
    expect(formatAxisValue(0.874, 'de-DE')).toBe('$0,87');
  });
});

describe('SingleTile', () => {
  it('renders header, price, and half-size delta', () => {
    const { container } = render(<SingleTile {...BASE} />);
    expect(container.querySelector('.financial-single-sym')!.textContent).toBe('NVDA');
    expect(container.querySelector('.financial-single-name')!.textContent).toBe('NVIDIA Corporation');
    expect(container.querySelector('.financial-single-price')!.textContent).toBe('$184.22');
    const delta = container.querySelector('.financial-single-delta')!;
    expect(delta.textContent).toContain('-2.31');
    expect(delta.className).toContain('text-red-400');
  });

  it('omits the name span when the API gave none', () => {
    const { container } = render(<SingleTile {...BASE} name={undefined} />);
    expect(container.querySelector('.financial-single-name')).toBeNull();
  });

  it('renders the gutter axis labels at tiered rounding', () => {
    const { container } = render(<SingleTile {...BASE} />);
    const labels = container.querySelectorAll('.financial-axis-label');
    expect(labels).toHaveLength(2); // the sizer carries its own class
    expect(labels[0].textContent).toBe('$186');
    expect(labels[1].textContent).toBe('$184');
    // The labels sit exactly at the level lines' heights (y=2 and y=30 in the
    // 0..32 viewBox; SVG y and CSS top both grow downward): the gutter and
    // the chart must share one y mapping.
    expect((labels[0] as HTMLElement).style.top).toBe('6.25%');
    expect((labels[1] as HTMLElement).style.top).toBe('93.75%');
  });

  it('flat series renders one axis label and one level line, not stacked duplicates', () => {
    const { container } = render(
      <SingleTile {...BASE} sparkline={[184.22, 184.22, 184.22]} sparklineXs={[0, 0.5, 1]} sparklineHourMarks={undefined} />,
    );
    expect(container.querySelectorAll('.financial-axis-label')).toHaveLength(1);
    const label = container.querySelector('.financial-axis-label') as HTMLElement;
    expect(label.style.top).toBe('50%');
    const lines = container.querySelectorAll('line.financial-sparkline-level');
    expect(lines).toHaveLength(1);
  });

  it('day chart draws the hour marks the API reports, exchange-local', () => {
    const { container } = render(<SingleTile {...BASE} />);
    const svg = container.querySelector('svg.financial-sparkline')!;
    expect(svg.querySelectorAll('line')).toHaveLength(3 + 2); // 3 hour marks + max/min
    // The tile opts into the flush fill (cards keep their one-unit gap).
    expect(svg.querySelector('path')!.getAttribute('d')).toMatch(/^M0\.00,32/);
  });

  it('day chart draws no hour lines when the API gave no hour marks', () => {
    const { container } = render(<SingleTile {...BASE} sparklineHourMarks={undefined} />);
    const svg = container.querySelector('svg.financial-sparkline')!;
    expect(svg.querySelectorAll('line')).toHaveLength(2); // level lines only
  });

  it('classic single keeps layout elements but drops hour lines (no time basis)', () => {
    const { container } = render(<SingleTile {...BASE} sparklineTheme="classic" />);
    const svg = container.querySelector('svg.financial-sparkline')!;
    expect(svg.querySelectorAll('line')).toHaveLength(2); // level lines only
    expect(svg.querySelector('rect')).toBeNull();
  });

  it('both-mode shares one domain and one label pair', () => {
    const { container } = render(
      <SingleTile {...BASE} sparklineMode="both"
        sparklineWeek={[190, 188, 186.5, 185, 184.22]} weekChangePercent={-2.4}
        weekDayBoundaries={[0.5]} />,
    );
    expect(container.querySelectorAll('svg.financial-sparkline')).toHaveLength(2);
    expect(container.querySelectorAll('.financial-axis-label')).toHaveLength(2);
    // Shared max comes from the week series (190), shared min is the common low (184.22)
    const labels = container.querySelectorAll('.financial-axis-label');
    expect(labels[0].textContent).toBe('$190');
    expect(labels[1].textContent).toBe('$184');
  });

  it('week-only mode uses the week domain and colors the week chart by its own move (classic)', () => {
    const { container } = render(
      <SingleTile {...BASE} change={1.5} changePercent={0.82} sparklineMode="week" sparklineTheme="classic"
        sparklineWeek={[190, 188, 186.5, 185, 184.22]} weekChangePercent={-2.4} />,
    );
    expect(container.querySelectorAll('svg.financial-sparkline')).toHaveLength(1);
    const labels = container.querySelectorAll('.financial-axis-label');
    expect(labels[0].textContent).toBe('$190');
    expect(labels[1].textContent).toBe('$184');
    // Positive day, negative week: the classic week chart still colors by the week's move.
    expect(container.querySelector('svg.financial-sparkline')!.getAttribute('class')).toContain('text-red-400');
  });

  it('null change renders the neutral en dash, not a fake zero delta', () => {
    const { container } = render(<SingleTile {...BASE} change={null} changePercent={null} />);
    const delta = container.querySelector('.financial-single-delta')!;
    expect(delta.textContent).toBe('–');
    expect(delta.className).not.toContain('text-green-400');
    expect(delta.className).not.toContain('text-red-400');
  });

  it('no chart content when the series is too short (header still renders)', () => {
    const { container } = render(<SingleTile {...BASE} sparkline={[184.22]} />);
    expect(container.querySelector('svg.financial-sparkline')).toBeNull();
    expect(container.querySelector('.financial-single-price')).not.toBeNull();
    expect(container.querySelectorAll('.financial-axis-label')).toHaveLength(0);
  });

  it('renders a centered caption above each chart when chartCaptions is set', () => {
    const { container } = render(
      <SingleTile {...BASE} sparklineMode="both"
        sparklineWeek={[190, 188, 186.5, 185, 184.22]} weekChangePercent={-2.4}
        chartCaptions={{ day: '1-day', week: '5-days' }} />,
    );
    const captions = container.querySelectorAll('.financial-single-caption');
    expect(captions).toHaveLength(2);
    // Week sits left of day (chronological reading order).
    expect(captions[0].textContent).toBe('5-days');
    expect(captions[1].textContent).toBe('1-day');
    expect(captions[0].className).toContain('text-center');
  });

  it('no captions without the prop', () => {
    const { container } = render(<SingleTile {...BASE} />);
    expect(container.querySelector('.financial-single-caption')).toBeNull();
  });
});
