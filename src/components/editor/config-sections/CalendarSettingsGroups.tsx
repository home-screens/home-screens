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
import { CalendarPeopleFilter, LegendModeSelect, NameTagsToggle, ShowOnePersonToggle, useCalendarRoster } from './CalendarPeopleControls';
import { canPickAnotherView, CARD_SWITCH_MIN_HEIGHT } from '@/lib/calendar-wall-switch';
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

interface TouchConfig<V extends string> {
  eventTapDetails?: boolean;
  eventTapStyle?: EventTapStyle;
  addEvents?: boolean;
  wallViews?: V[];
  showOnePerson?: boolean;
}

/** The module's views for "Switch views on the wall": its own, all of them in order, and the wall's word for each. */
export interface TouchViews<V extends string> {
  home: V;
  order: readonly V[];
  labelFor: (view: V) => string;
}

/**
 * "Touch": whether a tap opens an event, how the details are drawn, whether a
 * tapped day offers "Add event" once adding events is on, and which views and
 * people the wall's buttons offer. Shared by both calendar modules.
 * `cardHeight` is the Calendar card's height, for the note that a short card
 * shows no buttons; the full-screen calendar passes none.
 */
export function CalendarTouchGroup<V extends string>({ keyPrefix, config: c, set, views, cardHeight }: {
  keyPrefix: CalendarKeyPrefix;
  config: TouchConfig<V>;
  set: (patch: Partial<TouchConfig<V>>) => void;
  views: TouchViews<V>;
  cardHeight?: number;
}) {
  const t = useTranslate('editor');
  const roster = useCalendarRoster();
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
      {c.eventTapDetails === true && <AddEventsToggle checked={c.addEvents !== false} onChange={(v) => set({ addEvents: v })} />}
      {c.eventTapDetails === true && (
        <>
          <WallViewsPicker views={views} picked={c.wallViews} onChange={(next) => set({ wallViews: next })} />
          <ShowOnePersonToggle checked={c.showOnePerson === true} onChange={(v) => set({ showOnePerson: v })} owners={roster.owners} />
          {cardHeight !== undefined && cardHeight < CARD_SWITCH_MIN_HEIGHT && ((c.wallViews?.length ?? 0) > 0 || c.showOnePerson === true) && (
            <p className="text-xs leading-relaxed text-hs-warning" data-testid="wall-switch-short-card">
              {t(`${KEY}.wallSwitchShortCard`, { min: CARD_SWITCH_MIN_HEIGHT, height: Math.round(cardHeight) })}
            </p>
          )}
        </>
      )}
    </CalendarGroup>
  );
}

/**
 * "Switch views on the wall": the module's views as a check list, the
 * calendar's own ticked for good, three more at most. What is ticked becomes
 * the row of view buttons on a touch wall.
 */
function WallViewsPicker<V extends string>({ views, picked, onChange }: { views: TouchViews<V>; picked: V[] | undefined; onChange: (next: V[]) => void }) {
  const t = useTranslate('editor');
  const { home, order, labelFor } = views;
  const ticked = new Set((picked ?? []).filter((view) => view !== home && order.includes(view)));
  const full = !canPickAnotherView(home, picked, order);
  const toggle = (view: V, on: boolean) =>
    onChange(order.filter((v) => v !== home && (v === view ? on : ticked.has(v))));
  const checkbox = 'rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0 disabled:opacity-60';
  return (
    <div className="flex flex-col gap-1" data-field-id="wallViews">
      <span className="text-xs text-hs-text-muted">{t(`${KEY}.wallViews`)}</span>
      <div className="rounded-md bg-hs-card border border-hs-border-strong">
        {order.map((view) => {
          const own = view === home;
          const on = own || ticked.has(view);
          const locked = own || (!on && full);
          return (
            <label
              key={view}
              data-wall-view-option={view}
              className={`flex items-center gap-2.5 px-3 py-1.5 ${locked ? 'cursor-default' : 'cursor-pointer hover:bg-hs-hover'}`}
            >
              <input type="checkbox" className={checkbox} checked={on} disabled={locked} onChange={(event) => toggle(view, event.target.checked)} />
              <span className={`text-sm truncate ${locked && !own ? 'text-hs-text-faint' : 'text-hs-text-body'}`}>{labelFor(view)}</span>
              {own && <span className="ml-auto text-[11px] text-hs-text-faint whitespace-nowrap">{t(`${KEY}.wallViewsOwn`)}</span>}
            </label>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-hs-text-muted">
        {full ? t(`${KEY}.wallViewsFull`) : t(`${KEY}.wallViewsHint`, { view: labelFor(home) })}
      </p>
    </div>
  );
}

/**
 * "Add events from a day" and its help line, for every calendar module that
 * opens a day. `hintClassName` lets a section draw the line like its other hints.
 */
export function AddEventsToggle({ checked, onChange, hintClassName = '-mt-1 text-[11px] text-hs-text-faint' }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  hintClassName?: string;
}) {
  const t = useTranslate('editor');
  return (
    <>
      <Toggle label={t(`${KEY}.addEvents`)} checked={checked} onChange={onChange} />
      <p className={hintClassName}>{t(`${KEY}.addEventsHelp`)}</p>
    </>
  );
}
