// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
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
// The fake responses are plain objects, NOT `new Response(...)`: in this jsdom
// environment on Node 22 (CI's .node-version), globalThis.Response is jsdom's
// while Blob is Node's, and consuming the cross-realm body throws
// "object.stream is not a function" — every 200 tile would land in the
// failure cooldown instead of loading. The store only reads `.ok` and awaits
// `.blob()`, which is all these fakes implement.
let tileResponder: (url: string) => number | 'hang' = () => 200;
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
      // Two frames' worth of tiles: small enough that a third frame forces
      // the store to evict, so the bounded-cache test can observe it.
      maxEntries: 50,
      now: () => tileNow,
      fetchImpl: (async (url: string | URL | Request) => {
        const u = String(url);
        tileFetches.push(u);
        const status = tileResponder(u);
        if (status === 'hang') return new Promise(() => {});
        return status === 200
          ? { ok: true, status, blob: async () => new Blob(['png']) }
          : { ok: false, status };
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
    tileResponder = () => 200;
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
    // Base map tiles keep their direct OSM srcs.
    expect(document.querySelectorAll('img[src*="tile.openstreetmap.org"]')).toHaveLength(
      TILES_PER_FRAME,
    );
  });

  it('server-renders without throwing (useSyncExternalStore needs a server snapshot)', () => {
    // The display route renders modules on the server; React's server renderer
    // requires getServerSnapshot on every useSyncExternalStore call or the
    // whole page 500s (e2e stays green only because the browser recovers).
    mockData = makeData([6100]);
    expect(() => renderToString(ui())).not.toThrow();
  });

  it('does not re-request failed tiles at animation tempo', async () => {
    tileResponder = () => 503; // every tile fails
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

  it('a second instance with a different window cannot evict the first’s tiles', async () => {
    // Latitudes 44.7 and 60 sit on fully disjoint tile rows at zoom 6, so the
    // two windows share zero URLs.
    mockData = makeData([5100]);
    const tree = (withSecond: boolean) => (
      <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
        <RainMapModule config={{ ...config, latitude: 44.7 }} style={style} />
        {withSecond && <RainMapModule config={{ ...config, latitude: 60 }} style={style} />}
      </I18nProvider>
    );
    const { rerender } = render(tree(false));
    await flush();
    expect(document.querySelectorAll('img[src^="blob:"]')).toHaveLength(TILES_PER_FRAME);

    // A second rain-map joins the screen (editor preview, second module).
    // Registering its window must not revoke the first instance's tiles —
    // pruning is to the union of live windows, not the last caller's window.
    await act(async () => rerender(tree(true)));
    await flush();
    expect(document.querySelectorAll('img[src^="blob:"]')).toHaveLength(TILES_PER_FRAME * 2);
  });

  it('keeps the store bounded as frames rotate out of the window', async () => {
    mockData = makeData([2100, 2200]);
    const { rerender } = render(ui());
    await flush();
    expect(requestsFor(2100)).toBe(TILES_PER_FRAME);
    expect(requestsFor(2200)).toBe(TILES_PER_FRAME);

    // Refresh slides the window: frame 2100 rotates out, 2300 arrives. Three
    // frames exceed the store's cap, so the frame no live window wants goes.
    mockData = makeData([2200, 2300]);
    await act(async () => rerender(ui()));
    await flush();
    expect(requestsFor(2300)).toBe(TILES_PER_FRAME);

    // A window containing frame 2100 again must re-request its tiles: they
    // were evicted. (An unbounded store would serve them forever and grow
    // with every timestamped frame path the API ever returned.)
    mockData = makeData([2100, 2200]);
    await act(async () => rerender(ui()));
    await flush();
    expect(requestsFor(2100)).toBe(TILES_PER_FRAME * 2);
  });

  it('a refresh next to a sibling instance does not refetch either window', async () => {
    // Both instances re-run their tile effects in one commit: React runs
    // every cleanup (release) before every effect body (retain). Nothing may
    // be evicted in between, or both windows reload every refresh.
    mockData = makeData([8100]);
    const tree = () => (
      <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
        <RainMapModule config={{ ...config, latitude: 44.7 }} style={style} />
        <RainMapModule config={{ ...config, latitude: 60 }} style={style} />
      </I18nProvider>
    );
    const { rerender } = render(tree());
    await flush();
    expect(requestsFor(8100)).toBe(TILES_PER_FRAME * 2);

    mockData = makeData([8100, 8200]);
    await act(async () => rerender(tree()));
    await flush();
    expect(requestsFor(8100)).toBe(TILES_PER_FRAME * 2); // unchanged frame served from cache
    expect(requestsFor(8200)).toBe(TILES_PER_FRAME * 2);
    expect(document.querySelectorAll('img[src^="blob:"]')).toHaveLength(TILES_PER_FRAME * 2);
  });

  it('rotating between two screens with different rain-maps reuses both windows', async () => {
    mockData = makeData([9100]);
    const tree = (latitude: number) => (
      <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
        <RainMapModule key={latitude} config={{ ...config, latitude }} style={style} />
      </I18nProvider>
    );
    // Screen 1 (lat 44.7) → screen 2 (lat 60) → back to screen 1.
    const { rerender } = render(tree(44.7));
    await flush();
    await act(async () => rerender(tree(60)));
    await flush();
    expect(requestsFor(9100)).toBe(TILES_PER_FRAME * 2);

    await act(async () => rerender(tree(44.7)));
    await flush();
    expect(requestsFor(9100)).toBe(TILES_PER_FRAME * 2); // no refetch on the way back
    expect(document.querySelectorAll('img[src^="blob:"]')).toHaveLength(TILES_PER_FRAME);
  });

  it('does not advance onto a frame whose tiles have not loaded', async () => {
    vi.useFakeTimers();
    // Frame 2 never loads: the loop must keep showing frame 1 rather than
    // cycling through a blank frame while the store paces its requests.
    tileResponder = (u) => (u.includes('/v2/radar/7200/') ? 'hang' : 200);
    mockData = makeData([7100, 7200]);
    render(ui({ animationSpeedMs: 500, extraDelayLastFrameMs: 500 }));
    await flush();
    const before = [...document.querySelectorAll('img[src^="blob:"]')].map(
      (img) => (img as HTMLImageElement).src,
    );
    expect(before).toHaveLength(TILES_PER_FRAME);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    const after = [...document.querySelectorAll('img[src^="blob:"]')].map(
      (img) => (img as HTMLImageElement).src,
    );
    expect(after).toEqual(before);
  });
});
