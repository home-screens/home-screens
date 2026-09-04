// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFontsReady } from '../useFontsReady';

const original = Object.getOwnPropertyDescriptor(document, 'fonts');

function stubFonts(value: unknown) {
  Object.defineProperty(document, 'fonts', { value, configurable: true });
}

afterEach(() => {
  if (original) Object.defineProperty(document, 'fonts', original);
  else delete (document as unknown as Record<string, unknown>).fonts;
});

describe('useFontsReady', () => {
  it('turns true once the font set reports ready', async () => {
    let resolveReady: () => void = () => {};
    stubFonts({ ready: new Promise<void>((r) => { resolveReady = r; }) });

    const { result } = renderHook(() => useFontsReady());
    // False first: a measurement taken now would be in the fallback face, and
    // the caller must be able to tell that apart from a settled one.
    expect(result.current).toBe(false);

    resolveReady();
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('reports ready when the engine has no FontFaceSet at all', async () => {
    stubFonts(undefined);
    const { result } = renderHook(() => useFontsReady());
    // Nothing to wait for, so callers must not stall on a browser that cannot
    // answer the question.
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('does not set state after the caller unmounts', async () => {
    let resolveReady: () => void = () => {};
    stubFonts({ ready: new Promise<void>((r) => { resolveReady = r; }) });

    const { result, unmount } = renderHook(() => useFontsReady());
    unmount();
    resolveReady();
    await Promise.resolve();
    expect(result.current).toBe(false);
  });
});
