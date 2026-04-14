// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDisplayId } from '@/hooks/useDisplayId';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

import { usePathname } from 'next/navigation';

describe('useDisplayId', () => {
  const mockPath = (path: string | null) => {
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue(path);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the id from /display/[id]', () => {
    mockPath('/display/kitchen');
    const { result } = renderHook(() => useDisplayId());
    expect(result.current).toBe('kitchen');
  });

  it('returns undefined for the legacy /display route', () => {
    mockPath('/display');
    const { result } = renderHook(() => useDisplayId());
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when not on a display route (e.g. /editor)', () => {
    mockPath('/editor');
    const { result } = renderHook(() => useDisplayId());
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when pathname is null (SSR)', () => {
    mockPath(null);
    const { result } = renderHook(() => useDisplayId());
    expect(result.current).toBeUndefined();
  });

  it('strips trailing slash', () => {
    mockPath('/display/kitchen/');
    const { result } = renderHook(() => useDisplayId());
    expect(result.current).toBe('kitchen');
  });
});
