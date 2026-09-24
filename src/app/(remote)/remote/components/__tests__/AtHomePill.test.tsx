// @vitest-environment jsdom

/**
 * A parent in Berlin on Thursday evening sees Friday on the chore chart of a
 * home that is already there. The phone says what time it is at home while
 * its own day or hour differs, and stays quiet on a phone at home.
 */

import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';
import { isoDateInTZ } from '@/lib/timezone';
import type { TimeFormat } from '@/types/config';
import { HouseholdClockProvider } from '../../household-clock';

const viewer = vi.hoisted(() => ({ zone: null as string | null }));
vi.mock('@/hooks/useViewerTimezone', () => ({ useViewerTimezone: () => viewer.zone }));

import AtHomePill from '../AtHomePill';

// Thursday 7:40 PM in Berlin is Friday 7:40 AM in Kiritimati.
const THURSDAY_EVENING_BERLIN = new Date('2026-09-24T17:40:00Z');

function renderAt(home: string, timeFormat: TimeFormat = '12h') {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nProvider locale="en-US" blob={{ core, remote }}>
        <HouseholdClockProvider timezone={home} today={isoDateInTZ(new Date(), home)} timeFormat={timeFormat}>
          {children}
        </HouseholdClockProvider>
      </I18nProvider>
    );
  }
  render(<AtHomePill />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(THURSDAY_EVENING_BERLIN);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  viewer.zone = null;
});

describe('the at home line', () => {
  it("says home's day and time when the phone is on another day", () => {
    viewer.zone = 'Europe/Berlin';
    renderAt('Pacific/Kiritimati');
    expect(screen.getByTestId('at-home-pill').textContent).toMatch(/^It's Friday, 7:40\sAM at home$/);
  });

  it("uses the household's 24-hour clock", () => {
    viewer.zone = 'Europe/Berlin';
    renderAt('Pacific/Kiritimati', '24h');
    expect(screen.getByTestId('at-home-pill').textContent).toBe("It's Friday, 07:40 at home");
  });

  it('shows on the same day at a different hour', () => {
    viewer.zone = 'Europe/Berlin';
    renderAt('America/Chicago');
    expect(screen.getByTestId('at-home-pill').textContent).toMatch(/^It's Thursday, 12:40\sPM at home$/);
  });

  it('stays hidden on a phone at home', () => {
    viewer.zone = 'America/Chicago';
    renderAt('America/Chicago');
    expect(screen.queryByTestId('at-home-pill')).toBeNull();
  });

  it('stays hidden while the page is drawn on the hub', () => {
    renderAt('Pacific/Kiritimati');
    expect(screen.queryByTestId('at-home-pill')).toBeNull();
  });
});
