// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useStoryImage } from '../news-hooks';

const item = (imageUrl: string | null, imageUrlOriginal?: string | null) =>
  ({ imageUrl, imageUrlOriginal });

describe('useStoryImage', () => {
  it('serves the rewritten URL first', () => {
    const { result } = renderHook(() => useStoryImage(item('https://cdn/big.jpg', 'https://cdn/small.jpg')));
    expect(result.current.src).toBe('https://cdn/big.jpg');
  });

  it('falls back to the feed URL when the rewritten one fails', () => {
    const { result } = renderHook(() => useStoryImage(item('https://cdn/big.jpg', 'https://cdn/small.jpg')));
    act(() => result.current.onError());
    expect(result.current.src).toBe('https://cdn/small.jpg');
  });

  it('gives up to the placeholder once every candidate has failed', () => {
    const { result } = renderHook(() => useStoryImage(item('https://cdn/big.jpg', 'https://cdn/small.jpg')));
    act(() => result.current.onError());
    act(() => result.current.onError());
    expect(result.current.src).toBeNull();
  });

  it('has a single candidate when nothing was rewritten', () => {
    const { result } = renderHook(() => useStoryImage(item('https://cdn/only.jpg')));
    expect(result.current.src).toBe('https://cdn/only.jpg');
    act(() => result.current.onError());
    expect(result.current.src).toBeNull();
  });

  it('does not retry the same URL twice when the two match', () => {
    const { result } = renderHook(() => useStoryImage(item('https://cdn/same.jpg', 'https://cdn/same.jpg')));
    act(() => result.current.onError());
    expect(result.current.src).toBeNull();
  });

  it('starts fresh when the story changes', () => {
    const { result, rerender } = renderHook(
      ({ i }) => useStoryImage(i),
      { initialProps: { i: item('https://cdn/a-big.jpg', 'https://cdn/a-small.jpg') } },
    );
    act(() => result.current.onError());
    expect(result.current.src).toBe('https://cdn/a-small.jpg');

    rerender({ i: item('https://cdn/b-big.jpg', 'https://cdn/b-small.jpg') });
    expect(result.current.src).toBe('https://cdn/b-big.jpg');
  });

  it('is null-safe for a story with no picture', () => {
    const { result } = renderHook(() => useStoryImage(item(null)));
    expect(result.current.src).toBeNull();
  });
});
