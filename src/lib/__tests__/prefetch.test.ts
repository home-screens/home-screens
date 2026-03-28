import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prefetchScreen } from '@/lib/prefetch';
import { displayCache } from '@/lib/display-cache';
import type { Screen } from '@/types/config';

vi.mock('@/lib/schedule', () => ({
  isModuleVisible: vi.fn(() => true),
}));

import { isModuleVisible } from '@/lib/schedule';
const mockIsModuleVisible = vi.mocked(isModuleVisible);

beforeEach(() => {
  displayCache.clear();
  vi.restoreAllMocks();
  mockIsModuleVisible.mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

function makeScreen(modules: Array<{ type: string; config?: Record<string, unknown> }>): Screen {
  return {
    id: 'test-screen',
    name: 'Test',
    modules: modules.map((m, i) => ({
      id: `mod-${i}`,
      type: m.type as Screen['modules'][0]['type'],
      position: { x: 0, y: 0 },
      size: { w: 200, h: 100 },
      config: m.config ?? {},
      style: {} as Screen['modules'][0]['style'],
      zIndex: i,
    })),
    backgroundImage: '',
  };
}

function mockFetchOk(data: unknown = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock = vi.fn((..._args: any[]) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(data) }),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('prefetchScreen', () => {
  it('prefetches URLs for registered module types', async () => {
    const mock = mockFetchOk({ data: 1 });

    const screen = makeScreen([
      { type: 'quote' },
      { type: 'dad-joke' },
    ]);

    await prefetchScreen(screen, new Date());

    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls.map((c) => c[0])).toContain('/api/quote');
    expect(mock.mock.calls.map((c) => c[0])).toContain('/api/jokes');
  });

  it('skips modules not in the fetch registry', async () => {
    const mock = mockFetchOk();

    const screen = makeScreen([
      { type: 'clock' },
      { type: 'text' },
      { type: 'quote' },
    ]);

    await prefetchScreen(screen, new Date());

    // Only quote is in the registry; clock and text are not
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][0]).toBe('/api/quote');
  });

  it('skips modules that are not visible per schedule', async () => {
    mockIsModuleVisible.mockReturnValue(false);

    const mock = vi.fn();
    vi.stubGlobal('fetch', mock);

    const screen = makeScreen([{ type: 'quote' }]);
    await prefetchScreen(screen, new Date());

    expect(mock).not.toHaveBeenCalled();
  });

  it('deduplicates URLs when multiple modules produce the same URL', async () => {
    const mock = mockFetchOk();

    const screen = makeScreen([
      { type: 'quote' },
      { type: 'quote' }, // same module type, same URL
    ]);

    await prefetchScreen(screen, new Date());

    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('skips null URLs from builders with missing config', async () => {
    const mock = mockFetchOk();

    const screen = makeScreen([
      { type: 'stock-ticker', config: {} }, // no symbols → null URL
      { type: 'quote' },
    ]);

    await prefetchScreen(screen, new Date());

    // Only quote should be fetched, stocks should be skipped
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][0]).toBe('/api/quote');
  });

  it('handles empty screens gracefully', async () => {
    const mock = vi.fn();
    vi.stubGlobal('fetch', mock);

    const screen = makeScreen([]);
    await prefetchScreen(screen, new Date());

    expect(mock).not.toHaveBeenCalled();
  });
});
