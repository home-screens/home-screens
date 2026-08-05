'use client';

import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import { CalendarSourceFilter, useCalendarSources } from './CalendarSourceFilter';
import type { EventTapStyle, ModuleInstance } from '@/types/config';

export function CalendarConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
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
  }>(mod, screenId);
  const viewMode = c.viewMode ?? 'daily';
  const sourceFilter = c.sourceFilter ?? [];

  const VIEW_MODES = [
    { value: 'daily', label: t('configSections.calendar.viewDaily') },
    { value: 'agenda', label: t('configSections.calendar.viewAgenda') },
    { value: 'week', label: t('configSections.calendar.viewWeek') },
    { value: 'month', label: t('configSections.calendar.viewMonth') },
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
      {(viewMode === 'daily' || viewMode === 'agenda') && (
        <>
          <Toggle label={t('configSections.calendar.showTime')} checked={c.showTime !== false} onChange={(v) => set({ showTime: v })} />
          <Toggle label={t('configSections.calendar.showLocation')} checked={!!c.showLocation} onChange={(v) => set({ showLocation: v })} />
        </>
      )}
      {viewMode === 'daily' && (
        <Toggle label={t('common.showDescription')} checked={!!c.dailyShowDescription} onChange={(v) => set({ dailyShowDescription: v })} />
      )}
      {viewMode === 'agenda' && (
        <Toggle label={t('common.showDescription')} checked={!!c.agendaShowDescription} onChange={(v) => set({ agendaShowDescription: v })} />
      )}
      {(viewMode === 'week' || viewMode === 'month') && (
        <Toggle label={t('configSections.calendar.showWeekNumbers')} checked={!!c.showWeekNumbers} onChange={(v) => set({ showWeekNumbers: v })} />
      )}
      <ColorPicker
        label={t('configSections.calendar.accentColor')}
        value={c.accentColor ?? '#3b82f6'}
        onChange={(v) => set({ accentColor: v })}
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
