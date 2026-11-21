// @vitest-environment jsdom

/**
 * The layer that draws "Show on every screen" modules once above the rotating
 * canvas: which instances it picks, that the pick survives a screen change
 * without a remount, and that the module's own gates still apply.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { makeTestScreen } from '@/test-utils';
import { render, cleanup, act } from '@testing-library/react';
import type { Screen, ModuleInstance } from '@/types/config';
import type { DisplaySettings } from '../useLiveConfig';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { SharedDisplayData } from '@/lib/module-props';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import { usePluginStore } from '@/stores/plugin-store';
import PinnedModuleLayer from '../PinnedModuleLayer';
import { collectPinnedModules } from '@/lib/pinned-modules';
import { emptyWeatherPayloads } from '@/lib/weather-providers';

let mounts = 0;
let lateLoaded = false;
vi.mock('@/lib/module-components', () => ({
  getModuleComponent: (type: string) => {
    if (type === 'plugin:unloaded') return undefined;
    if (type === 'plugin:late' && !lateLoaded) return undefined;
    const Probe = ({ config }: { config: Record<string, unknown> }) => {
      // Counted once per mount, not per render: the layer's whole point.
      const first = (globalThis as { __probeMounted?: Set<string> }).__probeMounted ??= new Set();
      const key = JSON.stringify(config);
      if (!first.has(key)) { first.add(key); mounts += 1; }
      return <div data-testid="probe" data-config={key} />;
    };
    return Probe;
  },
}));

const settings = {
  timezone: 'UTC',
  latitude: 0,
  longitude: 0,
  weather: { provider: 'weatherapi', units: 'imperial' },
} as unknown as DisplaySettings;

const sharedData: SharedDisplayData = {
  weatherByProvider: emptyWeatherPayloads(),
  weatherErrors: {}, calendarData: null,
  calendarStatus: { error: null, updatedAt: null },
};

let nextId = 0;
function makeModule(overrides: Partial<ModuleInstance>): ModuleInstance {
  return {
    id: `mod-${nextId++}`,
    type: 'text',
    position: { x: 10, y: 20 },
    size: { w: 300, h: 100 },
    zIndex: 0,
    config: { id: nextId },
    style: { ...DEFAULT_MODULE_STYLE },
    showOnEveryScreen: true,
    ...overrides,
  };
}

function layer(screens: Screen[]) {
  return (
    <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
      <PinnedModuleLayer
        screens={screens}
        settings={settings}
        sharedData={sharedData}
        now={new Date()}
        displayW={1080}
        displayH={1920}
        scale={0.5}
        offsetTop={12}
        offsetLeft={0}
        transform="none"
      />
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  (globalThis as { __probeMounted?: Set<string> }).__probeMounted = undefined;
  mounts = 0;
  lateLoaded = false;
  usePluginStore.setState({ plugins: new Map() });
});

describe('collectPinnedModules', () => {
  it('takes flagged modules from every switched-on screen, in stacking order', () => {
    const low = makeModule({ zIndex: 1 });
    const high = makeModule({ zIndex: 5 });
    const plain = makeModule({ showOnEveryScreen: undefined });
    const hiddenCopy = makeModule({ backgroundProvider: true });
    const offScreen = makeModule({});
    const picked = collectPinnedModules([
      makeTestScreen('a', [high, plain]),
      makeTestScreen('b', [low, hiddenCopy]),
      makeTestScreen('c', [offScreen], { enabled: false }),
    ]);
    expect(picked.map((p) => p.mod.id)).toEqual([low.id, high.id]);
    expect(picked.map((p) => p.screenId)).toEqual(['b', 'a']);
  });
});

describe('PinnedModuleLayer', () => {
  it('renders nothing when no module is pinned', () => {
    const { container } = render(layer([makeTestScreen('a', [makeModule({ showOnEveryScreen: undefined })])]));
    expect(container.innerHTML).toBe('');
  });

  it('draws a pinned module at its home box with the canvas geometry', () => {
    const mod = makeModule({ position: { x: 180, y: 1700 }, size: { w: 720, h: 140 } });
    const { getByTestId } = render(layer([makeTestScreen('a', [mod])]));
    const outer = getByTestId('pinned-layer');
    expect(outer.style.pointerEvents).toBe('none');
    expect(outer.style.paddingTop).toBe('12px');
    const box = outer.querySelector(`[data-module-id="${mod.id}"]`) as HTMLElement;
    expect(box.style.left).toBe('180px');
    expect(box.style.top).toBe('1700px');
    expect(box.style.width).toBe('720px');
    expect(box.style.pointerEvents).toBe('auto');
    expect(box.dataset.pinned).toBe('true');
  });

  it('keeps the module mounted when the screens prop changes under it', () => {
    const mod = makeModule({});
    const screensA = [makeTestScreen('a', [mod]), makeTestScreen('b', [])];
    const { rerender, getAllByTestId } = render(layer(screensA));
    expect(getAllByTestId('probe')).toHaveLength(1);
    expect(mounts).toBe(1);
    // A fresh array with the same module (what a config poll hands down).
    rerender(layer([makeTestScreen('a', [mod]), makeTestScreen('b', [makeModule({ showOnEveryScreen: undefined })])]));
    expect(getAllByTestId('probe')).toHaveLength(1);
    expect(mounts).toBe(1);
  });

  it('swaps a plugin placeholder for the module once the plugin registers', () => {
    const mod = makeModule({ type: 'plugin:late' as ModuleInstance['type'] });
    const { queryAllByTestId, getByText } = render(layer([makeTestScreen('a', [mod])]));
    expect(queryAllByTestId('probe')).toHaveLength(0);
    expect(getByText(/not available/i)).toBeTruthy();
    lateLoaded = true;
    // Registration is what the layer must wake on, nothing else re-renders it.
    act(() => {
      usePluginStore.setState({ plugins: new Map([['plugin:late', {} as never]]) });
    });
    expect(queryAllByTestId('probe')).toHaveLength(1);
  });

  it('honours the module gates: a switched-off module is not drawn', () => {
    const { queryAllByTestId } = render(layer([makeTestScreen('a', [makeModule({ enabled: false })])]));
    expect(queryAllByTestId('probe')).toHaveLength(0);
  });

  it('hides a module whose condition is not met', () => {
    const gated = makeModule({
      visibility: { conditions: [{ kind: 'state', sourceKey: 'plugin:ha:door', equals: 'open' }], whenUnknown: 'hide' },
    });
    const { queryAllByTestId } = render(layer([makeTestScreen('a', [gated])]));
    expect(queryAllByTestId('probe')).toHaveLength(0);
  });
});
