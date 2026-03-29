import { describe, it, expect } from 'vitest';
import { buildModuleShadow } from '../module-style';

describe('buildModuleShadow', () => {
  it('returns "none" when shadowSize is 0', () => {
    expect(buildModuleShadow(0)).toBe('none');
  });

  it('returns "none" when shadowSize is negative', () => {
    expect(buildModuleShadow(-5)).toBe('none');
  });

  it('produces three shadow layers for positive shadowSize', () => {
    const result = buildModuleShadow(10);
    // Contains inset highlight, drop shadow, and ambient glow
    expect(result).toContain('inset');
    expect(result).toContain('rgba(0, 0, 0, 0.8)');
    expect(result).toContain('rgba(255, 255, 255, 0.04)');
    expect(result).toContain('rgba(255, 255, 255, 0.12)');
  });

  it('computes correct values for shadowSize=10, scale=1', () => {
    const result = buildModuleShadow(10);
    // offset = round(10/2 * 1) = 5
    // blur = 10 * 1 = 10
    // ambient = round(10/2 * 1) = 5
    expect(result).toBe(
      'inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 5px 10px rgba(0, 0, 0, 0.8), 0 0 5px rgba(255, 255, 255, 0.04)',
    );
  });

  it('applies scale factor to offset, blur, and ambient', () => {
    const result = buildModuleShadow(10, 2);
    // offset = round(10/2 * 2) = 10
    // blur = 10 * 2 = 20
    // ambient = round(10/2 * 2) = 10
    expect(result).toBe(
      'inset 0 2px 0 rgba(255, 255, 255, 0.12), 0 10px 20px rgba(0, 0, 0, 0.8), 0 0 10px rgba(255, 255, 255, 0.04)',
    );
  });

  it('defaults scale to 1 when omitted', () => {
    expect(buildModuleShadow(4)).toBe(buildModuleShadow(4, 1));
  });

  it('handles fractional shadowSize with rounding', () => {
    const result = buildModuleShadow(7);
    // offset = round(7/2 * 1) = round(3.5) = 4
    // blur = 7
    // ambient = round(3.5) = 4
    expect(result).toContain('4px 7px');
    expect(result).toContain('0 0 4px');
  });
});
