// @vitest-environment jsdom

/**
 * With no zone saved, the editor evaluates in the hub's zone, the one the wall
 * and the phone run on, and never in this laptop's. It used to fall back to
 * the laptop: a Chicago laptop said "12:43 PM" and "It is showing right now"
 * while a UTC wall said "5:43 PM" and had already hidden the module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEditorStore } from '@/stores/editor-store';
import { HUB_TIMEZONE_HEADER } from '@/lib/timezone';
import type { ScreenConfiguration } from '@/types/config';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (url: string, init?: RequestInit) => mocks.fetch(url, init),
  isSessionExpired: () => false,
  throwIfNotOk: () => {},
}));

import { useEditorHouseholdToday, useEditorHouseholdZone } from '../useEditorHouseholdClock';

// 00:30 on Monday 21 September in Auckland is still Sunday the 20th in UTC and
// in Chicago, so a laptop in either zone disagrees with an Auckland hub.
const AUCKLAND_MONDAY = new Date('2026-09-20T12:30:00Z');

function configWith(timezone?: string): ScreenConfiguration {
  return { screens: [], settings: { ...(timezone ? { timezone } : {}) } } as unknown as ScreenConfiguration;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AUCKLAND_MONDAY);
});

afterEach(() => {
  vi.useRealTimers();
  mocks.fetch.mockReset();
  useEditorStore.setState({ config: null, hubTimezone: null });
});

describe('the editor household zone', () => {
  it("is the hub's while none is saved, and says so", () => {
    useEditorStore.setState({ config: configWith(), hubTimezone: 'Pacific/Auckland' });
    const { result } = renderHook(() => ({ zone: useEditorHouseholdZone(), today: useEditorHouseholdToday() }));
    expect(result.current.zone).toEqual({ timezone: 'Pacific/Auckland', saved: false });
    expect(result.current.today).toBe('2026-09-21');
  });

  it('is the saved zone once there is one', () => {
    useEditorStore.setState({ config: configWith('America/Chicago'), hubTimezone: 'Pacific/Auckland' });
    const { result } = renderHook(() => ({ zone: useEditorHouseholdZone(), today: useEditorHouseholdToday() }));
    expect(result.current.zone).toEqual({ timezone: 'America/Chicago', saved: true });
    expect(result.current.today).toBe('2026-09-20');
  });

  it('is unknown before the config has loaded', () => {
    useEditorStore.setState({ config: null, hubTimezone: 'Pacific/Auckland' });
    const { result } = renderHook(() => useEditorHouseholdZone());
    expect(result.current).toBeNull();
  });

  it("takes the hub's zone from the config response, and keeps it out of the config", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ [HUB_TIMEZONE_HEADER]: 'Pacific/Auckland' }),
      json: async () => configWith(),
    });
    await act(async () => { await useEditorStore.getState().loadConfig(); });
    const state = useEditorStore.getState();
    expect(state.hubTimezone).toBe('Pacific/Auckland');
    expect(state.config?.settings).not.toHaveProperty('timezone');
  });
});
