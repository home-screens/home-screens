// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { ComponentProps } from 'react';
import { render } from '@testing-library/react';
import SingleTile from '../SingleTile';
import { formatAxisLabels } from '../shared';
import type { FinancialItem } from '../shared';

const ITEM: FinancialItem = {
  key: 'NVDA-0', label: 'NVDA', name: 'NVIDIA Corporation',
  price: 184.22, changeValue: -2.31, changeLabel: '-2.31 (-1.24%)',
  sparkline: [186, 185.2, 184.9, 184.22], sparklineXs: [0, 0.3, 0.6, 0.9],
  sparklineHourMarks: [0.0769, 0.3846, 0.6923],
};
const WEEK = { weekSparkline: [190, 188, 186.5, 185, 184.22], weekPositive: false };
const BASE: Omit<ComponentProps<typeof SingleTile>, 'item'> = { sparklineMode: 'day', sparklineTheme: 'shaded' };

function tile(item: Partial<FinancialItem>, rest: Partial<typeof BASE> = {}) {
  return render(<SingleTile {...BASE} {...rest} item={{ ...ITEM, ...item }} />);
}

describe('formatAxisLabels', () => {
  it('starts at the magnitude tier: whole dollars at $10+, one decimal under $10, two under $1', () => {
    expect(formatAxisLabels(318.5, 322.37)).toEqual({ min: '$319', max: '$322' });
    expect(formatAxisLabels(9.1, 9.456)).toEqual({ min: '$9.1', max: '$9.5' });
    expect(formatAxisLabels(0.81, 0.874)).toEqual({ min: '$0.81', max: '$0.87' });
  });

  it('adds decimals until the two labels differ, so a quiet day never reads $12 / $12', () => {
    expect(formatAxisLabels(12.18, 12.44)).toEqual({ min: '$12.2', max: '$12.4' });
    expect(formatAxisLabels(149.9, 150.3)).toEqual({ min: '$149.9', max: '$150.3' });
    expect(formatAxisLabels(12.181, 12.184)).toEqual({ min: '$12.181', max: '$12.184' });
    expect(formatAxisLabels(12.41, 12.44)).toEqual({ min: '$12.41', max: '$12.44' });
  });

  it('keeps one tier across a $10 boundary', () => {
    expect(formatAxisLabels(9.96, 10.2)).toEqual({ min: '$10.0', max: '$10.2' });
  });

  it('a flat domain formats once at the floor tier', () => {
    expect(formatAxisLabels(184.22, 184.22)).toEqual({ min: '$184', max: '$184' });
  });

  it('groups thousands and formats decimals in the locale, matching the price header', () => {
    expect(formatAxisLabels(1990.1, 2023.45, 'en-US')).toEqual({ min: '$1,990', max: '$2,023' });
    expect(formatAxisLabels(1990.1, 2023.45, 'de-DE')).toEqual({ min: '$1.990', max: '$2.023' });
    expect(formatAxisLabels(9.1, 9.456, 'de-DE')).toEqual({ min: '$9,1', max: '$9,5' });
  });
});

describe('SingleTile', () => {
  it('renders header, price, and half-size delta', () => {
    const { container } = tile({});
    expect(container.querySelector('.financial-single-sym')!.textContent).toBe('NVDA');
    expect(container.querySelector('.financial-single-name')!.textContent).toBe('NVIDIA Corporation');
    expect(container.querySelector('.financial-single-price')!.textContent).toBe('$184.22');
    const delta = container.querySelector('.financial-single-delta')!;
    expect(delta.textContent).toContain('-2.31');
    expect(delta.className).toContain('text-red-400');
  });

  it('omits the name span when the API gave none', () => {
    const { container } = tile({ name: undefined });
    expect(container.querySelector('.financial-single-name')).toBeNull();
  });

  it('renders the gutter axis labels at tiered rounding', () => {
    const { container } = tile({});
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
    const { container } = tile({ sparkline: [184.22, 184.22, 184.22], sparklineXs: [0, 0.5, 1], sparklineHourMarks: undefined });
    expect(container.querySelectorAll('.financial-axis-label')).toHaveLength(1);
    const label = container.querySelector('.financial-axis-label') as HTMLElement;
    expect(label.style.top).toBe('50%');
    const lines = container.querySelectorAll('line.financial-sparkline-level');
    expect(lines).toHaveLength(1);
  });

  it('day chart draws the hour marks the API reports, exchange-local', () => {
    const { container } = tile({});
    const svg = container.querySelector('svg.financial-sparkline')!;
    expect(svg.querySelectorAll('line')).toHaveLength(3 + 2); // 3 hour marks + max/min
    // The tile opts into the flush fill (cards keep their one-unit gap).
    expect(svg.querySelector('path')!.getAttribute('d')).toMatch(/^M0\.00,32/);
  });

  it('day chart draws no hour lines when the API gave no hour marks', () => {
    const { container } = tile({ sparklineHourMarks: undefined });
    const svg = container.querySelector('svg.financial-sparkline')!;
    expect(svg.querySelectorAll('line')).toHaveLength(2); // level lines only
  });

  it('classic single keeps layout elements but drops hour lines (no time basis)', () => {
    const { container } = tile({}, { sparklineTheme: 'classic' });
    const svg = container.querySelector('svg.financial-sparkline')!;
    expect(svg.querySelectorAll('line')).toHaveLength(2); // level lines only
    expect(svg.querySelector('rect')).toBeNull();
  });

  it('classic week chart drops the day lines too: both charts are bare lines', () => {
    const { container } = tile({ ...WEEK, weekHighlightFromX: 0.6, weekDayBoundaries: [0.2, 0.4, 0.6] },
      { sparklineMode: 'both', sparklineTheme: 'classic' });
    const svgs = container.querySelectorAll('svg.financial-sparkline');
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) {
      expect(svg.querySelectorAll('line.financial-sparkline-divider')).toHaveLength(0);
      expect(svg.querySelectorAll('line.financial-sparkline-level')).toHaveLength(2);
      expect(svg.querySelector('rect')).toBeNull();
    }
  });

  it('shaded week chart ticks the day boundaries over the tint and bands the last day', () => {
    const { container } = tile({ ...WEEK, weekHighlightFromX: 0.6, weekDayBoundaries: [0.2, 0.4, 0.6] },
      { sparklineMode: 'week' });
    const svg = container.querySelector('svg.financial-sparkline')!;
    expect(svg.querySelectorAll('line.financial-sparkline-divider')).toHaveLength(3);
    expect(svg.querySelectorAll('rect')).toHaveLength(2); // backdrop + last-day band
    const html = svg.innerHTML;
    expect(html.indexOf('<path')).toBeLessThan(html.indexOf('financial-sparkline-divider'));
  });

  it('both-mode shares one domain and one label pair', () => {
    const { container } = tile({ ...WEEK, weekDayBoundaries: [0.5] }, { sparklineMode: 'both' });
    expect(container.querySelectorAll('svg.financial-sparkline')).toHaveLength(2);
    expect(container.querySelectorAll('.financial-axis-label')).toHaveLength(2);
    // Shared max comes from the week series (190), shared min is the common low (184.22)
    const labels = container.querySelectorAll('.financial-axis-label');
    expect(labels[0].textContent).toBe('$190');
    expect(labels[1].textContent).toBe('$184');
  });

  it('week-only mode uses the week domain and colors the week chart by its own move (classic)', () => {
    const { container } = tile({ ...WEEK, changeValue: 1.5, changeLabel: '+1.50 (+0.82%)' },
      { sparklineMode: 'week', sparklineTheme: 'classic' });
    expect(container.querySelectorAll('svg.financial-sparkline')).toHaveLength(1);
    const labels = container.querySelectorAll('.financial-axis-label');
    expect(labels[0].textContent).toBe('$190');
    expect(labels[1].textContent).toBe('$184');
    // Positive day, negative week: the classic week chart still colors by the week's move.
    expect(container.querySelector('svg.financial-sparkline')!.getAttribute('class')).toContain('text-red-400');
  });

  it('renders the change label as given (the en dash for a missing prior close)', () => {
    const { container } = tile({ changeValue: 0, changeLabel: '–' });
    expect(container.querySelector('.financial-single-delta')!.textContent).toBe('–');
  });

  it('no chart content when the series is too short (header still renders)', () => {
    const { container } = tile({ sparkline: [184.22] });
    expect(container.querySelector('svg.financial-sparkline')).toBeNull();
    expect(container.querySelector('.financial-single-price')).not.toBeNull();
    expect(container.querySelectorAll('.financial-axis-label')).toHaveLength(0);
  });

  it('renders a centered caption above each chart when labels are set, sharing the axis gutter column', () => {
    const { container } = tile(WEEK, { sparklineMode: 'both', labels: { day: '1-day', week: '5-days' } });
    const captions = container.querySelectorAll('.financial-single-caption');
    expect(captions).toHaveLength(2);
    // Week sits left of day (chronological reading order).
    expect(captions[0].textContent).toBe('5-days');
    expect(captions[1].textContent).toBe('1-day');
    expect(captions[0].className).toContain('text-center');
    // One gutter sizer sizes both the captions row and the charts row.
    expect(container.querySelectorAll('.financial-axis-label-sizer')).toHaveLength(1);
    expect((container.querySelector('.financial-single-block') as HTMLElement).style.gridTemplateRows).toBe('auto 1fr');
  });

  it('no captions without labels', () => {
    const { container } = tile({});
    expect(container.querySelector('.financial-single-caption')).toBeNull();
    expect((container.querySelector('.financial-single-block') as HTMLElement).style.gridTemplateRows).toBe('1fr');
  });
});
