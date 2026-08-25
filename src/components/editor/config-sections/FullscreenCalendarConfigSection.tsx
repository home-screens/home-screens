'use client';

import Toggle from '@/components/ui/Toggle';
import FullscreenAccentPicker from './FullscreenAccentPicker';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import FullscreenThemeSelect from './FullscreenThemeSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { effectiveWeatherPlacement, viewTraits } from '@/components/modules/fullscreen-calendar/view-traits';
import { resolveCalendarAccent } from '@/lib/calendar-event-surface';
import { useFullscreenThemeTokens } from '@/hooks/useFullscreenThemeTokens';
import { useTranslate } from '@/i18n';
import { CalendarSourceFilter, useCalendarSources } from './CalendarSourceFilter';
import { CalendarTitleFilterControl } from './CalendarTitleFilter';
import { CalendarRulesEditor } from './CalendarRulesEditor';
import { CalendarGroup, CalendarRulesGroup, useCalendarGroupLabels } from './CalendarSettingsGroups';
import type { FullscreenTypographySize, FullscreenCalendarView, CalendarDensity, TodayHighlightStyle, EventOverlapMode, EventTapStyle, WeatherPlacement, AgendaSeparators, ScheduleStartAnchor, CalendarLegendPlacement, HourWindowMode } from '@/types/config';
import { ROLLING_HOURS_DEFAULT, ROLLING_HOURS_MAX, ROLLING_HOURS_MIN } from '@/lib/calendar-hour-window';
import { useEditorStore } from '@/stores/editor-store';
import { settingsPath } from '@/lib/settings-route';
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
  // What the picker shows while accentColor is empty: the accent the module
  // paints with, resolved through the same chain as the display (inherited
  // theme included) so the swatch and the kiosk can never disagree.
  const themeAccent = resolveCalendarAccent('', useFullscreenThemeTokens(c.theme, c.darkMode));

  const VIEW_OPTIONS: { value: FullscreenCalendarView; label: string }[] = [
    { value: 'schedule', label: t('configSections.fullscreen-calendar.viewSchedule') },
    { value: 'week-list', label: t('configSections.fullscreen-calendar.viewWeekList') },
    { value: 'month-grid', label: t('configSections.fullscreen-calendar.viewMonthGrid') },
    { value: 'day-timeline', label: t('configSections.fullscreen-calendar.viewDayTimeline') },
    { value: 'agenda', label: t('configSections.fullscreen-calendar.viewAgenda') },
    { value: 'family-grid', label: t('configSections.fullscreen-calendar.viewFamilyGrid') },
    { value: 'up-next', label: t('configSections.fullscreen-calendar.viewUpNext') },
    { value: 'free-time', label: t('configSections.fullscreen-calendar.viewFreeTime') },
  ];

  const HOUR_WINDOW_OPTIONS: { value: HourWindowMode; label: string }[] = [
    { value: 'fixed', label: t('configSections.fullscreen-calendar.hourWindowFixed') },
    { value: 'rolling', label: t('configSections.fullscreen-calendar.hourWindowRolling') },
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

  // View-shape flags come from the shared registry, so the editor's gating
  // can never disagree with what the view actually renders.
  const { isListView, isPersonView, isSingleDay: isSingleDayView, isTimeGrid, weather: viewWeather } = viewTraits(view);
  const peopleCount = useEditorStore((s) => s.config?.settings?.calendar?.people?.length ?? 0);

  const { availableSources } = useCalendarSources('configSections.fullscreen-calendar');
  const groups = useCalendarGroupLabels();

  // The "this view" heading names the view itself, so the block that swaps
  // when the picker changes is labelled with what it belongs to.
  const viewLabel = VIEW_OPTIONS.find((v) => v.value === view)?.label ?? '';
  const descriptionKey = view in SHOW_DESCRIPTION_KEY ? SHOW_DESCRIPTION_KEY[view as keyof typeof SHOW_DESCRIPTION_KEY] : null;

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
        {isPersonView && (
          <p className="text-xs text-hs-text-muted leading-relaxed">
            {peopleCount > 0
              ? t('configSections.fullscreen-calendar.peopleConfigured', { count: peopleCount })
              : t('configSections.fullscreen-calendar.peopleHint')}
            {' '}
            <a href={settingsPath({ kind: 'defaults', page: 'calendar' })} className="text-hs-accent hover:underline">
              {t('configSections.fullscreen-calendar.peopleLink')}
            </a>
          </p>
        )}
        {isTimeGrid && (
          <>
            <LabeledSelect
              label={t('configSections.fullscreen-calendar.hourWindow')}
              value={c.hourWindow ?? 'fixed'}
              onChange={(v) => set({ hourWindow: v })}
              options={HOUR_WINDOW_OPTIONS}
            />
            {c.hourWindow === 'rolling' ? (
              <LabeledInput
                label={t('configSections.fullscreen-calendar.rollingHours')}
                type="number"
                min={ROLLING_HOURS_MIN}
                max={ROLLING_HOURS_MAX}
                value={c.rollingHours ?? ROLLING_HOURS_DEFAULT}
                onChange={(v) => set({ rollingHours: Number(v) })}
              />
            ) : (
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
          </>
        )}
        {view === 'free-time' && (
          <>
            <LabeledInput
              label={t('configSections.fullscreen-calendar.startHour')}
              type="number"
              min={0}
              max={23}
              value={c.freeTimeHourStart ?? 7}
              onChange={(v) => set({ freeTimeHourStart: Number(v) })}
            />
            <LabeledInput
              label={t('configSections.fullscreen-calendar.endHour')}
              type="number"
              min={1}
              max={24}
              value={c.freeTimeHourEnd ?? 22}
              onChange={(v) => set({ freeTimeHourEnd: Number(v) })}
            />
            <Toggle label={t('configSections.fullscreen-calendar.showTomorrow')} checked={c.freeTimeShowTomorrow !== false} onChange={(v) => set({ freeTimeShowTomorrow: v })} />
          </>
        )}
        {view === 'up-next' && (
          <>
            <LabeledInput
              label={t('configSections.fullscreen-calendar.laterCount')}
              type="number"
              min={0}
              max={6}
              value={c.upNextLaterCount ?? 3}
              onChange={(v) => set({ upNextLaterCount: Number(v) })}
            />
            <Toggle label={t('configSections.fullscreen-calendar.showEarlier')} checked={c.upNextShowEarlier !== false} onChange={(v) => set({ upNextShowEarlier: v })} />
            <Toggle label={t('configSections.fullscreen-calendar.showTomorrow')} checked={c.upNextShowTomorrow !== false} onChange={(v) => set({ upNextShowTomorrow: v })} />
          </>
        )}
        {view === 'family-grid' && (
          <Toggle label={t('configSections.fullscreen-calendar.showEveryoneRow')} checked={c.familyShowEveryoneRow !== false} onChange={(v) => set({ familyShowEveryoneRow: v })} />
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
          <>
            <Toggle label={t('configSections.fullscreen-calendar.collapsePastDays')} checked={c.weekCollapsePastDays !== false} onChange={(v) => set({ weekCollapsePastDays: v })} />
            <Toggle label={t('configSections.fullscreen-calendar.showMeals')} checked={c.showMeals === true} onChange={(v) => set({ showMeals: v })} />
            <Toggle label={t('configSections.fullscreen-calendar.showChores')} checked={c.showChores === true} onChange={(v) => set({ showChores: v })} />
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
        {(view === 'week-list' || view === 'month-grid' || view === 'family-grid' || (view === 'agenda' && (c.agendaSeparators ?? 'none') !== 'none')) && (
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
        {descriptionKey && (
          <Toggle
            label={t('common.showDescription')}
            checked={!!c[descriptionKey]}
            onChange={(v) => set({ [descriptionKey]: v })}
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
        <FullscreenAccentPicker label={t('configSections.fullscreen-calendar.accentColor')} value={c.accentColor} themeAccent={themeAccent} onChange={(v) => set({ accentColor: v })} />
        {/* Today highlight — the single-day views have no today to highlight */}
        {!isSingleDayView && (
          <LabeledSelect
            label={t('configSections.fullscreen-calendar.todayHighlight')}
            value={c.todayHighlightStyle ?? 'full'}
            onChange={(v) => set({ todayHighlightStyle: v })}
            options={TODAY_HIGHLIGHT_OPTIONS}
          />
        )}
        {/* The single-day views have no weekend to shade. */}
        {!isSingleDayView && (
          <Toggle label={t('configSections.fullscreen-calendar.shadeWeekends')} checked={c.shadeWeekends !== false} onChange={(v) => set({ shadeWeekends: v })} />
        )}
        {/* A now-line needs a time axis; the list views and month grid have none. */}
        {isTimeGrid && (
          <Toggle label={t('configSections.fullscreen-calendar.showNowLine')} checked={c.showNowLine !== false} onChange={(v) => set({ showNowLine: v })} />
        )}
        <LabeledSelect
          label={t('configSections.fullscreen-calendar.weatherPlacement')}
          // The EFFECTIVE placement for the current view: a richer placement
          // chosen in another view degrades to the header pill at render time,
          // and the select shows that same truth instead of an option this
          // view can't express.
          value={effectiveWeatherPlacement(view, c)}
          onChange={(v) => set({ weatherPlacement: v })}
          options={
            // Each view offers only the placements it can render — driven by
            // the same registry the display uses to pick weather surfaces.
            WEATHER_PLACEMENT_OPTIONS.filter((o) => {
              if (o.value === 'off' || o.value === 'header') return true;
              if (o.value === 'days') return viewWeather.days;
              if (o.value === 'events') return viewWeather.events;
              return viewWeather.days && viewWeather.events; // days-and-events
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
