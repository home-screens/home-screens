'use client';

import { useState, useEffect } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledField from '@/components/ui/LabeledField';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useEditorStore } from '@/stores/editor-store';
import { editorFetch } from '@/lib/editor-fetch';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { useTranslate } from '@/i18n';
import type { FullscreenTypographySize, FullscreenCalendarView, CalendarDensity } from '@/types/config';
import type { ModuleInstance, FullscreenCalendarConfig } from '@/types/config';

interface CalendarSource {
  id: string;
  name: string;
  color: string;
}

interface GoogleCalendar {
  id: string;
  summary: string;
  backgroundColor: string;
  primary: boolean;
}

export function FullscreenCalendarConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<Partial<FullscreenCalendarConfig>>(mod, screenId);
  const view = c.view ?? 'schedule';
  const sourceFilter = c.sourceFilter ?? [];

  const VIEW_OPTIONS: { value: FullscreenCalendarView; label: string }[] = [
    { value: 'schedule', label: t('configSections.fullscreen-calendar.viewSchedule') },
    { value: 'week-list', label: t('configSections.fullscreen-calendar.viewWeekList') },
    { value: 'month-grid', label: t('configSections.fullscreen-calendar.viewMonthGrid') },
    { value: 'day-timeline', label: t('configSections.fullscreen-calendar.viewDayTimeline') },
    { value: 'agenda', label: t('configSections.fullscreen-calendar.viewAgenda') },
  ];

  const DENSITY_OPTIONS: { value: CalendarDensity; label: string }[] = [
    { value: 'cozy', label: t('configSections.fullscreen-calendar.densityCozy') },
    { value: 'snug', label: t('configSections.fullscreen-calendar.densitySnug') },
  ];

  const TYPOGRAPHY_OPTIONS: { value: FullscreenTypographySize; label: string }[] = [
    { value: 'small', label: t('configSections.fullscreen-calendar.typographySmall') },
    { value: 'medium', label: t('configSections.fullscreen-calendar.typographyMedium') },
    { value: 'large', label: t('configSections.fullscreen-calendar.typographyLarge') },
    { value: 'extra-large', label: t('configSections.fullscreen-calendar.typographyExtraLarge') },
    { value: '2x-large', label: t('configSections.fullscreen-calendar.typography2xLarge') },
    { value: '3x-large', label: t('configSections.fullscreen-calendar.typography3xLarge') },
    { value: '4x-large', label: t('configSections.fullscreen-calendar.typography4xLarge') },
  ];

  // Build source list (same pattern as CalendarConfigSection)
  const googleCalendarIds = useEditorStore((s) => s.config?.settings?.calendar?.googleCalendarIds ?? []);
  const icalSources = useEditorStore((s) => s.config?.settings?.calendar?.icalSources ?? []);
  const holidayCountry = useEditorStore((s) => s.config?.settings?.calendar?.holidayCountry);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>([]);

  useEffect(() => {
    async function fetchGoogleCals() {
      try {
        const res = await editorFetch('/api/calendars');
        if (res.ok) setGoogleCalendars(await res.json());
      } catch { /* ignore */ }
    }
    if (googleCalendarIds.length > 0) fetchGoogleCals();
  }, [googleCalendarIds.length]);

  const availableSources: CalendarSource[] = [];
  let unnamedCount = 0;
  for (const gid of googleCalendarIds) {
    const cal = googleCalendars.find((c) => c.id === gid);
    let name = cal?.summary;
    if (!name) {
      const local = gid.split('@')[0];
      if (/^[a-z0-9]{20,}$/i.test(local)) {
        unnamedCount++;
        name = unnamedCount > 1
          ? t('configSections.fullscreen-calendar.googleCalendarNumbered', { n: unnamedCount })
          : t('configSections.fullscreen-calendar.googleCalendar');
      } else {
        name = local;
      }
    }
    availableSources.push({ id: gid, name, color: cal?.backgroundColor ?? '#3b82f6' });
  }
  for (const src of icalSources) {
    if (src.enabled) availableSources.push({ id: src.id, name: src.name, color: src.color });
  }
  if (holidayCountry) availableSources.push({ id: 'holidays', name: t('configSections.fullscreen-calendar.publicHolidays'), color: '#10b981' });

  const allSelected = sourceFilter.length === 0;

  function toggleSource(id: string) {
    if (allSelected) {
      set({ sourceFilter: availableSources.filter((s) => s.id !== id).map((s) => s.id) });
    } else if (sourceFilter.includes(id)) {
      const next = sourceFilter.filter((s) => s !== id);
      set({ sourceFilter: next.length === 0 ? undefined : next });
    } else {
      const next = [...sourceFilter, id];
      set({ sourceFilter: next.length >= availableSources.length ? undefined : next });
    }
  }

  return (
    <>
      {/* View Mode */}
      <LabeledSelect
        label={t('configSections.fullscreen-calendar.view')}
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEW_OPTIONS}
      />

      {/* Density */}
      <LabeledSelect
        label={t('configSections.fullscreen-calendar.density')}
        value={c.density ?? 'cozy'}
        onChange={(v) => set({ density: v })}
        options={DENSITY_OPTIONS}
      />

      {/* Typography Size */}
      <LabeledSelect
        label={t('configSections.fullscreen-calendar.typographySize')}
        value={c.typographySize ?? 'medium'}
        onChange={(v) => set({ typographySize: v })}
        options={TYPOGRAPHY_OPTIONS}
      />

      {/* Theme Override */}
      <LabeledField label={t('configSections.fullscreen-calendar.theme')}>
        <select
          value={c.theme ?? ''}
          onChange={(e) => set({ theme: e.target.value || undefined })}
          className={INPUT_CLASS}
        >
          <option value="">{t('configSections.fullscreen-calendar.themeDefault')}</option>
          {FULLSCREEN_THEMES.map((th) => (
            <option key={th.id} value={th.id}>{th.name} ({th.group})</option>
          ))}
        </select>
      </LabeledField>

      {/* Accent Color */}
      <ColorPicker label={t('configSections.fullscreen-calendar.accentColor')} value={c.accentColor ?? '#EA580C'} onChange={(v) => set({ accentColor: v })} />

      {/* Toggles */}
      <Toggle label={t('configSections.fullscreen-calendar.dimPastEvents')} checked={c.dimPastEvents !== false} onChange={(v) => set({ dimPastEvents: v })} />
      <Toggle label={t('configSections.fullscreen-calendar.shadeWeekends')} checked={c.shadeWeekends !== false} onChange={(v) => set({ shadeWeekends: v })} />
      <Toggle label={t('configSections.fullscreen-calendar.showWeather')} checked={c.showWeather !== false} onChange={(v) => set({ showWeather: v })} />
      <Toggle label={t('configSections.fullscreen-calendar.showNowLine')} checked={c.showNowLine !== false} onChange={(v) => set({ showNowLine: v })} />

      {/* Source filter */}
      {availableSources.length > 1 && (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-hs-text-muted">{t('configSections.fullscreen-calendar.sources')}</span>
          <div className="rounded-md bg-hs-card border border-hs-border-strong divide-y divide-hs-border-strong max-h-40 overflow-y-auto">
            <label className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-hs-hover">
              <input type="radio" checked={allSelected} onChange={() => set({ sourceFilter: undefined })}
                className="border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0" />
              <span className="text-sm text-hs-text-body">{t('configSections.fullscreen-calendar.allSources')}</span>
            </label>
            {availableSources.map((src) => (
              <label key={src.id} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-hs-hover">
                <input type="checkbox" checked={allSelected || sourceFilter.includes(src.id)} onChange={() => toggleSource(src.id)}
                  className="rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0" />
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: src.color }} />
                <span className="text-sm text-hs-text-body truncate">{src.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* View-specific settings */}
      {(view === 'schedule' || view === 'day-timeline') && (
        <>
          <LabeledInput
            label={t('configSections.fullscreen-calendar.startHour')}
            type="number"
            min={0}
            max={23}
            value={view === 'schedule' ? (c.scheduleHourStart ?? 6) : (c.dayHourStart ?? 6)}
            onChange={(v) => set(view === 'schedule' ? { scheduleHourStart: Number(v) } : { dayHourStart: Number(v) })}
          />
          <LabeledInput
            label={t('configSections.fullscreen-calendar.endHour')}
            type="number"
            min={1}
            max={24}
            value={view === 'schedule' ? (c.scheduleHourEnd ?? 22) : (c.dayHourEnd ?? 22)}
            onChange={(v) => set(view === 'schedule' ? { scheduleHourEnd: Number(v) } : { dayHourEnd: Number(v) })}
          />
        </>
      )}

      {view === 'schedule' && (
        <>
          <LabeledInput
            label={t('configSections.fullscreen-calendar.daysToShowAuto')}
            type="number"
            min={0}
            max={7}
            value={c.scheduleDaysToShow ?? 0}
            onChange={(v) => set({ scheduleDaysToShow: Number(v) })}
          />
          <Toggle label={t('configSections.fullscreen-calendar.showDescription')} checked={!!c.scheduleShowDescription} onChange={(v) => set({ scheduleShowDescription: v })} />
        </>
      )}

      {view === 'week-list' && (
        <>
          <Toggle label={t('configSections.fullscreen-calendar.collapsePastDays')} checked={c.weekCollapsePastDays !== false} onChange={(v) => set({ weekCollapsePastDays: v })} />
          <Toggle label={t('configSections.fullscreen-calendar.showDescription')} checked={!!c.weekShowDescription} onChange={(v) => set({ weekShowDescription: v })} />
        </>
      )}

      {view === 'month-grid' && (
        <>
          <Toggle label={t('configSections.fullscreen-calendar.showWeekNumbers')} checked={!!c.monthShowWeekNumbers} onChange={(v) => set({ monthShowWeekNumbers: v })} />
          <LabeledInput
            label={t('configSections.fullscreen-calendar.maxEventsPerCellAuto')}
            type="number"
            min={0}
            max={8}
            value={c.monthMaxEventsPerCell ?? 0}
            onChange={(v) => set({ monthMaxEventsPerCell: Number(v) })}
          />
        </>
      )}

      {view === 'day-timeline' && (
        <>
          <Toggle label={t('configSections.fullscreen-calendar.showLocation')} checked={c.dayShowLocation !== false} onChange={(v) => set({ dayShowLocation: v })} />
          <Toggle label={t('configSections.fullscreen-calendar.showDescription')} checked={!!c.dayShowDescription} onChange={(v) => set({ dayShowDescription: v })} />
        </>
      )}

      {view === 'agenda' && (
        <>
          <LabeledInput
            label={t('configSections.fullscreen-calendar.daysAhead')}
            type="number"
            min={7}
            max={30}
            value={c.agendaDaysAhead ?? 14}
            onChange={(v) => set({ agendaDaysAhead: Number(v) })}
          />
          <Toggle label={t('configSections.fullscreen-calendar.hideEmptyDays')} checked={!!c.agendaHideEmptyDays} onChange={(v) => set({ agendaHideEmptyDays: v })} />
          <Toggle label={t('configSections.fullscreen-calendar.showDescription')} checked={!!c.agendaShowDescription} onChange={(v) => set({ agendaShowDescription: v })} />
        </>
      )}
    </>
  );
}
