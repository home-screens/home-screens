// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { DEFAULT_MODULE_STYLE, type RainMapConfig, type ModuleStyle } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';

// The real wire contract, so the mock cannot drift from what the route
// actually serves and the module actually reads.
import type { RainFrame, RadarIndexResponse } from '@/lib/rain-map-types';

// Drive the radar index fetch deterministically.
let mockData: RadarIndexResponse | null = null;
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
// jsdom lays nothing out, so the box would measure 0x0 and the grids would be
// empty. Report a 1024px square: 5x5 base tiles at 256px and 3x3 radar tiles
// at 512px, whatever the centre's fractional tile offset.
vi.mock('@/hooks/useElementBox', () => ({
  useElementBox: () => [() => {}, { width: 1024, height: 1024 }],
}));

let tileResponder: (url: string) => number | 'hang' = () => 200;
// Hung tile requests, releasable mid-test as successes.
let hungTiles: Array<() => void> = [];
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
      maxEntries: 18,
      warn: () => {},
      now: () => tileNow,
      fetchImpl: (async (url: string | URL | Request) => {
        const u = String(url);
        tileFetches.push(u);
        const status = tileResponder(u);
        if (status === 'hang') {
          return new Promise((resolve) => {
            hungTiles.push(() => resolve({ ok: true, status: 200, blob: async () => new Blob(['png']) }));
          });
        }
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
  zoom: 6, // 1024px box → 5×5 base tiles, 3×3 radar tiles (512px at zoom 5)
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

const TILES_PER_FRAME = 9;
const BASE_TILES = 25;

const frame = (t: number): RainFrame => ({ time: t, path: `/v2/radar/${t}` });
const makeData = (times: number[]): RadarIndexResponse => ({
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
    hungTiles = [];
    tileNow = 0;
    tileFetches.length = 0;
  });

  afterEach(async () => {
    cleanup();
    // The store is shared across tests and caps in-flight requests, so a test
    // that leaves tiles hanging would wedge every later test's queue.
    hungTiles.splice(0).forEach((release) => release());
    for (let i = 0; i < 10; i++) await Promise.resolve();
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
      BASE_TILES,
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
    expect(tileFetches.filter((u) => u.includes('/512/5/')).length).toBe(TILES_PER_FRAME);

    // A drag through zoom 5 must not fetch zoom 5's window — only the value
    // the slider settles on (zoom 4) may load, after the debounce.
    await act(async () => rerender(ui({ zoom: 5 })));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
      await rerender(ui({ zoom: 4 }));
    });
    await act(async () => rerender(ui({ zoom: 4 })));
    expect(tileFetches.filter((u) => u.includes('/512/4/')).length).toBe(0);
    expect(tileFetches.filter((u) => u.includes('/512/3/')).length).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await flush();
    expect(tileFetches.filter((u) => u.includes('/512/4/')).length).toBe(0);
    expect(tileFetches.filter((u) => u.includes('/512/3/')).length).toBe(TILES_PER_FRAME);
  });

  it('a second instance with a different window cannot evict the first’s tiles', async () => {
    // Latitudes 44.7 and 70 sit on fully disjoint radar tile rows (10-12 and
    // 5-7 at zoom 5), so the two windows share zero URLs.
    mockData = makeData([5100]);
    const tree = (withSecond: boolean) => (
      <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
        <RainMapModule config={{ ...config, latitude: 44.7 }} style={style} />
        {withSecond && <RainMapModule config={{ ...config, latitude: 70 }} style={style} />}
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
        <RainMapModule config={{ ...config, latitude: 70 }} style={style} />
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
    // Screen 1 (lat 44.7) → screen 2 (lat 70) → back to screen 1.
    const { rerender } = render(tree(44.7));
    await flush();
    await act(async () => rerender(tree(70)));
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
  it('holds a frame with a failed tile out of the loop until the retry lands, instead of showing a hole', async () => {
    vi.useFakeTimers();
    // One tile of frame 2 fails on its first request (a slow render aborted,
    // a 5xx); everything else loads. Frame 2 has "settled", but with a hole,
    // so the loop must stay on frame 1 and retry frame 2's tile once the
    // store's cooldown (60s in this mock) lapses, then move on.
    let failedOnce = false;
    tileResponder = (u) => {
      if (u.includes('/v2/radar/9200/') && !failedOnce) {
        failedOnce = true;
        return 503;
      }
      return 200;
    };
    mockData = makeData([9100, 9200]);
    // A long end-of-loop hold so that, once the loop reaches frame 2, it
    // stays there long enough to be observed rather than wrapping at once.
    render(ui({ animationSpeedMs: 500, extraDelayLastFrameMs: 60_000 }));
    await flush();
    const currentDot = () =>
      [...document.querySelectorAll('[data-testid="rain-map-timeline"] .rounded-full')].findIndex(
        (el) => (el as HTMLElement).style.width === '8px',
      );
    expect(currentDot()).toBe(0);
    expect(requestsFor(9200)).toBe(TILES_PER_FRAME);

    // Frame 2 is not ready: the animation tempo does not reach it.
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(currentDot()).toBe(0);
    expect(requestsFor(9200)).toBe(TILES_PER_FRAME); // no animation-tempo retry

    // The cooldown lapses: one retry for the failed tile, frame 2 joins, and
    // the loop steps onto it at animation tempo.
    tileNow = 60_000;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await flush();
    expect(requestsFor(9200)).toBe(TILES_PER_FRAME + 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(currentDot()).toBe(1);
  });

  it('plays a cold start as one forward sweep, parking until the next frame lands', async () => {
    vi.useFakeTimers();
    // Frames 1 and 2 load at once; frame 3 is still on its way. The loop must
    // step 1 → 2 and then hold on 2 (not wrap back to 1) until 3 arrives, and
    // only start looping once every frame has settled.
    tileResponder = (u) => (u.includes('/v2/radar/8300/') ? 'hang' : 200);
    mockData = makeData([8100, 8200, 8300]);
    render(ui({ animationSpeedMs: 500, extraDelayLastFrameMs: 500 }));
    await flush();
    const currentDot = () =>
      [...document.querySelectorAll('[data-testid="rain-map-timeline"] .rounded-full')].findIndex(
        (el) => (el as HTMLElement).style.width === '8px',
      );
    expect(currentDot()).toBe(0);

    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(currentDot()).toBe(1);

    // Parked: neither the frame tempo nor the end-of-loop hold moves it.
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(currentDot()).toBe(1);

    // Frame 3 lands (the four hung tiles resolve and the rest load at once):
    // the sweep continues, then the loop wraps.
    tileResponder = () => 200;
    await act(async () => { hungTiles.splice(0).forEach((release) => release()); });
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(currentDot()).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(currentDot()).toBe(0);
  });
});
