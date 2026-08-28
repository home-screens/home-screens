// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE, type RainMapConfig, type ModuleStyle } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';

// The real wire contract, so the mock cannot drift from what the route
// actually serves and the module actually reads.
import type { RainFrame, RainViewerResponse } from '@/lib/rain-map-types';

// Drive the RainViewer index fetch deterministically.
let mockData: RainViewerResponse | null = null;
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: () => [mockData, null],
}));

// Radar tiles go through the module's tile store (fetch + object URLs), never
// through <img src> to the CDN. Swap the shared store for a controllable one
// whose network and clock are fake; the component code under test is real.
let tileResponder: (url: string) => boolean = () => true;
let tileNow = 0;
let tileBlobSeq = 0;
const tileFetches: string[] = [];
vi.mock('../rain-map-preload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../rain-map-preload')>();
  return {
    ...actual,
    radarTileStore: actual.createTileStore({
      spacingMs: 0,
      cooldownMs: 60_000,
      now: () => tileNow,
      fetchImpl: (async (url: string | URL | Request) => {
        const u = String(url);
        tileFetches.push(u);
        return tileResponder(u)
          ? new Response(new Blob(['png']), { status: 200 })
          : new Response(null, { status: 429 });
      }) as unknown as typeof fetch,
      createObjectURL: () => `blob:mock-${++tileBlobSeq}`,
      revokeObjectURL: () => {},
    }),
  };
});

import RainMapModule from '../RainMapModule';

const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE };

// Huge animation delays so the rotation timer never fires under real timers;
// each preload cycle is driven purely by settling the fake fetches. The
// frame-swap test uses fake timers with small delays instead.
const config: RainMapConfig = {
  latitude: 44.7,
  longitude: -93.4,
  zoom: 6, // gridRadius 2 → 5×5 = 25 radar tiles per frame
  animationSpeedMs: 600_000,
  extraDelayLastFrameMs: 600_000,
  colorScheme: 2,
  smooth: true,
  showSnow: true,
  opacity: 0.7,
  showTimestamp: true,
  showTimeline: true,
  refreshIntervalMs: 600_000,
  mapStyle: 'dark',
};

const TILES_PER_FRAME = 25;

const frame = (t: number): RainFrame => ({ time: t, path: `/v2/radar/${t}` });
const makeData = (times: number[]): RainViewerResponse => ({
  version: '2.0',
  generated: 0,
  host: 'https://tiles.test',
  radar: { past: times.map(frame), nowcast: [] },
  satellite: { infrared: [] },
});

/** Count tile requests issued for a given frame timestamp. */
const requestsFor = (t: number) =>
  tileFetches.filter((url) => url.includes(`/v2/radar/${t}/`)).length;

/** Flush the fetch/store/animation promise chains until they settle. */
async function flush() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function ui(overrides?: Partial<RainMapConfig>) {
  return (
    <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
      <RainMapModule config={{ ...config, ...overrides }} style={style} />
    </I18nProvider>
  );
}

describe('RainMapModule tile pipeline', () => {
  beforeEach(() => {
    tileResponder = () => true;
    tileNow = 0;
    tileFetches.length = 0;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    mockData = null;
  });

  it('renders loaded radar tiles from the store, not from CDN URLs', async () => {
    mockData = makeData([1000]);
    render(ui());
    await flush();

    const imgs = document.querySelectorAll('img[src^="blob:"]');
    expect(imgs).toHaveLength(TILES_PER_FRAME);
    // Base map tiles keep their direct CDN srcs.
    expect(document.querySelectorAll('img[src*="basemaps.cartocdn.com"]')).toHaveLength(
      TILES_PER_FRAME,
    );
  });

  it('does not re-request failed tiles at animation tempo', async () => {
    tileResponder = () => false; // every tile 429s
    mockData = makeData([1100]);
    render(ui());
    await flush();

    // Initial pass: one request per tile. The animation loop then ensures the
    // "next" frame — the same single frame — which must be a no-op while the
    // cooldown holds instead of re-feeding the rate limiter.
    expect(requestsFor(1100)).toBe(TILES_PER_FRAME);
  });

  it('advancing frames swaps src on the same <img> nodes (no remount refetch)', async () => {
    vi.useFakeTimers();
    mockData = makeData([3100, 3200]);
    // animationSpeedMs is clamped to a 500ms minimum by the component.
    render(ui({ animationSpeedMs: 500, extraDelayLastFrameMs: 500 }));
    await flush();

    const beforeNodes = [...document.querySelectorAll('img[src^="blob:"]')] as HTMLImageElement[];
    // Snapshot src VALUES — reading node.src later would return the mutated
    // (already-swapped) value since the nodes are reused.
    const beforeSrcs = beforeNodes.map((img) => img.src);
    expect(beforeNodes).toHaveLength(TILES_PER_FRAME);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const after = [...document.querySelectorAll('img[src^="blob:"]')] as HTMLImageElement[];
    expect(after).toHaveLength(TILES_PER_FRAME);
    // Same DOM nodes (stable per-tile keys), different frame's blob srcs.
    expect(after.every((img, i) => img === beforeNodes[i])).toBe(true);
    expect(after.some((img, i) => img.src !== beforeSrcs[i])).toBe(true);
  });

  it('debounces radar window changes so slider drags fetch only the resting zoom', async () => {
    vi.useFakeTimers();
    mockData = makeData([4100]);
    const { rerender } = render(ui({ zoom: 6 }));
    await flush();
    expect(tileFetches.filter((u) => u.includes('/256/6/')).length).toBe(TILES_PER_FRAME);

    // A drag through zoom 5 must not fetch zoom 5's window — only the value
    // the slider settles on (zoom 4) may load, after the debounce.
    await act(async () => rerender(ui({ zoom: 5 })));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
      await rerender(ui({ zoom: 4 }));
    });
    await act(async () => rerender(ui({ zoom: 4 })));
    expect(tileFetches.filter((u) => u.includes('/256/5/')).length).toBe(0);
    expect(tileFetches.filter((u) => u.includes('/256/4/')).length).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await flush();
    expect(tileFetches.filter((u) => u.includes('/256/5/')).length).toBe(0);
    expect(tileFetches.filter((u) => u.includes('/256/4/')).length).toBe(TILES_PER_FRAME);
  });

  it('prunes the store to the current animation window when frames rotate', async () => {
    mockData = makeData([2100, 2200]);
    const { rerender } = render(ui());
    await flush();
    expect(requestsFor(2100)).toBe(TILES_PER_FRAME);
    expect(requestsFor(2200)).toBe(TILES_PER_FRAME);

    // Refresh slides the window: frame 2100 rotates out, 2300 arrives.
    // The effect must prune 2100's URLs from the store.
    mockData = makeData([2200, 2300]);
    await act(async () => rerender(ui()));
    await flush();

    // A window containing frame 2100 again must re-request its tiles: they
    // were pruned. (Unpruned legacy behavior would serve them from the
    // ever-growing store and issue zero requests.)
    mockData = makeData([2100, 2200]);
    await act(async () => rerender(ui()));
    await flush();
    expect(requestsFor(2100)).toBe(TILES_PER_FRAME * 2);
  });
});
