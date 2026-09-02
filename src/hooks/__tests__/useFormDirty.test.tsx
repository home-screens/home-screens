// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFormDirty } from '../useFormDirty';

describe('useFormDirty', () => {
  it('starts clean and stays clean while the values match the first render', () => {
    const { result, rerender } = renderHook(({ values }) => useFormDirty(values), {
      initialProps: { values: ['Avery', '🦊', '#f59e0b'] as unknown[] },
    });
    expect(result.current).toBe(false);
    // A new array with the same contents is not an edit.
    rerender({ values: ['Avery', '🦊', '#f59e0b'] });
    expect(result.current).toBe(false);
  });

  it('turns dirty on any change and clean again when the edit is reverted', () => {
    const { result, rerender } = renderHook(({ values }) => useFormDirty(values), {
      initialProps: { values: ['Avery', [1, 2, 3], { a: 1 }] as unknown[] },
    });
    rerender({ values: ['Avery R', [1, 2, 3], { a: 1 }] });
    expect(result.current).toBe(true);
    rerender({ values: ['Avery', [1, 2, 3], { a: 1 }] });
    expect(result.current).toBe(false);
    rerender({ values: ['Avery', [1, 2], { a: 1 }] });
    expect(result.current).toBe(true);
  });
});
