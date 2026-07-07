// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE, type RainMapConfig, type ModuleStyle } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';

interface RainFrame {
  time: number;
  path: string;
}
interface RainViewerData {
  host: string;
  radar: { past: RainFrame[]; nowcast: RainFrame[] };
}

// Drive the RainViewer index fetch deterministically.
let mockData: RainViewerData | null = null;
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: () => [mockData, null],
}));

import RainMapModule from '../RainMapModule';

/**
 * Preload requests go through `new Image()` (via createTilePreloader's default
 * factory); the rendered <img> tags do not, so FakeImage.instances counts
 * exactly the preload traffic.
 */
class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() {
    FakeImage.instances.push(this);
  }
}

const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE };

// Huge animation delays so the rotation timer never fires under real timers;
// each preload cycle is driven purely by settling the fake images.
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
const makeData = (times: number[]): RainViewerData => ({
  host: 'https://tiles.test',
  radar: { past: times.map(frame), nowcast: [] },
});

/** Count preload requests issued for a given frame timestamp. */
const requestsFor = (t: number) =>
  FakeImage.instances.filter((img) => img.src.includes(`/v2/radar/${t}/`)).length;

/** Settle every pending preload image, flushing the resulting microtasks. */
async function settleAll(mode: 'load' | 'error') {
  const pending = FakeImage.instances.filter((img) => img.onload);
  await act(async () => {
    for (const img of pending) {
      const cb = mode === 'load' ? img.onload : img.onerror;
      img.onload = img.onerror = null;
      cb?.();
    }
  });
}

function ui() {
  return (
    <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
      <RainMapModule config={config} style={style} />
    </I18nProvider>
  );
}

describe('RainMapModule preload cache', () => {
  beforeEach(() => {
    FakeImage.instances = [];
    vi.stubGlobal('Image', FakeImage);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    mockData = null;
  });

  it('retries failed tiles on the next preload pass instead of caching the failure', async () => {
    mockData = makeData([1000]);
    render(ui());

    // Initial preload of the only frame.
    expect(requestsFor(1000)).toBe(TILES_PER_FRAME);

    // Every tile fails (transient CDN blip). The animation loop then preloads
    // the "next" frame — the same single frame — which must re-request the
    // failed tiles rather than treat them as loaded.
    await settleAll('error');
    expect(requestsFor(1000)).toBe(TILES_PER_FRAME * 2);
  });

  it('prunes the cache to the current animation window when frames rotate', async () => {
    mockData = makeData([1000, 2000]);
    const { rerender } = render(ui());

    // Frame 1000 preloads, then the loop preloads frame 2000.
    expect(requestsFor(1000)).toBe(TILES_PER_FRAME);
    await settleAll('load');
    expect(requestsFor(2000)).toBe(TILES_PER_FRAME);
    await settleAll('load');

    // Refresh slides the window: frame 1000 rotates out, 3000 arrives.
    // The effect must prune 1000's URLs from the cache.
    mockData = makeData([2000, 3000]);
    await act(async () => rerender(ui()));
    await settleAll('load');

    // A window containing frame 1000 again must re-request its tiles: they
    // were pruned. (Unpruned legacy behavior would serve them from the
    // ever-growing cache and issue zero requests.)
    mockData = makeData([1000, 2000]);
    await act(async () => rerender(ui()));
    expect(requestsFor(1000)).toBe(TILES_PER_FRAME * 2);
  });
});
