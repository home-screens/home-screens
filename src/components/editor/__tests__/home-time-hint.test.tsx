// @vitest-environment jsdom

/**
 * A parent on a laptop in Los Angeles types 7:00 into a schedule for a home in
 * Chicago. Every time field that means home time says so while the two zones
 * differ, and says nothing when they match. With no zone saved yet the
 * editor says so above the canvas instead.
 */

import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import modules from '@/translations/en-US/modules.json';
import { I18nProvider } from '@/i18n/provider';
import { useEditorStore } from '@/stores/editor-store';
import type { ScreenConfiguration, TimeFormat } from '@/types/config';

const viewer = vi.hoisted(() => ({ zone: null as string | null }));
vi.mock('@/hooks/useViewerTimezone', () => ({ useViewerTimezone: () => viewer.zone }));

import HomeTimeHint from '../HomeTimeHint';
import { ScheduleEditor } from '../ScheduleEditor';
import NoTimezoneBanner from '@/components/NoTimezoneBanner';
import { useEditorHouseholdZone } from '../useEditorHouseholdClock';

// 12:46 PM in Chicago, 10:46 AM in Los Angeles, 5:46 PM UTC.
const NOW = new Date('2026-09-24T17:46:00Z');

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ core, editor, modules }}>{children}</I18nProvider>;
}

function household(timezone: string | undefined, timeFormat: TimeFormat = '12h') {
  useEditorStore.setState({
    config: { screens: [], settings: { ...(timezone ? { timezone } : {}), timeFormat } } as unknown as ScreenConfiguration,
    hubTimezone: 'UTC',
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  viewer.zone = null;
  useEditorStore.setState({ config: null, hubTimezone: null });
});

describe('the home time hint', () => {
  it('names home and its time when this computer is elsewhere', () => {
    household('America/Chicago');
    viewer.zone = 'America/Los_Angeles';
    render(<HomeTimeHint />, { wrapper: Wrapper });
    expect(screen.getByTestId('home-time-hint').textContent).toContain('Home time (Chicago). It is 12:46 PM at home.');
  });

  it("uses the household's 24-hour clock", () => {
    household('America/Chicago', '24h');
    viewer.zone = 'America/Los_Angeles';
    render(<HomeTimeHint />, { wrapper: Wrapper });
    expect(screen.getByTestId('home-time-hint').textContent).toContain('It is 12:46 at home.');
  });

  it('says nothing when this computer is at home, alias spellings included', () => {
    household('Asia/Kolkata');
    viewer.zone = 'Asia/Calcutta';
    render(<HomeTimeHint />, { wrapper: Wrapper });
    expect(screen.queryByTestId('home-time-hint')).toBeNull();
  });

  it('says nothing before the browser zone is known', () => {
    household('America/Chicago');
    render(<HomeTimeHint />, { wrapper: Wrapper });
    expect(screen.queryByTestId('home-time-hint')).toBeNull();
  });

  it("with no zone saved, names the hub's zone, which the screens run on", () => {
    household(undefined);
    viewer.zone = 'America/Chicago';
    render(<HomeTimeHint />, { wrapper: Wrapper });
    expect(screen.getByTestId('home-time-hint').textContent).toContain('Home time (UTC). It is 5:46 PM at home.');
  });

  it('sits under the From and Until fields of a schedule', () => {
    household('America/Chicago');
    viewer.zone = 'America/Los_Angeles';
    render(<ScheduleEditor schedule={{ startTime: '07:00', endTime: '13:00' }} onChange={() => {}} />, { wrapper: Wrapper });
    expect(screen.getByTestId('home-time-hint')).toBeTruthy();
  });
});

describe('the no time zone banner', () => {
  function Banner() {
    return <NoTimezoneBanner zone={useEditorHouseholdZone()} />;
  }

  it("shows while no zone is saved, naming the hub's clock and linking to the picker", () => {
    household(undefined);
    render(<Banner />, { wrapper: Wrapper });
    const banner = screen.getByTestId('no-timezone-banner');
    expect(banner.textContent).toContain("No time zone yet. Your screens use the hub's clock (UTC), so times can be off.");
    const link = screen.getByRole('link', { name: 'Pick time zone' });
    expect(link.getAttribute('href')).toBe('/editor/settings?section=defaults&page=location&highlight=location.timezone');
  });

  it('is gone once a zone is saved', () => {
    household('America/Chicago');
    render(<Banner />, { wrapper: Wrapper });
    expect(screen.queryByTestId('no-timezone-banner')).toBeNull();
  });

  it('shows nothing while the config is loading', () => {
    render(<Banner />, { wrapper: Wrapper });
    expect(screen.queryByTestId('no-timezone-banner')).toBeNull();
  });
});
