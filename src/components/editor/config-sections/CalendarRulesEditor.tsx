'use client';

import type { ReactNode } from 'react';
import Button from '@/components/ui/Button';
import ColorPicker from '@/components/ui/ColorPicker';
import IconField from '@/components/ui/IconField';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { getLocalizedMonthNames } from '@/lib/meal-constants';
import { starterDayArtPath } from '@/lib/starter-day-art';
import { createTZDate } from '@/lib/timezone';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import type {
  CalendarDayRule,
  CalendarEventMatch,
  CalendarEventRule,
  CalendarNthWeek,
  CalendarRuleTextMatch,
} from '@/types/config';
import DayArtPicker from '../DayArtPicker';
import type { CalendarSource } from './CalendarSourceFilter';
import {
  RuleCard,
  RuleGroupLabel as GroupLabel,
  moveRule as move,
  newRuleId as newId,
  otherRuleNames,
  replaceRuleAt as replaceAt,
  useExpandedRules,
} from './RuleListCard';

/**
 * Editor for the two calendar rules lists ("Event looks" and "Day looks").
 * Shared by both calendar config sections; strings live under one
 * `configSections.calendarRules` prefix since the controls are identical.
 * Every edit writes the whole list back through `onChange`, so each change
 * is one autosave / one undo step.
 */

const KEY = 'configSections.calendarRules';
const DEFAULT_RULE_COLOR = '#3b82f6';
const DEFAULT_BADGE_COLOR = '#f97316';
const DEFAULT_DAY_BG = '#fef3c7';

type DayWhich = 'any' | 'today' | 'past' | 'future' | 'specific';
type SpecificPattern = 'monthly-day' | 'yearly-day' | 'whole-month' | 'last-day' | 'nth-weekday';
const ORDINAL_OPTIONS = [
  { value: '1', key: 'ordFirst' }, { value: '2', key: 'ordSecond' }, { value: '3', key: 'ordThird' },
  { value: '4', key: 'ordFourth' }, { value: '5', key: 'ordFifth' }, { value: 'last', key: 'ordLast' },
] as const;

/** Drops empty-string / empty-array values so a cleared field really clears. */
function compactMatch(match: CalendarEventMatch): CalendarEventMatch {
  const out: CalendarEventMatch = {};
  if (match.text?.trim()) out.text = match.text;
  if (match.textMatch && match.textMatch !== 'contains') out.textMatch = match.textMatch;
  if (match.sourceIds && match.sourceIds.length > 0) out.sourceIds = match.sourceIds;
  if (match.location?.trim()) out.location = match.location;
  if (match.allDay != null) out.allDay = match.allDay;
  if (match.past != null) out.past = match.past;
  if (match.kind) out.kind = match.kind;
  return out;
}

/** An empty match is legal and useful ("fade everything that has ended" is one
 *  field), but a fresh rule starts empty — so say out loud that it currently
 *  covers every event before someone hides the whole calendar with one click. */
function MatchesEverythingNote({ children }: { children: ReactNode }) {
  return <span className="text-[11px] text-hs-warning-ink" data-matches-everything="">{children}</span>;
}

function isEmptyMatch(match: CalendarEventMatch | undefined): boolean {
  return !match || Object.keys(match).length === 0;
}

type TriState = 'any' | 'yes' | 'no';
function triOf(value: boolean | undefined): TriState {
  return value == null ? 'any' : value ? 'yes' : 'no';
}
function triTo(value: TriState): boolean | undefined {
  return value === 'any' ? undefined : value === 'yes';
}

function EventMatchFields({ match, availableSources, onChange }: {
  match: CalendarEventMatch;
  availableSources: CalendarSource[];
  onChange: (next: CalendarEventMatch) => void;
}) {
  const t = useTranslate('editor');
  const patch = (p: Partial<CalendarEventMatch>) => onChange(compactMatch({ ...match, ...p }));
  const sourceIds = match.sourceIds ?? [];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <LabeledSelect
          label={t(`${KEY}.title`)}
          value={match.textMatch ?? 'contains'}
          onChange={(v) => patch({ textMatch: v as CalendarRuleTextMatch })}
          options={[
            { value: 'contains', label: t(`${KEY}.textContains`) },
            { value: 'exact', label: t(`${KEY}.textExact`) },
            { value: 'regex', label: t(`${KEY}.textPattern`) },
          ]}
          fieldClassName="w-2/5"
        />
        <LabeledInput
          label={t(`${KEY}.titleText`)}
          value={match.text ?? ''}
          onChange={(v) => patch({ text: v })}
          placeholder={t(`${KEY}.titleTextPlaceholder`)}
          fieldClassName="flex-1"
        />
      </div>
      {availableSources.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-hs-text-muted">{t(`${KEY}.fromCalendars`)}</span>
          <div className="flex flex-wrap gap-1">
            {availableSources.map((src) => {
              const on = sourceIds.includes(src.id);
              return (
                <button
                  key={src.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => patch({ sourceIds: on ? sourceIds.filter((id) => id !== src.id) : [...sourceIds, src.id] })}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border ${on ? 'border-hs-accent bg-hs-accent/20 text-hs-text-body' : 'border-hs-border-strong text-hs-text-muted hover:text-hs-text-body'}`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: src.color }} />
                  {src.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <LabeledInput
        label={t(`${KEY}.location`)}
        value={match.location ?? ''}
        onChange={(v) => patch({ location: v })}
        placeholder={t(`${KEY}.locationPlaceholder`)}
      />
      <div className="flex flex-col gap-1.5">
        <LabeledSelect
          label={t(`${KEY}.allDay`)}
          value={triOf(match.allDay)}
          onChange={(v) => patch({ allDay: triTo(v as TriState) })}
          options={[
            { value: 'any', label: t(`${KEY}.either`) },
            { value: 'yes', label: t(`${KEY}.allDayOnly`) },
            { value: 'no', label: t(`${KEY}.timedOnly`) },
          ]}
        />
        <LabeledSelect
          label={t(`${KEY}.timing`)}
          value={triOf(match.past)}
          onChange={(v) => patch({ past: triTo(v as TriState) })}
          options={[
            { value: 'any', label: t(`${KEY}.either`) },
            { value: 'yes', label: t(`${KEY}.ended`) },
            { value: 'no', label: t(`${KEY}.notEnded`) },
          ]}
        />
        <LabeledSelect
          label={t(`${KEY}.kind`)}
          value={match.kind ?? 'any'}
          onChange={(v) => patch({ kind: v === 'any' ? undefined : (v as CalendarEventMatch['kind']) })}
          options={[
            { value: 'any', label: t(`${KEY}.either`) },
            { value: 'event', label: t(`${KEY}.kindEvent`) },
            { value: 'birthday', label: t(`${KEY}.kindBirthday`) },
            { value: 'holiday', label: t(`${KEY}.kindHoliday`) },
          ]}
        />
      </div>
    </div>
  );
}

function EventRuleFields({ rule, availableSources, onChange }: {
  rule: CalendarEventRule;
  availableSources: CalendarSource[];
  onChange: (next: CalendarEventRule) => void;
}) {
  const t = useTranslate('editor');
  const patch = (p: Partial<CalendarEventRule>) => onChange({ ...rule, ...p });
  const hide = rule.hide === true;
  const matchesEverything = isEmptyMatch(rule.match);

  return (
    <>
      <GroupLabel>{t(`${KEY}.when`)}</GroupLabel>
      <EventMatchFields match={rule.match ?? {}} availableSources={availableSources} onChange={(match) => patch({ match })} />
      {matchesEverything && <MatchesEverythingNote>{t(`${KEY}.matchesEveryEvent`)}</MatchesEverythingNote>}
      <GroupLabel>{t(`${KEY}.then`)}</GroupLabel>
      {/* Hiding with an empty match empties the calendar; require one filled
          field first rather than making a blank display one click away. */}
      <Toggle label={t(`${KEY}.hide`)} checked={hide} onChange={(v) => patch({ hide: v || undefined })} disabled={matchesEverything && !hide} />
      {!hide && (
        <div className="flex flex-col gap-1.5">
          <Toggle
            label={t(`${KEY}.changeColor`)}
            checked={rule.color != null}
            onChange={(v) => patch({ color: v ? DEFAULT_RULE_COLOR : undefined })}
          />
          {rule.color != null && (
            <ColorPicker label={t(`${KEY}.color`)} value={rule.color} onChange={(v) => patch({ color: v })} />
          )}
          <Slider
            label={t(`${KEY}.fade`)}
            value={Math.round((rule.opacity ?? 1) * 100)}
            min={10}
            max={100}
            step={5}
            displayValue={`${Math.round((rule.opacity ?? 1) * 100)}%`}
            onChange={(v) => patch({ opacity: v >= 100 ? undefined : v / 100 })}
          />
          {/* Full width rather than paired: the icon picker's trigger needs
              room for the picked icon's name, and "Show title as" wrapped to
              two lines at half width. */}
          <IconField
            label={t(`${KEY}.icon`)}
            value={rule.icon}
            onChange={(v) => patch({ icon: v })}
          />
          <LabeledInput
            label={t(`${KEY}.renameTo`)}
            value={rule.title ?? ''}
            onChange={(v) => patch({ title: v || undefined })}
            placeholder={t(`${KEY}.renamePlaceholder`)}
          />
        </div>
      )}
    </>
  );
}

/** Any of the date-pattern fields the Specific days choice owns. */
function hasSpecificFields(match: CalendarDayRule['match']): boolean {
  return match.dayOfMonth != null || match.lastDayOfMonth === true
    || match.weekdayOfMonth != null || (match.months?.length ?? 0) > 0;
}

type DayBgMode = 'none' | 'auto' | 'color' | 'picture';
function bgModeOf(background: string | undefined): DayBgMode {
  if (!background) return 'none';
  return background === 'auto' ? 'auto' : 'color';
}

function DayRuleFields({ rule, availableSources, onChange }: {
  rule: CalendarDayRule;
  availableSources: CalendarSource[];
  onChange: (next: CalendarDayRule) => void;
}) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const formattingLocale = useFormattingLocale();
  const timezone = useEditorHouseholdTimezone();
  // A new yearly pattern starts on the household's current month, which is
  // the one the wall is showing, not the laptop's.
  const thisMonth = () => createTZDate(timezone).getMonth();
  const patch = (p: Partial<CalendarDayRule>) => onChange({ ...rule, ...p });
  const match = rule.match ?? {};
  const patchMatch = (p: Partial<CalendarDayRule['match']>) => {
    const next = { ...match, ...p };
    if (next.when == null) delete next.when;
    if (!next.daysOfWeek || next.daysOfWeek.length === 0) delete next.daysOfWeek;
    if (next.withEvents == null) delete next.withEvents;
    if (next.withEvents !== 'matching') delete next.eventMatch;
    if (next.dayOfMonth == null) delete next.dayOfMonth;
    if (!next.lastDayOfMonth) delete next.lastDayOfMonth;
    if (!next.weekdayOfMonth) delete next.weekdayOfMonth;
    if (!next.months || next.months.length === 0) delete next.months;
    // The Which days select is one choice, and Specific days is it: a
    // `when` that a hand-edited or imported rule still carries alongside a
    // date pattern is invisible here yet ANDs on the wall, so the first
    // edit settles it in the select's favor.
    if (hasSpecificFields(next)) delete next.when;
    patch({ match: next });
  };
  const days = match.daysOfWeek ?? [];
  const dayLabels = [
    tCore('days.sunday'), tCore('days.monday'), tCore('days.tuesday'), tCore('days.wednesday'),
    tCore('days.thursday'), tCore('days.friday'), tCore('days.saturday'),
  ];
  const monthLabels = getLocalizedMonthNames(formattingLocale);
  const specificSet = hasSpecificFields(match);
  const whichDays: DayWhich = specificSet ? 'specific' : (match.when ?? 'any');
  // Every legal combination of the date fields maps to one pattern, so a
  // rule written by hand renders as what the wall does with it.
  const pattern: SpecificPattern = match.weekdayOfMonth
    ? 'nth-weekday'
    : match.lastDayOfMonth
      ? 'last-day'
      : match.dayOfMonth != null
        ? ((match.months?.length ?? 0) > 0 ? 'yearly-day' : 'monthly-day')
        : 'whole-month';
  const monthValue = match.months?.length ? String(match.months[0]) : '';
  const bgMode: DayBgMode = rule.backgroundImage ? 'picture' : bgModeOf(rule.background);
  // A plain color under a picture stays the cell fill on the wall, so it
  // stays editable here even though the Background select reads Picture.
  const showColor = bgMode === 'color' || (bgMode === 'picture' && rule.background != null && rule.background !== 'auto');
  const hasBadge = rule.badgeIcon != null || rule.badgeText != null || rule.badgeColor != null;
  const matchesEveryDay = Object.keys(match).length === 0;

  return (
    <>
      <GroupLabel>{t(`${KEY}.when`)}</GroupLabel>
      <LabeledSelect
        label={t(`${KEY}.whichDays`)}
        value={whichDays}
        onChange={(v) => {
          if (v === 'specific') {
            // Entering specific-days mode seeds a minimal pattern and drops
            // `when` and any picked weekdays so the dropdown stays a single
            // clean choice.
            if (match.dayOfMonth == null && !match.lastDayOfMonth && !match.weekdayOfMonth) {
              patchMatch({ when: undefined, daysOfWeek: undefined, dayOfMonth: 1 });
            } else {
              patchMatch({ when: undefined, daysOfWeek: undefined });
            }
          } else {
            patchMatch({
              when: v === 'any' ? undefined : (v as CalendarDayRule['match']['when']),
              dayOfMonth: undefined,
              lastDayOfMonth: undefined,
              weekdayOfMonth: undefined,
              months: undefined,
            });
          }
        }}
        options={[
          { value: 'any', label: t(`${KEY}.anyDay`) },
          { value: 'today', label: t(`${KEY}.today`) },
          { value: 'past', label: t(`${KEY}.pastDays`) },
          { value: 'future', label: t(`${KEY}.futureDays`) },
          { value: 'specific', label: t(`${KEY}.specificDays`) },
        ]}
      />
      {whichDays === 'specific' && (
        <>
          <LabeledSelect
            label={t(`${KEY}.pattern`)}
            value={pattern}
            onChange={(v) => {
              const cleared = { dayOfMonth: undefined, lastDayOfMonth: undefined, weekdayOfMonth: undefined, months: undefined };
              if (v === 'monthly-day') {
                patchMatch({ ...cleared, dayOfMonth: match.dayOfMonth ?? 1 });
              } else if (v === 'yearly-day') {
                patchMatch({ ...cleared, dayOfMonth: match.dayOfMonth ?? 1, months: match.months?.length ? match.months : [thisMonth()] });
              } else if (v === 'whole-month') {
                patchMatch({ ...cleared, months: match.months?.length ? match.months : [thisMonth()] });
              } else if (v === 'last-day') {
                patchMatch({ ...cleared, lastDayOfMonth: true, months: match.months });
              } else {
                patchMatch({ ...cleared, months: match.months, weekdayOfMonth: match.weekdayOfMonth ?? { week: 1, weekday: 1 } });
              }
            }}
            options={[
              { value: 'monthly-day', label: t(`${KEY}.patternMonthlyDay`) },
              { value: 'yearly-day', label: t(`${KEY}.patternYearlyDay`) },
              { value: 'whole-month', label: t(`${KEY}.patternWholeMonth`) },
              { value: 'last-day', label: t(`${KEY}.patternLastDay`) },
              { value: 'nth-weekday', label: t(`${KEY}.patternNthWeekday`) },
            ]}
          />
          {pattern !== 'monthly-day' && (
            <LabeledSelect
              label={t(`${KEY}.month`)}
              value={monthValue}
              onChange={(v) => patchMatch({ months: v === '' ? undefined : [Number(v)] })}
              options={[
                // Yearly and whole-month are nothing without a month; the
                // other patterns allow "every month".
                ...(pattern === 'yearly-day' || pattern === 'whole-month' ? [] : [{ value: '', label: t(`${KEY}.everyMonth`) }]),
                ...monthLabels.map((label, i) => ({ value: String(i), label })),
              ]}
            />
          )}
          {(pattern === 'monthly-day' || pattern === 'yearly-day') && (
            <LabeledSelect
              label={t(`${KEY}.dayNumber`)}
              value={String(match.dayOfMonth ?? 1)}
              onChange={(v) => patchMatch({ dayOfMonth: Number(v) })}
              options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
            />
          )}
          {pattern === 'nth-weekday' && (
            <div className="flex gap-1.5">
              <LabeledSelect
                label={t(`${KEY}.whichOne`)}
                value={match.weekdayOfMonth ? String(match.weekdayOfMonth.week) : '1'}
                onChange={(v) => patchMatch({
                  weekdayOfMonth: {
                    week: (v === 'last' ? 'last' : Number(v)) as CalendarNthWeek,
                    weekday: match.weekdayOfMonth?.weekday ?? 1,
                  },
                })}
                options={ORDINAL_OPTIONS.map((o) => ({ value: o.value, label: t(`${KEY}.${o.key}`) }))}
                fieldClassName="w-2/5"
              />
              <LabeledSelect
                label={t(`${KEY}.weekday`)}
                value={String(match.weekdayOfMonth?.weekday ?? 1)}
                onChange={(v) => patchMatch({
                  weekdayOfMonth: { week: match.weekdayOfMonth?.week ?? 1, weekday: Number(v) },
                })}
                options={dayLabels.map((label, dow) => ({ value: String(dow), label }))}
                fieldClassName="flex-1"
              />
            </div>
          )}
        </>
      )}
      {/* Specific days owns the whole date question, so the plain weekday
          row hides under it (the nth-weekday pattern picks its own weekday),
          unless a hand-edited rule still carries picks: those AND on the
          wall, so they stay visible until unpicked. */}
      {(whichDays !== 'specific' || days.length > 0) && (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-hs-text-muted">{t(`${KEY}.daysOfWeek`)}</span>
        <div className="flex gap-1">
          {dayLabels.map((label, dow) => {
            const on = days.includes(dow);
            return (
              <button
                key={dow}
                type="button"
                aria-pressed={on}
                aria-label={label}
                title={label}
                onClick={() => patchMatch({ daysOfWeek: on ? days.filter((d) => d !== dow) : [...days, dow].sort() })}
                className={`flex-1 rounded py-0.5 text-[11px] font-semibold border ${on ? 'border-hs-accent bg-hs-accent/20 text-hs-text-body' : 'border-hs-border-strong text-hs-text-muted hover:text-hs-text-body'}`}
              >
                {label.slice(0, 1)}
              </button>
            );
          })}
        </div>
      </div>
      )}
      <LabeledSelect
        label={t(`${KEY}.eventsOnDay`)}
        value={match.withEvents ?? 'ignore'}
        onChange={(v) => patchMatch({ withEvents: v === 'ignore' ? undefined : (v as CalendarDayRule['match']['withEvents']) })}
        options={[
          { value: 'ignore', label: t(`${KEY}.either`) },
          { value: 'any', label: t(`${KEY}.hasEvents`) },
          { value: 'none', label: t(`${KEY}.noEvents`) },
          { value: 'matching', label: t(`${KEY}.hasMatchingEvent`) },
        ]}
      />
      {match.withEvents === 'matching' && (
        <div className="rounded border border-hs-border-strong/60 p-2">
          <EventMatchFields match={match.eventMatch ?? {}} availableSources={availableSources} onChange={(eventMatch) => patchMatch({ eventMatch })} />
        </div>
      )}
      {matchesEveryDay && <MatchesEverythingNote>{t(`${KEY}.matchesEveryDay`)}</MatchesEverythingNote>}

      <GroupLabel>{t(`${KEY}.then`)}</GroupLabel>
      <LabeledSelect
        label={t(`${KEY}.background`)}
        value={bgMode}
        onChange={(v) => {
          if (v === 'picture') {
            patch({ backgroundImage: starterDayArtPath('celebrate'), background: undefined });
          } else {
            patch({
              backgroundImage: undefined,
              backgroundDim: undefined,
              backgroundScale: undefined,
              backgroundPositionX: undefined,
              backgroundPositionY: undefined,
              background: v === 'none' ? undefined : v === 'auto' ? 'auto' : DEFAULT_DAY_BG,
            });
          }
        }}
        options={[
          { value: 'none', label: t(`${KEY}.noChange`) },
          { value: 'auto', label: t(`${KEY}.backgroundAuto`) },
          { value: 'color', label: t(`${KEY}.backgroundColor`) },
          { value: 'picture', label: t(`${KEY}.backgroundPicture`) },
        ]}
      />
      {bgMode === 'picture' && (
        <>
          <DayArtPicker value={rule.backgroundImage} onChange={(url) => patch({ backgroundImage: url })} />
          <Slider
            label={t(`${KEY}.artDimming`)}
            value={Math.round((rule.backgroundDim ?? 0.4) * 100)}
            min={0}
            max={90}
            step={5}
            displayValue={`${Math.round((rule.backgroundDim ?? 0.4) * 100)}%`}
            onChange={(v) => patch({ backgroundDim: v === 40 ? undefined : v / 100 })}
          />
          <Slider
            label={t(`${KEY}.artScale`)}
            value={rule.backgroundScale ?? 100}
            min={10}
            max={100}
            step={2}
            displayValue={`${rule.backgroundScale ?? 100}%`}
            onChange={(v) => patch({ backgroundScale: v === 100 ? undefined : v })}
          />
          <Slider
            label={t(`${KEY}.artPositionX`)}
            value={rule.backgroundPositionX ?? 50}
            min={0}
            max={100}
            step={2}
            displayValue={`${rule.backgroundPositionX ?? 50}%`}
            onChange={(v) => patch({ backgroundPositionX: v === 50 ? undefined : v })}
          />
          <Slider
            label={t(`${KEY}.artPositionY`)}
            value={rule.backgroundPositionY ?? 50}
            min={0}
            max={100}
            step={2}
            displayValue={`${rule.backgroundPositionY ?? 50}%`}
            onChange={(v) => patch({ backgroundPositionY: v === 50 ? undefined : v })}
          />
        </>
      )}
      {showColor && (
        <ColorPicker label={t(`${KEY}.color`)} value={rule.background ?? DEFAULT_DAY_BG} onChange={(v) => patch({ background: v })} />
      )}
      <Slider
        label={t(`${KEY}.fade`)}
        value={Math.round((rule.opacity ?? 1) * 100)}
        min={10}
        max={100}
        step={5}
        displayValue={`${Math.round((rule.opacity ?? 1) * 100)}%`}
        onChange={(v) => patch({ opacity: v >= 100 ? undefined : v / 100 })}
      />
      <Toggle
        label={t(`${KEY}.outline`)}
        checked={rule.borderColor != null}
        onChange={(v) => patch({ borderColor: v ? DEFAULT_RULE_COLOR : undefined })}
      />
      {rule.borderColor != null && (
        <ColorPicker label={t(`${KEY}.color`)} value={rule.borderColor} onChange={(v) => patch({ borderColor: v })} />
      )}
      <Toggle
        label={t(`${KEY}.badge`)}
        checked={hasBadge}
        onChange={(v) => patch(v ? { badgeIcon: '⭐', badgeColor: DEFAULT_BADGE_COLOR } : { badgeIcon: undefined, badgeText: undefined, badgeColor: undefined })}
      />
      {hasBadge && (
        <div className="flex flex-col gap-1.5">
          <IconField label={t(`${KEY}.badgeIcon`)} value={rule.badgeIcon} onChange={(v) => patch({ badgeIcon: v })} />
          <LabeledInput label={t(`${KEY}.badgeText`)} value={rule.badgeText ?? ''} onChange={(v) => patch({ badgeText: v || undefined })} placeholder={t(`${KEY}.badgeTextPlaceholder`)} />
          <Toggle
            label={t(`${KEY}.badgeFilled`)}
            checked={rule.badgeColor != null}
            onChange={(v) => patch({ badgeColor: v ? DEFAULT_BADGE_COLOR : undefined })}
          />
          {rule.badgeColor != null && (
            <ColorPicker label={t(`${KEY}.color`)} value={rule.badgeColor} onChange={(v) => patch({ badgeColor: v })} />
          )}
        </div>
      )}
    </>
  );
}

export function CalendarRulesEditor({ eventRules, dayRules, availableSources, onChange }: {
  eventRules: CalendarEventRule[] | undefined;
  dayRules: CalendarDayRule[] | undefined;
  availableSources: CalendarSource[];
  onChange: (patch: { eventRules?: CalendarEventRule[]; dayRules?: CalendarDayRule[] }) => void;
}) {
  const t = useTranslate('editor');
  const events = eventRules ?? [];
  const days = dayRules ?? [];
  const setEvents = (next: CalendarEventRule[]) => onChange({ eventRules: next.length > 0 ? next : undefined });
  const setDays = (next: CalendarDayRule[]) => onChange({ dayRules: next.length > 0 ? next : undefined });

  // Rules collapse one at a time so opening the group reads as a list, not a
  // wall of forms; a freshly added rule opens expanded so it can be filled in
  // right away. In-memory only — nothing about expansion is saved.
  const { expanded, toggle: toggleRule, expand } = useExpandedRules();

  return (
    <div className="flex flex-col gap-3" data-calendar-rules="">
      <div className="flex flex-col gap-2" data-rules-list="events">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-hs-text-body">{t(`${KEY}.eventLooks`)}</span>
          <span className="text-[11px] text-hs-text-muted">{t(`${KEY}.eventLooksHint`)}</span>
        </div>
        {events.map((rule, i) => (
          <RuleCard
            key={rule.id}
            index={i}
            total={events.length}
            name={rule.name}
            expanded={expanded.has(rule.id)}
            onToggle={() => toggleRule(rule.id)}
            onRename={(name) => setEvents(replaceAt(events, i, { ...rule, name }))}
            otherNames={otherRuleNames(events, i, (n) => t('configSections.ruleList.ruleTitle', { n }))}
            onMove={(to) => setEvents(move(events, i, to))}
            onRemove={() => setEvents(events.filter((r) => r.id !== rule.id))}
          >
            <EventRuleFields rule={rule} availableSources={availableSources} onChange={(next) => setEvents(replaceAt(events, i, next))} />
          </RuleCard>
        ))}
        <Button variant="secondary" size="sm" onClick={() => {
          const id = newId();
          setEvents([...events, { id, match: {} }]);
          expand(id);
        }}>
          {t(`${KEY}.addEventRule`)}
        </Button>
      </div>

      <div className="flex flex-col gap-2" data-rules-list="days">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-hs-text-body">{t(`${KEY}.dayLooks`)}</span>
          <span className="text-[11px] text-hs-text-muted">{t(`${KEY}.dayLooksHint`)}</span>
        </div>
        {days.map((rule, i) => (
          <RuleCard
            key={rule.id}
            index={i}
            total={days.length}
            name={rule.name}
            expanded={expanded.has(rule.id)}
            onToggle={() => toggleRule(rule.id)}
            onRename={(name) => setDays(replaceAt(days, i, { ...rule, name }))}
            otherNames={otherRuleNames(days, i, (n) => t('configSections.ruleList.ruleTitle', { n }))}
            onMove={(to) => setDays(move(days, i, to))}
            onRemove={() => setDays(days.filter((r) => r.id !== rule.id))}
          >
            <DayRuleFields rule={rule} availableSources={availableSources} onChange={(next) => setDays(replaceAt(days, i, next))} />
          </RuleCard>
        ))}
        <Button variant="secondary" size="sm" onClick={() => {
          const id = newId();
          setDays([...days, { id, match: {} }]);
          expand(id);
        }}>
          {t(`${KEY}.addDayRule`)}
        </Button>
      </div>
    </div>
  );
}
