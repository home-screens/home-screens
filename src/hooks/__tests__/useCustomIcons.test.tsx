// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/display-fetch', () => ({ displayFetch: fetchMock }));
const editorFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/editor-fetch', () => ({ editorFetch: editorFetchMock, isSessionExpired: () => false }));

function catalog(names: string[]) {
  return new Response(JSON.stringify({
    icons: names.map((name, i) => ({ id: `icon${String(i).padStart(8, 'a')}`, name, hash: 'a'.repeat(32), bytes: 10, animated: false, createdAt: '', updatedAt: '', url: `/x/${i}` })),
    bytes: names.length * 10,
  }));
}

/** Let the catalog request's promises settle without firing any timer. */
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  fetchMock.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useCustomIcons', () => {
  it('refreshes a stale catalog when a screen with icons comes back', async () => {
    const { useCustomIcons } = await import('../useCustomIcons');
    fetchMock.mockResolvedValueOnce(catalog(['Taco']));
    const first = renderHook(() => useCustomIcons());
    await act(async () => { await flush(); });
    expect(first.result.current.icons.map((i) => i.name)).toEqual(['Taco']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The wall rotates to a clock: nothing is subscribed, so no timer runs.
    first.unmount();
    await act(async () => { vi.advanceTimersByTime(20 * 60 * 1000); });
    // Back to an icon screen inside the interval: the catalog is still fresh.
    const second = renderHook(() => useCustomIcons());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    second.unmount();

    // Rotating away and back past the interval must refresh on arrival,
    // not wait out another full interval that rotation would cut short again.
    await act(async () => { vi.advanceTimersByTime(15 * 60 * 1000); });
    fetchMock.mockResolvedValueOnce(catalog(['Taco', 'Pizza']));
    const third = renderHook(() => useCustomIcons());
    await act(async () => { await flush(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(third.result.current.icons.map((i) => i.name)).toEqual(['Taco', 'Pizza']);
    third.unmount();
  });

  it('adds an icon another device already kept when the upload finds it', async () => {
    const { useCustomIcons, uploadCustomIcon } = await import('../useCustomIcons');
    fetchMock.mockResolvedValueOnce(catalog([]));
    const hook = renderHook(() => useCustomIcons());
    await act(async () => { await flush(); });
    const icon = { id: 'aaaaaaaaaaaa', name: 'Taco', hash: 'b'.repeat(32), bytes: 10, animated: false, createdAt: '', updatedAt: '', url: '/t' };
    editorFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ icon, existing: true })));
    await act(async () => { await uploadCustomIcon(new File(['x'], 't.png', { type: 'image/png' })); });
    expect(hook.result.current.byId.get('aaaaaaaaaaaa')?.name).toBe('Taco');
    hook.unmount();
  });
});
