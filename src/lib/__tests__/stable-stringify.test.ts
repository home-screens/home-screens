import { describe, it, expect } from 'vitest';
import { stableStringify } from '../stable-stringify';

describe('stableStringify', () => {
  it('is key-order-independent for flat objects', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it('is key-order-independent for nested objects', () => {
    expect(stableStringify({ x: { p: 1, q: 2 }, y: 3 })).toBe(
      stableStringify({ y: 3, x: { q: 2, p: 1 } }),
    );
  });

  it('preserves array order', () => {
    expect(stableStringify([1, 2, 3])).toBe(stableStringify([1, 2, 3]));
    expect(stableStringify([1, 2, 3])).not.toBe(stableStringify([3, 2, 1]));
  });

  it('treats arrays of objects as order-sensitive', () => {
    expect(stableStringify([{ a: 1 }, { b: 2 }])).not.toBe(
      stableStringify([{ b: 2 }, { a: 1 }]),
    );
  });

  it('stringifies primitives as JSON-equivalent output', () => {
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('hi')).toBe('"hi"');
    expect(stableStringify(true)).toBe('true');
    expect(stableStringify(false)).toBe('false');
    expect(stableStringify(null)).toBe('null');
  });

  it('renders undefined as the string "undefined"', () => {
    expect(stableStringify(undefined)).toBe('undefined');
  });

  it('applies key-order-independent stringification to objects nested in arrays', () => {
    expect(stableStringify([{ a: 1, b: 2 }])).toBe(stableStringify([{ b: 2, a: 1 }]));
  });
});
