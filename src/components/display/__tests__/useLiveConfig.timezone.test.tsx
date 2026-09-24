// @vitest-environment jsdom

/**
 * With no zone saved, a display runs on the hub's zone, not the kiosk's own.
 * The hub keeps chore days, to-do resets and the phone on its clock, so a UTC
 * kiosk that fell back to itself showed "5:43 PM" and Friday next to a chore
 * chart on Thursday afternoon.
 *
 * The server render and the first client render must also agree on that zone:
 * the server used to render in its own zone and the kiosk re-rendered in its
 * own, which is React's #418 hydration error on every load of `/display`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import type { GlobalSettings, ScreenConfiguration } from '@/types/config';
import { HUB_TIMEZONE_HEADER, wallClockParts } from '@/lib/timezone';
import { useWallClock } from '@/hooks/useTZClock';
import { useLiveConfig } from '../useLiveConfig';

let configBody = '';
let hubHeader: string | null = null;
let pollsAnswer = true;

vi.mock('@/stores/plugin-store', () => ({
  usePluginStore: { getState: () => ({ loadPlugins: vi.fn(), setPluginSettingsMap: vi.fn(), pluginSettings: new Map() }) },
}));

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: async (url: string) => {
    if (!pollsAnswer) return new Promise(() => {});
    if (url === '/api/system/build-id') return { ok: true, text: async () => 'build-1' };
    if (url === '/api/config') {
      return {
        ok: true,
        text: async () => configBody,
        headers: new Headers(hubHeader ? { [HUB_TIMEZONE_HEADER]: hubHeader } : {}),
      };
    }
    if (url === '/api/plugins/installed') return { ok: true, json: async () => ({ pluginHash: '', plugins: [] }) };
    throw new Error(`unexpected fetch: ${url}`);
  },
}));

function makeConfig(timezone?: string): ScreenConfiguration {
  return {
    screens: [{ id: 's1', name: 'S1', backgroundImage: '', modules: [] }],
    settings: { rotationIntervalMs: 5_000, ...(timezone ? { timezone } : {}) } as unknown as GlobalSettings,
  } as unknown as ScreenConfiguration;
}

// Neither is the zone this test process runs in (UTC or America/Chicago).
const HUB = 'Pacific/Kiritimati';
const OTHER_HUB = 'Asia/Kathmandu';

describe('useLiveConfig resolves an unset zone to the hub', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hubHeader = null;
    pollsAnswer = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts on the hub's zone from the server render, not the kiosk's", () => {
    pollsAnswer = false;
    const initial = makeConfig();
    const { result } = renderHook(() => useLiveConfig(initial.screens, initial.settings, HUB));
    expect(result.current.settings.timezone).toBe(HUB);
    expect(result.current.timezoneSaved).toBe(false);
  });

  it('keeps a saved zone over the hub', () => {
    pollsAnswer = false;
    const initial = makeConfig('America/Chicago');
    const { result } = renderHook(() => useLiveConfig(initial.screens, initial.settings, HUB));
    expect(result.current.settings.timezone).toBe('America/Chicago');
    expect(result.current.timezoneSaved).toBe(true);
  });

  it("follows the hub's zone named by each config poll", async () => {
    const initial = makeConfig();
    configBody = JSON.stringify(initial);
    hubHeader = HUB;
    const { result } = renderHook(() => useLiveConfig(initial.screens, initial.settings, HUB));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.settings.timezone).toBe(HUB);

    // The hub's clock moved (the Location page's device-clock button) while
    // the config bytes stayed the same: the display must still pick it up.
    hubHeader = OTHER_HUB;
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(result.current.settings.timezone).toBe(OTHER_HUB);

    // Saving a zone wins over the hub's.
    configBody = JSON.stringify(makeConfig('Europe/Berlin'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(result.current.settings.timezone).toBe('Europe/Berlin');
    expect(result.current.timezoneSaved).toBe(true);
  });

  it('keeps the server-rendered hub zone when a poll names none', async () => {
    const initial = makeConfig();
    configBody = JSON.stringify(initial);
    const { result } = renderHook(() => useLiveConfig(initial.screens, initial.settings, HUB));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.settings.timezone).toBe(HUB);
  });
});

describe('the display hydrates without a mismatch while no zone is saved', () => {
  const originalTZ = process.env.TZ;

  beforeEach(() => { pollsAnswer = false; });

  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  /** The hour a display shows, read the way ScreenRenderer schedules modules. */
  function HourProbe({ settings }: { settings: GlobalSettings }) {
    const live = useLiveConfig([], settings, HUB);
    const now = useWallClock(live.settings.timezone);
    return <span>{`${live.settings.timezone} ${Math.floor(now.minuteOfDay / 60)}`}</span>;
  }

  /** The same reading with the saved zone taken as is: what the display did before. */
  function MachineZoneProbe({ settings }: { settings: GlobalSettings }) {
    const now = useWallClock(settings.timezone);
    return <span>{Math.floor(now.minuteOfDay / 60)}</span>;
  }

  async function hydrateAcrossZones(node: React.ReactElement) {
    process.env.TZ = HUB;
    const html = renderToString(node);
    process.env.TZ = 'UTC';
    const container = document.createElement('div');
    container.innerHTML = html;
    const recoverable = vi.fn();
    await act(async () => {
      hydrateRoot(container, node, { onRecoverableError: recoverable });
    });
    return recoverable;
  }

  it("mismatches when each machine reads its own zone (the harness sees #418)", async () => {
    const recoverable = await hydrateAcrossZones(<MachineZoneProbe settings={makeConfig().settings} />);
    expect(recoverable).toHaveBeenCalled();
  });

  it('renders the same hour on the hub and on a kiosk in another zone', async () => {
    // The hub renders the page in its own zone and a UTC kiosk hydrates it.
    // Before the hub's zone was handed down, the kiosk's first render used its
    // own zone and React threw #418.
    const recoverable = await hydrateAcrossZones(<HourProbe settings={makeConfig().settings} />);
    expect(recoverable).not.toHaveBeenCalled();
  });

  it("shows the hub's hour on the kiosk", () => {
    process.env.TZ = 'UTC';
    const html = renderToString(<HourProbe settings={makeConfig().settings} />);
    expect(html).toContain(`${HUB} ${Math.floor(wallClockParts(new Date(), HUB).minuteOfDay / 60)}`);
  });
});
