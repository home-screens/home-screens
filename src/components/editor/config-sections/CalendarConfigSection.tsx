'use client';

import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useEditorStore } from '@/stores/editor-store';
import { isGridView } from '@/lib/calendar-utils';
import { getModuleDefinition } from '@/lib/module-registry';
import { useTranslate } from '@/i18n';
import { CalendarSourceFilter, useCalendarSources } from './CalendarSourceFilter';
import type { AgendaSeparators, EventTapStyle, ModuleInstance } from '@/types/config';

// Sourced from the registry so the reset button can't drift from the accent
// a freshly added calendar module actually starts with.
const DEFAULT_CALENDAR_ACCENT = getModuleDefinition('calendar')!.defaultConfig.accentColor as string;

export function CalendarConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const { config: c, set } = useModuleConfig<{
    viewMode?: string;
    daysToShow?: number;
    showTime?: boolean;
    showLocation?: boolean;
    maxEvents?: number;
    showWeekNumbers?: boolean;
    sourceFilter?: string[];
    accentColor?: string;
    dailyShowDescription?: boolean;
    agendaShowDescription?: boolean;
    eventTapDetails?: boolean;
    eventTapStyle?: EventTapStyle;
    weeksToShow?: number;
    multiWeekMaxEventsPerCell?: number;
    startDay?: string;
    gridEventStyle?: string;
    gridEventPillBackground?: boolean;
    multiWeekTheme?: string;
    showCountdown?: boolean;
    showProgressBar?: boolean;
    emptyDayText?: string;
    agendaSeparators?: AgendaSeparators;
  }>(mod, screenId);
  const viewMode = c.viewMode ?? 'daily';
  const sourceFilter = c.sourceFilter ?? [];
  const multiWeekTheme = c.multiWeekTheme ?? 'banner';
  // The modern themes carry their own pill styling; gridEventStyle and the
  // pill toggle only apply to multi-week under the banner theme (and to the
  // week/month grids always).
  const themeControlsPills = viewMode === 'multi-week' && multiWeekTheme !== 'banner';

  const VIEW_MODES = [
    { value: 'daily', label: t('configSections.calendar.viewDaily') },
    { value: 'agenda', label: t('configSections.calendar.viewAgenda') },
    { value: 'week', label: t('configSections.calendar.viewWeek') },
    { value: 'multi-week', label: t('configSections.calendar.viewMultiWeek') },
    { value: 'month', label: t('configSections.calendar.viewMonth') },
  ] as const;

  const START_DAY_OPTIONS = [
    { value: 'sunday', label: tCore('days.sunday') },
    { value: 'monday', label: tCore('days.monday') },
  ] as const;

  const GRID_EVENT_STYLE_OPTIONS = [
    { value: 'classic', label: t('configSections.calendar.gridEventStyleClassic') },
    { value: 'colored', label: t('configSections.calendar.gridEventStyleColored') },
  ] as const;

  const MULTI_WEEK_THEME_OPTIONS = [
    { value: 'banner', label: t('configSections.calendar.themeBanner') },
    { value: 'clean', label: t('configSections.calendar.themeClean') },
    { value: 'minimal', label: t('configSections.calendar.themeMinimal') },
    { value: 'vivid', label: t('configSections.calendar.themeVivid') },
  ] as const;

  const { availableSources, googleAuthError } = useCalendarSources('configSections.calendar');
  const googleCalendarIds = useEditorStore((s) => s.config?.settings?.calendar?.googleCalendarIds ?? []);

  return (
    <>
      <LabeledSelect
        label={t('configSections.calendar.viewMode')}
        value={viewMode}
        onChange={(v) => set({ viewMode: v })}
        options={VIEW_MODES}
      />

      {googleAuthError && googleCalendarIds.length > 0 && (
        <div className="rounded-md bg-hs-warning/20 border border-hs-warning/30 px-3 py-2 text-xs text-hs-warning">
          {t('configSections.calendar.googleAuthExpired')}
        </div>
      )}

      <CalendarSourceFilter
        keyPrefix="configSections.calendar"
        availableSources={availableSources}
        sourceFilter={sourceFilter}
        onChange={(next) => set({ sourceFilter: next })}
      />

      {viewMode === 'daily' && (
        <LabeledInput
          label={t('configSections.calendar.daysToShow')}
          type="number"
          min={1}
          max={14}
          value={c.daysToShow ?? 3}
          onChange={(v) => set({ daysToShow: Number(v) })}
        />
      )}
      {viewMode === 'agenda' && (
        <LabeledInput
          label={t('configSections.calendar.maxEvents')}
          type="number"
          min={1}
          max={100}
          value={c.maxEvents ?? 20}
          onChange={(v) => set({ maxEvents: Number(v) })}
        />
      )}
      {viewMode === 'multi-week' && (
        <>
          <LabeledSelect
            label={t('configSections.calendar.multiWeekTheme')}
            value={multiWeekTheme}
            onChange={(v) => set({ multiWeekTheme: v })}
            options={MULTI_WEEK_THEME_OPTIONS}
          />
          <Slider
            label={t('configSections.calendar.weeksToShow')}
            value={c.weeksToShow ?? 6}
            min={4}
            max={12}
            step={1}
            onChange={(v) => set({ weeksToShow: v })}
          />
          <Slider
            label={t('configSections.calendar.eventsPerCell')}
            value={c.multiWeekMaxEventsPerCell ?? 4}
            min={2}
            max={10}
            step={1}
            onChange={(v) => set({ multiWeekMaxEventsPerCell: v })}
          />
        </>
      )}
      {(viewMode === 'daily' || viewMode === 'agenda') && (
        <>
          <Toggle label={t('configSections.calendar.showTime')} checked={c.showTime !== false} onChange={(v) => set({ showTime: v })} />
          <Toggle label={t('configSections.calendar.showLocation')} checked={!!c.showLocation} onChange={(v) => set({ showLocation: v })} />
          <Toggle label={t('configSections.calendar.showCountdown')} checked={c.showCountdown === true} onChange={(v) => set({ showCountdown: v })} />
          <Toggle label={t('configSections.calendar.showProgressBar')} checked={c.showProgressBar === true} onChange={(v) => set({ showProgressBar: v })} />
        </>
      )}
      {viewMode === 'daily' && (
        <LabeledInput
          label={t('configSections.calendar.emptyDayText')}
          type="text"
          value={c.emptyDayText ?? ''}
          placeholder={t('configSections.calendar.emptyDayTextPlaceholder')}
          onChange={(v) => set({ emptyDayText: v })}
        />
      )}
      {viewMode === 'agenda' && (
        <LabeledSelect
          label={t('configSections.calendar.separators')}
          value={c.agendaSeparators ?? 'none'}
          onChange={(v) => set({ agendaSeparators: v })}
          options={[
            { value: 'none', label: t('configSections.calendar.separatorsNone') },
            { value: 'weeks', label: t('configSections.calendar.separatorsWeeks') },
            { value: 'weeks-and-months', label: t('configSections.calendar.separatorsWeeksMonths') },
          ]}
        />
      )}
      {viewMode === 'daily' && (
        <Toggle label={t('common.showDescription')} checked={!!c.dailyShowDescription} onChange={(v) => set({ dailyShowDescription: v })} />
      )}
      {viewMode === 'agenda' && (
        <Toggle label={t('common.showDescription')} checked={!!c.agendaShowDescription} onChange={(v) => set({ agendaShowDescription: v })} />
      )}
      {isGridView(viewMode) && (
        <Toggle label={t('configSections.calendar.showWeekNumbers')} checked={!!c.showWeekNumbers} onChange={(v) => set({ showWeekNumbers: v })} />
      )}
      {/* Agenda week separators label their week start with the same startDay
          the grids use, so the select follows the separators option there. */}
      {(isGridView(viewMode) || (viewMode === 'agenda' && (c.agendaSeparators ?? 'none') !== 'none')) && (
        <LabeledSelect
          label={t('configSections.calendar.weekStartsOn')}
          value={c.startDay ?? 'sunday'}
          onChange={(v) => set({ startDay: v })}
          options={START_DAY_OPTIONS}
        />
      )}
      {isGridView(viewMode) && !themeControlsPills && (
        <LabeledSelect
          label={t('configSections.calendar.gridEventStyle')}
          value={c.gridEventStyle ?? 'classic'}
          onChange={(v) => set({ gridEventStyle: v })}
          options={GRID_EVENT_STYLE_OPTIONS}
        />
      )}
      {isGridView(viewMode) && !themeControlsPills && (c.gridEventStyle ?? 'classic') === 'colored' && (
        <Toggle
          label={t('configSections.calendar.gridEventPill')}
          checked={!!c.gridEventPillBackground}
          onChange={(v) => set({ gridEventPillBackground: v })}
        />
      )}
      <ColorPicker
        label={t('configSections.calendar.accentColor')}
        value={c.accentColor ?? '#3b82f6'}
        onChange={(v) => set({ accentColor: v })}
        defaultValue={DEFAULT_CALENDAR_ACCENT}
        resetLabel={t('common.resetToDefault')}
      />

      {/* Touch: tap an event to open a detail overlay */}
      <Toggle label={t('configSections.calendar.eventTapDetails')} checked={c.eventTapDetails === true} onChange={(v) => set({ eventTapDetails: v })} />
      {c.eventTapDetails === true && (
        <LabeledSelect
          label={t('configSections.calendar.eventTapStyle')}
          value={c.eventTapStyle ?? 'sheet'}
          onChange={(v) => set({ eventTapStyle: v })}
          options={[
            { value: 'sheet', label: t('configSections.calendar.eventTapStyleSheet') },
            { value: 'card', label: t('configSections.calendar.eventTapStyleCard') },
          ]}
        />
      )}
    </>
  );
}
