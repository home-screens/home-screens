// @vitest-environment jsdom

/**
 * Dates the editor's settings pages print about things that already happened
 * (a network last joined, a beacon sent, a release, an exported layout) and the
 * name of the diagnostics download. All of them are real instants, and all of
 * them are shown on the household's calendar and clock in its formatting
 * locale, not the laptop's zone and browser language or UTC.
 *
 * The instant used throughout is 9:30 PM on Thursday September 3 in Chicago,
 * which is already September 4 in UTC and anywhere further east.
 */

import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import { I18nProvider } from '@/i18n/provider';
import type { TranslateFn } from '@/i18n';
import { useEditorStore } from '@/stores/editor-store';
import type { ScreenConfiguration } from '@/types/config';
import type { SystemStats } from '@/lib/system-stats-types';
import type { LayoutExport } from '@/types/layout-export';
import { formatLastUsed } from '../network/SavedNetworksSection';
import { diagnosticsFileName } from '../StatsSection/fetchers';
import { TelemetryCard } from '../StatsSection/TelemetryCard';
import ChangelogModal from '../ChangelogModal';
import LayoutImportModal from '../../LayoutImportModal';

const EVENING_IN_CHICAGO = '2026-09-04T02:30:00.000Z';

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ core, editor }}>{children}</I18nProvider>;
}

beforeEach(() => {
  useEditorStore.setState({
    config: {
      screens: [],
      settings: { timezone: 'America/Chicago', timeFormat: '12h' },
    } as unknown as ScreenConfiguration,
  });
});

afterEach(() => {
  cleanup();
  useEditorStore.setState({ config: null });
});

describe('saved Wi-Fi "Last used"', () => {
  const t = ((key: string, vars?: Record<string, string>) => (vars ? `${key}:${vars.date}` : key)) as TranslateFn;

  it("is the household's day", () => {
    expect(formatLastUsed(EVENING_IN_CHICAGO, t, 'en-US', 'America/Chicago')).toBe(
      'settings.networkPage.savedNetworks.lastUsed:Sep 3, 2026',
    );
  });

  it('follows the formatting locale', () => {
    expect(formatLastUsed(EVENING_IN_CHICAGO, t, 'de-DE', 'America/Chicago')).toBe(
      'settings.networkPage.savedNetworks.lastUsed:3. Sept. 2026',
    );
  });
});

describe('diagnostics download name', () => {
  it("is stamped with the household's day and time, not UTC's", () => {
    expect(diagnosticsFileName('America/Chicago', new Date(EVENING_IN_CHICAGO))).toBe(
      'home-screens-diagnostics-2026-09-03-2130.zip',
    );
    expect(diagnosticsFileName('Asia/Kolkata', new Date(EVENING_IN_CHICAGO))).toBe(
      'home-screens-diagnostics-2026-09-04-0800.zip',
    );
  });
});

describe('Status "Last beacon"', () => {
  it("is the household's date and clock", () => {
    const stats = { telemetry: { installId: null, lastBeaconAt: EVENING_IN_CHICAGO, enabled: true } } as unknown as SystemStats;
    render(<TelemetryCard stats={stats} telemetryOn isSaving={false} onToggle={() => {}} />, { wrapper: Wrapper });
    expect(screen.getByText(/^Sep 3, 2026, 9:30\sPM$/)).toBeTruthy();
  });
});

describe('release dates', () => {
  it("are the household's day", () => {
    render(
      <ChangelogModal
        release={{ tag: 'v1.0.0', name: 'v1.0.0', body: '', published: EVENING_IN_CHICAGO, url: 'https://example.com' }}
        onClose={() => {}}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText('September 3, 2026')).toBeTruthy();
  });
});

describe('an imported layout\'s "Saved" date', () => {
  it("is the household's day", () => {
    const layout = {
      _type: 'home-screens-layout',
      _version: 1,
      metadata: {
        name: 'Kitchen',
        exportedAt: EVENING_IN_CHICAGO,
        configVersion: 1,
        sourceDisplay: { width: 1080, height: 1920 },
        screenCount: 1,
        moduleCount: 1,
      },
      visual: { rotationIntervalMs: 30_000 },
      screens: [],
    } as unknown as LayoutExport;
    render(<LayoutImportModal layout={layout} onClose={() => {}} />, { wrapper: Wrapper });
    expect(screen.getByText(/Sep 3, 2026/)).toBeTruthy();
    expect(screen.queryByText(/Sep 4, 2026/)).toBeNull();
  });
});
