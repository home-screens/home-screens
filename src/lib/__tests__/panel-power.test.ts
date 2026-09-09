import { describe, it, expect } from 'vitest';
import {
  computePanelPower,
  resolvePanelPowerEnabled,
  PANEL_POWER_HEARTBEAT_FRESH_MS,
} from '@/lib/panel-power';
import type { ScreenConfiguration } from '@/types/config';

const NOW = 1_800_000_000_000;

describe('computePanelPower', () => {
  const asleepFresh = { enabled: true, displayState: 'asleep' as const, browserSeen: NOW - 5_000, now: NOW };

  it('cuts power only when opted in, asleep, and the heartbeat is fresh', () => {
    expect(computePanelPower(asleepFresh)).toBe('off');
  });

  it('keeps the panel on while the setting is off', () => {
    expect(computePanelPower({ ...asleepFresh, enabled: false })).toBe('on');
  });

  it('keeps the panel on while dimmed or active', () => {
    // The screensaver and dimmed content are meant to be seen.
    expect(computePanelPower({ ...asleepFresh, displayState: 'dimmed' })).toBe('on');
    expect(computePanelPower({ ...asleepFresh, displayState: 'active' })).toBe('on');
  });

  it('keeps the panel on when the display has never reported', () => {
    expect(computePanelPower({ ...asleepFresh, displayState: null, browserSeen: null })).toBe('on');
    expect(computePanelPower({ ...asleepFresh, browserSeen: undefined })).toBe('on');
  });

  it('brings the panel back once the browser heartbeat goes stale', () => {
    // A dead browser tab must not leave a black panel nobody can diagnose.
    const stale = NOW - PANEL_POWER_HEARTBEAT_FRESH_MS - 1;
    expect(computePanelPower({ ...asleepFresh, browserSeen: stale })).toBe('on');
    const edge = NOW - PANEL_POWER_HEARTBEAT_FRESH_MS;
    expect(computePanelPower({ ...asleepFresh, browserSeen: edge })).toBe('off');
  });
});

describe('resolvePanelPowerEnabled', () => {
  function config(overrides: Partial<ScreenConfiguration>): ScreenConfiguration {
    return { screens: [], settings: {}, ...overrides } as unknown as ScreenConfiguration;
  }

  it('is off by default and off while sleep itself is disabled', () => {
    expect(resolvePanelPowerEnabled(config({}), 'main')).toBe(false);
    expect(
      resolvePanelPowerEnabled(
        config({ settings: { sleep: { enabled: false, panelPowerOff: true } } } as never),
        'main',
      ),
    ).toBe(false);
  });

  it('reads the global sleep block for a display without its own', () => {
    const c = config({
      settings: { sleep: { enabled: true, panelPowerOff: true } },
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [] }],
    } as never);
    expect(resolvePanelPowerEnabled(c, 'kitchen')).toBe(true);
  });

  it('reads a per-display sleep block on its own terms, not layered over the global one', () => {
    const c = config({
      settings: { sleep: { enabled: true, panelPowerOff: true } },
      displays: [
        { id: 'kitchen', name: 'Kitchen', screens: [], settings: { sleep: { enabled: true } } },
        { id: 'hall', name: 'Hall', screens: [], settings: { sleep: { enabled: true, panelPowerOff: true } } },
      ],
    } as never);
    expect(resolvePanelPowerEnabled(c, 'kitchen')).toBe(false);
    expect(resolvePanelPowerEnabled(c, 'hall')).toBe(true);
  });
});
