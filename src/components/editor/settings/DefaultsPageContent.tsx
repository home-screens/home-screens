'use client';

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useTranslate } from '@/i18n';
import { useEditorStore } from '@/stores/editor-store';
import ScreenSection from '@/components/editor/settings/ScreenSection';
import LocationSection from '@/components/editor/settings/LocationSection';
import LanguageFields from '@/components/editor/settings/LanguageFields';
import TimeFormatFields from '@/components/editor/settings/TimeFormatFields';
import WeatherSection from '@/components/editor/settings/WeatherSection';
import IntegrationsSection from '@/components/editor/settings/IntegrationsSection';
import CalendarSection from '@/components/editor/settings/CalendarSection';
import MealsSection from '@/components/editor/settings/MealsSection';
import AutomationSection from '@/components/editor/settings/AutomationSection';
import SystemSection from '@/components/editor/settings/SystemSection';
import NetworkSection from '@/components/editor/settings/NetworkSection';
import SecuritySection from '@/components/editor/settings/SecuritySection';
import StatsSection from '@/components/editor/settings/StatsSection';
import DataSection from '@/components/editor/settings/DataSection';
import type { DefaultPageId, SettingsPanelId } from '@/lib/settings-route';
import {
  toFormState,
  type DisplayState,
  type SettingsState,
  type WeatherState,
} from '@/lib/settings-form';
import type { UpdateSettingsGroup } from '@/hooks/useSettingsAutosave';
import type { ScreenConfiguration } from '@/types/config';

interface DefaultsPageContentProps {
  page: DefaultPageId;
  /** Intra-page tab for the tabbed pages (Screen, Automation). */
  panel: SettingsPanelId | undefined;
  config: ScreenConfiguration | null;
  state: SettingsState;
  setState: Dispatch<SetStateAction<SettingsState>>;
  updateGroup: UpdateSettingsGroup;
  /** Dimension writer that routes shrinking edits through the orientation guard. */
  onDisplayChange: (updates: Partial<DisplayState>) => void;
  onUpgrade: (tag: string, currentVersion: string | null) => void;
  onRollback: (tag: string, currentVersion: string | null) => void;
}

/**
 * The Defaults half of the settings content pane: one source-of-truth page
 * per shared value, picked by the page id the URL resolved to.
 */
export default function DefaultsPageContent({
  page,
  panel,
  config,
  state,
  setState,
  updateGroup,
  onDisplayChange,
  onUpgrade,
  onRollback,
}: DefaultsPageContentProps) {
  const t = useTranslate('editor');

  /**
   * Content for every Defaults page, keyed by page id.
   *
   * Typed as a total `Record<DefaultPageId, ReactNode>` on purpose: adding an
   * id to `DEFAULT_PAGE_IDS` without adding content here is now a build
   * failure rather than a page that renders an empty pane with no clue why.
   */
  const PAGE_CONTENT: Record<DefaultPageId, ReactNode> = {
    screen: config ? (
      <ScreenSection
        config={config}
        panel={panel}
        displayValues={state.display}
        sleepValues={state.sleep}
        alertValues={state.alerts}
        onDisplayChange={onDisplayChange}
        onSleepChange={(updates) => updateGroup('sleep', updates)}
        onAlertsChange={(updates) => updateGroup('alerts', updates)}
      />
    ) : null,

    automation: <AutomationSection panel={panel} />,

    location: (
      <>
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-1">
            {t('settings.locationAndLanguagePage.breadcrumb')}
          </div>
          <h1 className="text-xl font-semibold text-hs-text-primary">
            {t('settings.locationAndLanguagePage.title')}
          </h1>
          <p className="text-sm text-hs-text-faint mt-1">
            {t('settings.locationAndLanguagePage.description')}
          </p>
        </div>
        <LanguageFields />
        <div className="mt-6">
          <TimeFormatFields />
        </div>
        <div className="mt-6">
          <LocationSection
            values={state.location}
            onChange={(updates) => updateGroup('location', updates)}
          />
        </div>
      </>
    ),

    weather: (
      <WeatherSection
        values={{
          ...state.weather,
          lat: state.location.lat,
          lon: state.location.lon,
        }}
        onChange={(updates) => {
          const { lat, lon, ...weatherUpdates } = updates as Partial<WeatherState & { lat: string; lon: string }>;
          if (lat !== undefined || lon !== undefined) {
            updateGroup('location', { ...(lat !== undefined && { lat }), ...(lon !== undefined && { lon }) });
          }
          if (Object.keys(weatherUpdates).length > 0) {
            updateGroup('weather', weatherUpdates);
          }
        }}
      />
    ),

    calendar: (
      <CalendarSection
        values={{
          ...state.calendar,
          holidayCountry: state.calendar.holidayCountry || undefined,
        }}
        onChange={(updates) => updateGroup('calendar', updates)}
      />
    ),

    meals: <MealsSection />,

    integrations: <IntegrationsSection />,

    security: <SecuritySection />,

    data: (
      <DataSection
        onSettingsImported={() => {
          const imported = useEditorStore.getState().config?.settings;
          setState(toFormState(imported));
        }}
      />
    ),

    stats: <StatsSection />,

    system: <SystemSection onUpgrade={onUpgrade} onRollback={onRollback} />,

    network: <NetworkSection />,
  };

  return (
    <div className={`mx-auto px-6 py-6 ${
      page === 'stats'
        ? 'max-w-6xl'
        : page === 'integrations'
          ? 'max-w-4xl'
          : 'max-w-2xl'
    }`}>
      {/* Keyed off a Record<DefaultPageId, ReactNode> rather than a chain
          of `page === 'x' &&` branches. A live page id with no content
          branch used to render a silently empty pane; now a missing entry
          is a compile error, which matters because this list churned twice
          during the settings reorg. */}
      {PAGE_CONTENT[page]}
    </div>
  );
}
