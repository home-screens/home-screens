import { describe, it, expect } from 'vitest';
import { formatUSD, formatPercent, formatChange } from '../shared';

describe('formatUSD', () => {
  it('keeps two decimals from one dollar up, so no stock price changes', () => {
    expect(formatUSD(1)).toBe('$1.00');
    expect(formatUSD(1234.5)).toBe('$1,234.50');
    expect(formatUSD(189.999)).toBe('$190.00');
    expect(formatUSD(0)).toBe('$0.00');
  });

  it('keeps up to four decimals under a dollar', () => {
    expect(formatUSD(0.5)).toBe('$0.50');
    expect(formatUSD(0.85123)).toBe('$0.8512');
    expect(formatUSD(0.0123)).toBe('$0.0123');
  });

  it('shows a coin worth a fraction of a cent, where two decimals said $0.00', () => {
    expect(formatUSD(0.00001234)).toBe('$0.00001234');
    expect(formatUSD(0.000009)).toBe('$0.0000090');
    expect(formatUSD(0.00456789)).toBe('$0.004568');
  });

  it("uses the locale's own marks", () => {
    expect(formatUSD(1234.5, 'de-DE')).toBe('$1.234,50');
    expect(formatUSD(0.00001234, 'de-DE')).toBe('$0,00001234');
  });
});

describe('formatPercent and formatChange', () => {
  it('reads as before in English', () => {
    expect(formatPercent(1.234)).toBe('+1.23%');
    expect(formatPercent(-0.4)).toBe('-0.40%');
    expect(formatPercent(0)).toBe('+0.00%');
    expect(formatChange(12.5)).toBe('+12.50');
    expect(formatChange(-3)).toBe('-3.00');
  });

  it("uses the locale's decimal mark, like the price beside it", () => {
    expect(formatPercent(1.234, 'de-DE')).toBe('+1,23%');
    expect(formatChange(-1234.5, 'de-DE')).toBe('-1.234,50');
  });
});
