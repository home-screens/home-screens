'use client';

import type { ReactNode } from 'react';
import AccordionSection from '@/components/editor/AccordionSection';
import LabeledSelect from '@/components/ui/LabeledSelect';
import SectionHeading from '@/components/ui/SectionHeading';
import Toggle from '@/components/ui/Toggle';
import { useTranslate } from '@/i18n';
import { useEditorStore } from '@/stores/editor-store';
import type {
  CalendarDayRule, CalendarEventRule, CalendarLegendMode, CalendarLegendPlacement,
  CalendarPeopleFilter as CalendarPeopleFilterValue, CalendarTitleFilter, EventTapStyle,
} from '@/types/config';
import { CalendarDayNotesToggle } from './CalendarDayNotesToggle';
import { CalendarPeopleFilter, LegendModeSelect, NameTagsToggle, useCalendarRoster } from './CalendarPeopleControls';
import { CalendarSourceFilter, type CalendarSource } from './CalendarSourceFilter';
import { CalendarTitleFilterControl } from './CalendarTitleFilter';

/**
 * Shared grouping shell for the two calendar config sections. Both modules
 * render the same six groups in the same order — view picker (ungrouped),
 * What shows, <current view>, Event rows, Look, Advanced looks, Touch — so
 * learning one panel teaches the other. Headings are `SectionHeading` (the
 * same primitive `TextConfigSection` uses) and the rules live behind a
 * collapsed `AccordionSection`, because they are the tallest and least-often
 * touched block.
 */

const KEY = 'configSections.calendarGroups';

/** Heading for a group; renders nothing when the group has no visible rows,
 *  so a view whose group is entirely conditional never shows a bare label. */
export function CalendarGroup({ label, when = true, children }: {
  label: string;
  when?: boolean;
  children: ReactNode;
}) {
  if (!when) return null;
  return (
    <>
      <SectionHeading>{label}</SectionHeading>
      {children}
    </>
  );
}

export function useCalendarGroupLabels() {
  const t = useTranslate('editor');
  return {
    eventRows: t(`${KEY}.eventRows`),
    look: t(`${KEY}.look`),
    // whatShows and touch are whole shared groups (below) with their own headings.
    // advancedLooks is deliberately absent: CalendarRulesGroup owns that
    // heading and translates the key itself.
  };
}

/**
 * Collapsed home for the two rule lists. The badge reports how many rules
 * exist so collapsing never hides configured state — an empty list says so
 * rather than showing nothing, which would read the same as "not loaded".
 */
export function CalendarRulesGroup({ eventRules, dayRules, children }: {
  eventRules: CalendarEventRule[] | undefined;
  dayRules: CalendarDayRule[] | undefined;
  children: ReactNode;
}) {
  const t = useTranslate('editor');
  const count = (eventRules?.length ?? 0) + (dayRules?.length ?? 0);
  const badge = count === 0
    ? t(`${KEY}.ruleCountNone`)
    : count === 1
      ? t(`${KEY}.ruleCountOne`)
      : t(`${KEY}.ruleCountOther`, { count });
  return (
    <AccordionSection title={t(`${KEY}.advancedLooks`)} defaultOpen={false} badge={badge}>
      {children}
    </AccordionSection>
  );
}

/** Where each calendar module keeps its own wording in the `editor` dictionary. */
type CalendarKeyPrefix = 'configSections.calendar' | 'configSections.fullscreen-calendar';

// Stable selector fallback: a literal `?? []` inside a zustand selector
// re-renders forever when the key is absent (React #185, tab crash).
const EMPTY_IDS: string[] = [];

/** The fields of "What shows", the same on both calendar modules. */
interface WhatShowsConfig {
  sourceFilter?: string[];
  peopleFilter?: CalendarPeopleFilterValue;
  titleFilter?: CalendarTitleFilter;
  showLegend?: CalendarLegendPlacement;
  legendMode?: CalendarLegendMode;
  showNameTags?: boolean;
  showDayNotes?: boolean;
}

/**
 * "What shows": which calendars, people and titles come in, the colour key,
 * name tags and day notes. One group for both calendar modules, so a control
 * or a warning added here reaches both. The caller keeps `useCalendarSources`
 * (its rules editor needs the list too, and each call asks the hub for the
 * Google calendars) and hands over what it returned.
 */
export function CalendarWhatShowsGroup({ keyPrefix, config: c, set, availableSources, googleAuthError, nameTags = true }: {
  keyPrefix: CalendarKeyPrefix;
  config: WhatShowsConfig;
  set: (patch: Partial<WhatShowsConfig>) => void;
  availableSources: CalendarSource[];
  /** The hub's Google sign-in has run out, so its calendars cannot be named. */
  googleAuthError: boolean;
  /** Off in the views whose rows are people already, where a tag would say nothing. */
  nameTags?: boolean;
}) {
  const t = useTranslate('editor');
  const roster = useCalendarRoster();
  const googleCalendarIds = useEditorStore((s) => s.config?.settings?.calendar?.googleCalendarIds ?? EMPTY_IDS);
  const legendOptions: { value: CalendarLegendPlacement; label: string }[] = [
    { value: 'off', label: t(`${keyPrefix}.legendOff`) },
    { value: 'header', label: t(`${keyPrefix}.legendHeader`) },
    { value: 'footer', label: t(`${keyPrefix}.legendFooter`) },
  ];
  return (
    <CalendarGroup label={t(`${KEY}.whatShows`)}>
      {googleAuthError && googleCalendarIds.length > 0 && (
        <div className="rounded-md bg-hs-warning/20 border border-hs-warning/30 px-3 py-2 text-xs text-hs-warning">
          {t('configSections.calendar.googleAuthExpired')}
        </div>
      )}
      <CalendarSourceFilter
        keyPrefix={keyPrefix}
        availableSources={availableSources}
        sourceFilter={c.sourceFilter ?? []}
        onChange={(next) => set({ sourceFilter: next })}
      />
      <CalendarPeopleFilter value={c.peopleFilter} onChange={(next) => set({ peopleFilter: next })} members={roster.members} groups={roster.groups} owners={roster.owners} />
      <CalendarTitleFilterControl
        keyPrefix={keyPrefix}
        titleFilter={c.titleFilter}
        onChange={(next) => set({ titleFilter: next })}
      />
      <LabeledSelect
        label={t(`${keyPrefix}.showLegend`)}
        value={c.showLegend ?? 'off'}
        onChange={(v) => set({ showLegend: v })}
        options={legendOptions}
      />
      {(c.showLegend ?? 'off') !== 'off' && (
        <LegendModeSelect value={c.legendMode ?? 'calendars'} onChange={(next) => set({ legendMode: next })} owners={roster.owners} groups={roster.groups} />
      )}
      {nameTags && <NameTagsToggle checked={c.showNameTags === true} onChange={(next) => set({ showNameTags: next })} owners={roster.owners} />}
      <CalendarDayNotesToggle checked={c.showDayNotes !== false} onChange={(next) => set({ showDayNotes: next })} />
    </CalendarGroup>
  );
}

interface TouchConfig {
  eventTapDetails?: boolean;
  eventTapStyle?: EventTapStyle;
}

/** "Touch": whether a tap opens an event, and how the details are drawn. Shared by both calendar modules. */
export function CalendarTouchGroup({ keyPrefix, config: c, set }: {
  keyPrefix: CalendarKeyPrefix;
  config: TouchConfig;
  set: (patch: Partial<TouchConfig>) => void;
}) {
  const t = useTranslate('editor');
  const tapStyleOptions: { value: EventTapStyle; label: string }[] = [
    { value: 'sheet', label: t(`${keyPrefix}.eventTapStyleSheet`) },
    { value: 'card', label: t(`${keyPrefix}.eventTapStyleCard`) },
  ];
  return (
    <CalendarGroup label={t(`${KEY}.touch`)}>
      <Toggle label={t(`${keyPrefix}.eventTapDetails`)} checked={c.eventTapDetails === true} onChange={(v) => set({ eventTapDetails: v })} />
      {c.eventTapDetails === true && (
        <LabeledSelect
          label={t(`${keyPrefix}.eventTapStyle`)}
          value={c.eventTapStyle ?? 'sheet'}
          onChange={(v) => set({ eventTapStyle: v })}
          options={tapStyleOptions}
        />
      )}
    </CalendarGroup>
  );
}
