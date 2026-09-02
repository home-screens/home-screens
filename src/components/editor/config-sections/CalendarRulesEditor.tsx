'use client';

import type { ReactNode } from 'react';
import Button from '@/components/ui/Button';
import ColorPicker from '@/components/ui/ColorPicker';
import IconField from '@/components/ui/IconField';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import { useTranslate } from '@/i18n';
import type {
  CalendarDayRule,
  CalendarEventMatch,
  CalendarEventRule,
  CalendarRuleTextMatch,
} from '@/types/config';
import type { CalendarSource } from './CalendarSourceFilter';

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

function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function replaceAt<T>(list: T[], index: number, item: T): T[] {
  return list.map((existing, i) => (i === index ? item : existing));
}

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

function RuleCard({ index, total, onMove, onRemove, children }: {
  index: number;
  total: number;
  onMove: (to: number) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const t = useTranslate('editor');
  return (
    <div className="flex flex-col gap-2 rounded-md border border-hs-border-strong bg-hs-card p-2.5" data-rule-card="">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-hs-text-body">{t(`${KEY}.ruleTitle`, { n: index + 1 })}</span>
        <div className="flex items-center gap-1">
          <button type="button" aria-label={t(`${KEY}.moveUp`)} title={t(`${KEY}.moveUp`)} disabled={index === 0} onClick={() => onMove(index - 1)} className="px-1 text-xs text-hs-text-muted hover:text-hs-text-body disabled:opacity-30">▲</button>
          <button type="button" aria-label={t(`${KEY}.moveDown`)} title={t(`${KEY}.moveDown`)} disabled={index === total - 1} onClick={() => onMove(index + 1)} className="px-1 text-xs text-hs-text-muted hover:text-hs-text-body disabled:opacity-30">▼</button>
          <button type="button" aria-label={t(`${KEY}.remove`)} title={t(`${KEY}.remove`)} onClick={onRemove} className="px-1 text-xs text-hs-text-muted hover:text-hs-danger">✕</button>
        </div>
      </div>
      {children}
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <span className="text-[10px] font-semibold uppercase tracking-wider text-hs-text-faint">{children}</span>;
}

/** An empty match is legal and useful ("fade everything that has ended" is one
 *  field), but a fresh rule starts empty — so say out loud that it currently
 *  covers every event before someone hides the whole calendar with one click. */
function MatchesEverythingNote({ children }: { children: ReactNode }) {
  return <span className="text-[11px] text-hs-warning" data-matches-everything="">{children}</span>;
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

type DayBgMode = 'none' | 'auto' | 'color';
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
  const patch = (p: Partial<CalendarDayRule>) => onChange({ ...rule, ...p });
  const match = rule.match ?? {};
  const patchMatch = (p: Partial<CalendarDayRule['match']>) => {
    const next = { ...match, ...p };
    if (next.when == null) delete next.when;
    if (!next.daysOfWeek || next.daysOfWeek.length === 0) delete next.daysOfWeek;
    if (next.withEvents == null) delete next.withEvents;
    if (next.withEvents !== 'matching') delete next.eventMatch;
    patch({ match: next });
  };
  const days = match.daysOfWeek ?? [];
  const dayLabels = [
    tCore('days.sunday'), tCore('days.monday'), tCore('days.tuesday'), tCore('days.wednesday'),
    tCore('days.thursday'), tCore('days.friday'), tCore('days.saturday'),
  ];
  const bgMode = bgModeOf(rule.background);
  const hasBadge = rule.badgeIcon != null || rule.badgeText != null || rule.badgeColor != null;
  const matchesEveryDay = Object.keys(match).length === 0;

  return (
    <>
      <GroupLabel>{t(`${KEY}.when`)}</GroupLabel>
      <LabeledSelect
        label={t(`${KEY}.whichDays`)}
        value={match.when ?? 'any'}
        onChange={(v) => patchMatch({ when: v === 'any' ? undefined : (v as CalendarDayRule['match']['when']) })}
        options={[
          { value: 'any', label: t(`${KEY}.anyDay`) },
          { value: 'today', label: t(`${KEY}.today`) },
          { value: 'past', label: t(`${KEY}.pastDays`) },
          { value: 'future', label: t(`${KEY}.futureDays`) },
        ]}
      />
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
        onChange={(v) => patch({ background: v === 'none' ? undefined : v === 'auto' ? 'auto' : DEFAULT_DAY_BG })}
        options={[
          { value: 'none', label: t(`${KEY}.noChange`) },
          { value: 'auto', label: t(`${KEY}.backgroundAuto`) },
          { value: 'color', label: t(`${KEY}.backgroundColor`) },
        ]}
      />
      {bgMode === 'color' && (
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

  return (
    <div className="flex flex-col gap-3" data-calendar-rules="">
      <div className="flex flex-col gap-2" data-rules-list="events">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-hs-text-body">{t(`${KEY}.eventLooks`)}</span>
          <span className="text-[11px] text-hs-text-muted">{t(`${KEY}.eventLooksHint`)}</span>
        </div>
        {events.map((rule, i) => (
          <RuleCard key={rule.id} index={i} total={events.length} onMove={(to) => setEvents(move(events, i, to))} onRemove={() => setEvents(events.filter((r) => r.id !== rule.id))}>
            <EventRuleFields rule={rule} availableSources={availableSources} onChange={(next) => setEvents(replaceAt(events, i, next))} />
          </RuleCard>
        ))}
        <Button variant="secondary" size="sm" onClick={() => setEvents([...events, { id: newId(), match: {} }])}>
          {t(`${KEY}.addEventRule`)}
        </Button>
      </div>

      <div className="flex flex-col gap-2" data-rules-list="days">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-hs-text-body">{t(`${KEY}.dayLooks`)}</span>
          <span className="text-[11px] text-hs-text-muted">{t(`${KEY}.dayLooksHint`)}</span>
        </div>
        {days.map((rule, i) => (
          <RuleCard key={rule.id} index={i} total={days.length} onMove={(to) => setDays(move(days, i, to))} onRemove={() => setDays(days.filter((r) => r.id !== rule.id))}>
            <DayRuleFields rule={rule} availableSources={availableSources} onChange={(next) => setDays(replaceAt(days, i, next))} />
          </RuleCard>
        ))}
        <Button variant="secondary" size="sm" onClick={() => setDays([...days, { id: newId(), match: {} }])}>
          {t(`${KEY}.addDayRule`)}
        </Button>
      </div>
    </div>
  );
}
