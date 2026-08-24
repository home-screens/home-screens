'use client';

import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import FullscreenThemeSelect from './FullscreenThemeSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { effectiveWeatherPlacement } from '@/lib/calendar-utils';
import { useTranslate } from '@/i18n';
import { CalendarSourceFilter, useCalendarSources } from './CalendarSourceFilter';
import { CalendarTitleFilterControl } from './CalendarTitleFilter';
import { CalendarRulesEditor } from './CalendarRulesEditor';
import { CalendarGroup, CalendarRulesGroup, useCalendarGroupLabels } from './CalendarSettingsGroups';
import type { FullscreenTypographySize, FullscreenCalendarView, CalendarDensity, TodayHighlightStyle, EventOverlapMode, EventTapStyle, WeatherPlacement, AgendaSeparators, ScheduleStartAnchor, CalendarLegendPlacement } from '@/types/config';
import type { ModuleInstance, FullscreenCalendarConfig } from '@/types/config';

const SHOW_DESCRIPTION_KEY = {
  'schedule': 'scheduleShowDescription',
  'week-list': 'weekShowDescription',
  'day-timeline': 'dayShowDescription',
  'agenda': 'agendaShowDescription',
} as const;

export function FullscreenCalendarConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
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

  const TODAY_HIGHLIGHT_OPTIONS: { value: TodayHighlightStyle; label: string }[] = [
    { value: 'full', label: t('configSections.fullscreen-calendar.todayHighlightFull') },
    { value: 'subtle', label: t('configSections.fullscreen-calendar.todayHighlightSubtle') },
    { value: 'minimal', label: t('configSections.fullscreen-calendar.todayHighlightMinimal') },
    { value: 'off', label: t('configSections.fullscreen-calendar.todayHighlightOff') },
  ];

  const OVERLAP_OPTIONS: { value: EventOverlapMode; label: string }[] = [
    { value: 'columns', label: t('configSections.fullscreen-calendar.overlapSideBySide') },
    { value: 'stacked', label: t('configSections.fullscreen-calendar.overlapStacked') },
  ];

  const TAP_STYLE_OPTIONS: { value: EventTapStyle; label: string }[] = [
    { value: 'sheet', label: t('configSections.fullscreen-calendar.eventTapStyleSheet') },
    { value: 'card', label: t('configSections.fullscreen-calendar.eventTapStyleCard') },
  ];

  const START_DAY_OPTIONS = [
    { value: 'sunday', label: tCore('days.sunday') },
    { value: 'monday', label: tCore('days.monday') },
  ] as const;

  const WEATHER_PLACEMENT_OPTIONS: { value: WeatherPlacement; label: string }[] = [
    { value: 'off', label: t('configSections.fullscreen-calendar.weatherOff') },
    { value: 'header', label: t('configSections.fullscreen-calendar.weatherHeader') },
    { value: 'days', label: t('configSections.fullscreen-calendar.weatherDays') },
    { value: 'events', label: t('configSections.fullscreen-calendar.weatherEvents') },
    { value: 'days-and-events', label: t('configSections.fullscreen-calendar.weatherDaysAndEvents') },
  ];

  const SEPARATOR_OPTIONS: { value: AgendaSeparators; label: string }[] = [
    { value: 'none', label: t('configSections.fullscreen-calendar.separatorsNone') },
    { value: 'weeks', label: t('configSections.fullscreen-calendar.separatorsWeeks') },
    { value: 'weeks-and-months', label: t('configSections.fullscreen-calendar.separatorsWeeksMonths') },
  ];

  const START_ANCHOR_OPTIONS: { value: ScheduleStartAnchor; label: string }[] = [
    { value: 'today', label: t('configSections.fullscreen-calendar.anchorToday') },
    { value: 'start-of-week', label: t('configSections.fullscreen-calendar.anchorStartOfWeek') },
    { value: 'next-weekend', label: t('configSections.fullscreen-calendar.anchorWeekend') },
  ];

  const LEGEND_OPTIONS: { value: CalendarLegendPlacement; label: string }[] = [
    { value: 'off', label: t('configSections.fullscreen-calendar.legendOff') },
    { value: 'header', label: t('configSections.fullscreen-calendar.legendHeader') },
    { value: 'footer', label: t('configSections.fullscreen-calendar.legendFooter') },
  ];

  const isListView = view === 'agenda' || view === 'week-list';

  const { availableSources } = useCalendarSources('configSections.fullscreen-calendar');
  const groups = useCalendarGroupLabels();

  // The "this view" heading names the view itself, so the block that swaps
  // when the picker changes is labelled with what it belongs to.
  const viewLabel = VIEW_OPTIONS.find((v) => v.value === view)?.label ?? '';
  const isTimeGrid = view === 'schedule' || view === 'day-timeline';

  return (
    <>
      <LabeledSelect
        label={t('configSections.fullscreen-calendar.view')}
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEW_OPTIONS}
      />
      <FullscreenThemeSelect
        value={c.theme}
        onChange={(theme) => set({ theme })}
        defaultOptionKey="configSections.fullscreen-calendar.themeDefault"
      />
      <LabeledSelect
        label={t('common.density')}
        value={c.density ?? 'cozy'}
        onChange={(v) => set({ density: v })}
        options={DENSITY_OPTIONS}
      />
      <LabeledSelect
        label={t('configSections.fullscreen-calendar.typographySize')}
        value={c.typographySize ?? 'medium'}
        onChange={(v) => set({ typographySize: v })}
        options={TYPOGRAPHY_OPTIONS}
      />

      {/* ── What shows: the data coming in, before any styling ── */}
      <CalendarGroup label={groups.whatShows}>
        <CalendarSourceFilter
          keyPrefix="configSections.fullscreen-calendar"
          availableSources={availableSources}
          sourceFilter={sourceFilter}
          onChange={(next) => set({ sourceFilter: next })}
        />
        <CalendarTitleFilterControl
          keyPrefix="configSections.fullscreen-calendar"
          titleFilter={c.titleFilter}
          onChange={(next) => set({ titleFilter: next })}
        />
        <LabeledSelect
          label={t('configSections.fullscreen-calendar.showLegend')}
          value={c.showLegend ?? 'off'}
          onChange={(v) => set({ showLegend: v })}
          options={LEGEND_OPTIONS}
        />
      </CalendarGroup>

      {/* ── This view: every view-gated field, pooled ── */}
      <CalendarGroup label={viewLabel} when={viewLabel !== ''}>
        {isTimeGrid && (
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
            <LabeledSelect
              label={t('configSections.fullscreen-calendar.startAnchor')}
              value={c.scheduleStartAnchor ?? 'today'}
              onChange={(v) => set({ scheduleStartAnchor: v })}
              options={START_ANCHOR_OPTIONS}
            />
            {c.scheduleStartAnchor === 'start-of-week' && (
              <LabeledSelect
                label={t('configSections.calendar.weekStartsOn')}
                value={c.startDay ?? 'sunday'}
                onChange={(v) => set({ startDay: v })}
                options={START_DAY_OPTIONS}
              />
            )}
          </>
        )}
        {view === 'week-list' && (
          <Toggle label={t('configSections.fullscreen-calendar.collapsePastDays')} checked={c.weekCollapsePastDays !== false} onChange={(v) => set({ weekCollapsePastDays: v })} />
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
            <Toggle label={t('configSections.fullscreen-calendar.showFinishedToday')} checked={c.agendaShowFinishedToday === true} onChange={(v) => set({ agendaShowFinishedToday: v })} />
            <LabeledSelect
              label={t('configSections.fullscreen-calendar.separators')}
              value={c.agendaSeparators ?? 'none'}
              onChange={(v) => set({ agendaSeparators: v })}
              options={SEPARATOR_OPTIONS}
            />
          </>
        )}
        {/* Agenda week separators label their week start with the same startDay
            the grids use, so the select follows the separators option there. */}
        {(view === 'week-list' || view === 'month-grid' || (view === 'agenda' && (c.agendaSeparators ?? 'none') !== 'none')) && (
          <LabeledSelect
            label={t('configSections.calendar.weekStartsOn')}
            value={c.startDay ?? 'sunday'}
            onChange={(v) => set({ startDay: v })}
            options={START_DAY_OPTIONS}
          />
        )}
        {isTimeGrid && (
          <LabeledSelect
            label={t('configSections.fullscreen-calendar.overlappingEvents')}
            value={c.eventOverlap ?? 'columns'}
            onChange={(v) => set({ eventOverlap: v })}
            options={OVERLAP_OPTIONS}
          />
        )}
        {isListView && (
          <LabeledInput
            label={t('configSections.fullscreen-calendar.emptyDayText')}
            type="text"
            value={c.emptyDayText ?? ''}
            placeholder={t('configSections.fullscreen-calendar.emptyDayTextPlaceholder')}
            onChange={(v) => set({ emptyDayText: v })}
          />
        )}
      </CalendarGroup>

      {/* ── Event rows: how one event reads ── */}
      {/* No `when` guard because Dim Past Events below is unconditional, which
          is the only thing keeping this group non-empty for month-grid (its
          other row is wrapEventTitles). View-gate that toggle and this needs a
          guard like the compact module's. */}
      <CalendarGroup label={groups.eventRows}>
        {view !== 'month-grid' && (
          <Toggle
            label={t('common.showDescription')}
            checked={!!c[SHOW_DESCRIPTION_KEY[view]]}
            onChange={(v) => set({ [SHOW_DESCRIPTION_KEY[view]]: v })}
          />
        )}
        {view === 'day-timeline' && (
          <Toggle label={t('configSections.fullscreen-calendar.showLocation')} checked={c.dayShowLocation !== false} onChange={(v) => set({ dayShowLocation: v })} />
        )}
        {(view === 'schedule' || view === 'month-grid') && (
          <Toggle
            label={t('configSections.fullscreen-calendar.wrapEventTitles')}
            checked={c.wrapEventTitles === true}
            onChange={(v) => set({ wrapEventTitles: v })}
          />
        )}
        {isListView && (
          <>
            <Toggle label={t('configSections.fullscreen-calendar.showCountdown')} checked={c.showCountdown === true} onChange={(v) => set({ showCountdown: v })} />
            {c.showCountdown === true && (
              <Toggle label={t('configSections.fullscreen-calendar.countdownAllDay')} checked={c.countdownAllDay === true} onChange={(v) => set({ countdownAllDay: v })} />
            )}
            <Toggle label={t('configSections.fullscreen-calendar.showProgressBar')} checked={c.showProgressBar === true} onChange={(v) => set({ showProgressBar: v })} />
          </>
        )}
        <Toggle label={t('configSections.fullscreen-calendar.dimPastEvents')} checked={c.dimPastEvents !== false} onChange={(v) => set({ dimPastEvents: v })} />
      </CalendarGroup>

      {/* ── Look: whole-module styling ── */}
      <CalendarGroup label={groups.look}>
        <ColorPicker label={t('configSections.fullscreen-calendar.accentColor')} value={c.accentColor ?? '#EA580C'} onChange={(v) => set({ accentColor: v })} />
        {/* Today highlight — day-timeline shows a single day, so it has no today to highlight */}
        {view !== 'day-timeline' && (
          <LabeledSelect
            label={t('configSections.fullscreen-calendar.todayHighlight')}
            value={c.todayHighlightStyle ?? 'full'}
            onChange={(v) => set({ todayHighlightStyle: v })}
            options={TODAY_HIGHLIGHT_OPTIONS}
          />
        )}
        <Toggle label={t('configSections.fullscreen-calendar.shadeWeekends')} checked={c.shadeWeekends !== false} onChange={(v) => set({ shadeWeekends: v })} />
        <Toggle label={t('configSections.fullscreen-calendar.showNowLine')} checked={c.showNowLine !== false} onChange={(v) => set({ showNowLine: v })} />
        <LabeledSelect
          label={t('configSections.fullscreen-calendar.weatherPlacement')}
          // The EFFECTIVE placement for the current view: a richer placement
          // chosen in another view degrades to the header pill at render time,
          // and the select shows that same truth instead of an option this
          // view can't express.
          value={effectiveWeatherPlacement(view, c)}
          onChange={(v) => set({ weatherPlacement: v })}
          options={
            // Each view offers only the placements it can render: list views
            // take all five, schedule adds day-column weather, month-grid and
            // day-timeline have no per-day/per-event surface.
            WEATHER_PLACEMENT_OPTIONS.filter((o) => {
              if (o.value === 'off' || o.value === 'header') return true;
              if (isListView) return true;
              return view === 'schedule' && o.value === 'days';
            })
          }
        />
      </CalendarGroup>

      {/* ── Advanced looks: the rule engines, collapsed ── */}
      <CalendarRulesGroup eventRules={c.eventRules} dayRules={c.dayRules}>
        <CalendarRulesEditor
          eventRules={c.eventRules}
          dayRules={c.dayRules}
          availableSources={availableSources}
          onChange={(patch) => set(patch)}
        />
      </CalendarRulesGroup>

      {/* ── Touch: interaction, not appearance ── */}
      <CalendarGroup label={groups.touch}>
        <Toggle label={t('configSections.fullscreen-calendar.eventTapDetails')} checked={c.eventTapDetails === true} onChange={(v) => set({ eventTapDetails: v })} />
        {c.eventTapDetails === true && (
          <LabeledSelect
            label={t('configSections.fullscreen-calendar.eventTapStyle')}
            value={c.eventTapStyle ?? 'sheet'}
            onChange={(v) => set({ eventTapStyle: v })}
            options={TAP_STYLE_OPTIONS}
          />
        )}
      </CalendarGroup>
    </>
  );
}
