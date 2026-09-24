// @vitest-environment jsdom

/**
 * `__HS_SDK__.formatDate` is the helper plugin authors reach for, because it
 * follows the household's language. It must also follow the household's
 * clock: date-fns reads a Date's local getters, which on a kiosk are the Pi's
 * own zone (UTC on a stock image), so a 6:10 PM Chicago run used to print
 * "23:10". `wallClock` gives plugins the same household reading as numbers.
 *
 * Run under a process zone that is not Chicago (UTC, Berlin) to see the bug.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import PluginGlobals from '@/components/PluginGlobals';
import { getHostSettings, setHostSettings } from '@/lib/plugin-host-settings';

function sdk() {
  const s = window.__HS_SDK__;
  if (!s) throw new Error('__HS_SDK__ was not installed by PluginGlobals');
  return s;
}

// 6:10 PM CDT on 2026-09-22 is 23:10 UTC the same day.
const RUN_END = new Date('2026-09-22T23:10:00Z');

describe('__HS_SDK__ time helpers follow the household zone', () => {
  const original = getHostSettings();

  beforeEach(async () => {
    __resetLoaderForTests();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ core: {} }), { status: 200 }),
    );
    setHostSettings({ ...original, timezone: 'America/Chicago' });
    await act(async () => {
      render(
        <I18nProvider locale="en-US" blob={{}}>
          <PluginGlobals />
        </I18nProvider>,
      );
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    setHostSettings(original);
    delete window.__HS_SDK__;
  });

  it('formatDate prints the household wall time, not the kiosk zone', () => {
    expect(sdk().formatDate(RUN_END, 'HH:mm')).toBe('18:10');
    expect(sdk().formatDate(RUN_END.getTime(), 'yyyy-MM-dd h:mm a')).toBe('2026-09-22 6:10 PM');
  });

  it('formatDate buckets a late-evening run on the household day', () => {
    // 01:30 UTC on the 23rd is still the 22nd in Chicago.
    expect(sdk().formatDate(new Date('2026-09-23T01:30:00Z'), 'yyyy-MM-dd')).toBe('2026-09-22');
  });

  it('wallClock reads the household day and minute', () => {
    expect(sdk().wallClock(RUN_END)).toEqual({ dayOfWeek: 2, minuteOfDay: 18 * 60 + 10, isoDate: '2026-09-22' });
  });

  it('follows a host settings change without reinstalling the SDK', () => {
    setHostSettings({ ...getHostSettings(), timezone: 'Europe/Berlin' });
    expect(sdk().formatDate(RUN_END, 'HH:mm')).toBe('01:10');
    expect(sdk().wallClock(RUN_END).isoDate).toBe('2026-09-23');
  });
});
