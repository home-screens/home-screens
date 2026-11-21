// @vitest-environment jsdom

/**
 * Tests for the root-resident layer that keeps `backgroundProvider: true`
 * instances mounted across rotation — the feature's core guarantee. The
 * module component is mocked with a probe so mounts are observable without
 * pulling in real module implementations.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { Screen, ModuleInstance } from '@/types/config';
import type { DisplaySettings } from '../useLiveConfig';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { SharedDisplayData } from '@/lib/module-props';
import BackgroundProviderLayer from '../BackgroundProviderLayer';
import { emptyWeatherPayloads } from '@/lib/weather-providers';

vi.mock('@/lib/module-components', () => ({
  getModuleComponent: (type: string) => {
    if (type === 'plugin:unloaded') return undefined;
    if (type === 'plugin:throws') {
      return () => {
        throw new Error('provider crashed while drawing');
      };
    }
    const Probe = ({ config }: { config: Record<string, unknown> }) => (
      <div data-testid="probe" data-config={JSON.stringify(config)} />
    );
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
    type: 'plugin:test-widget' as ModuleInstance['type'],
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 0,
    config: {},
    style: { ...DEFAULT_MODULE_STYLE },
    backgroundProvider: true,
    ...overrides,
  };
}

function makeScreen(id: string, modules: ModuleInstance[]): Screen {
  return { id, name: id, backgroundImage: '', modules };
}

function renderLayer(screens: Screen[]) {
  return render(
    <BackgroundProviderLayer screens={screens} settings={settings} sharedData={sharedData} />,
  );
}

afterEach(() => {
  cleanup();
});

describe('BackgroundProviderLayer', () => {
  it('renders nothing when no screen has a background provider', () => {
    const { container } = renderLayer([
      makeScreen('a', [makeModule({ backgroundProvider: undefined })]),
    ]);
    expect(container.innerHTML).toBe('');
  });

  it('mounts providers from ALL screens, not just the current one', () => {
    const { getAllByTestId } = renderLayer([
      makeScreen('a', [makeModule({ config: { entity: 'door' } })]),
      makeScreen('b', [makeModule({ config: { entity: 'temp' } })]),
    ]);
    expect(getAllByTestId('probe')).toHaveLength(2);
  });

  it('skips instances disabled via enabled === false', () => {
    const { queryAllByTestId } = renderLayer([
      makeScreen('a', [makeModule({ enabled: false })]),
    ]);
    expect(queryAllByTestId('probe')).toHaveLength(0);
  });

  it('dedupes same type + same config across screens to one mount', () => {
    const { getAllByTestId } = renderLayer([
      makeScreen('a', [makeModule({ config: { entity: 'door' } })]),
      makeScreen('b', [makeModule({ config: { entity: 'door' } })]),
    ]);
    expect(getAllByTestId('probe')).toHaveLength(1);
  });

  it('dedupes key-order-permuted but semantically equal configs', () => {
    const { getAllByTestId } = renderLayer([
      makeScreen('a', [makeModule({ config: { a: 1, b: { x: 1, y: 2 } } })]),
      makeScreen('b', [makeModule({ config: { b: { y: 2, x: 1 }, a: 1 } })]),
    ]);
    expect(getAllByTestId('probe')).toHaveLength(1);
  });

  it('mounts BOTH instances when configs genuinely differ', () => {
    const { getAllByTestId } = renderLayer([
      makeScreen('a', [
        makeModule({ config: { entity: 'door' } }),
        makeModule({ config: { entity: 'temp' } }),
      ]),
    ]);
    expect(getAllByTestId('probe')).toHaveLength(2);
  });

  it('skips an unloaded plugin type without crashing', () => {
    const { getAllByTestId } = renderLayer([
      makeScreen('a', [
        makeModule({ type: 'plugin:unloaded' as ModuleInstance['type'] }),
        makeModule({ config: { entity: 'door' } }),
      ]),
    ]);
    expect(getAllByTestId('probe')).toHaveLength(1);
  });

  it('hides the layer from assistive tech and layout', () => {
    const { container } = renderLayer([
      makeScreen('a', [makeModule({})]),
    ]);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
    expect(wrapper.style.width).toBe('0px');
    expect(wrapper.style.height).toBe('0px');
  });

  // Nothing else sits between a background provider and the wall's own error
  // page: one that throws while drawing must fail alone.
  it('keeps the other providers running when one throws while drawing', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getAllByTestId } = renderLayer([
      makeScreen('a', [
        makeModule({ type: 'plugin:throws' as ModuleInstance['type'] }),
        makeModule({ config: { n: 1 } }),
      ]),
    ]);
    expect(getAllByTestId('probe')).toHaveLength(1);
    quiet.mockRestore();
  });
});
