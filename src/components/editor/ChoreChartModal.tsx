'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { asChoreSnapshot, ChoreSession, type ChoreSnapshot } from '@/lib/chore-client';
import { editorFetch, isSessionExpired, throwIfNotOk } from '@/lib/editor-fetch';
import { displayCache } from '@/lib/display-cache';
import FamilyManager from '@/components/family/FamilyManager';
import { useFamilyData } from '@/hooks/useFamilyData';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import Button from '@/components/ui/Button';
import CRUDModalShell from '@/components/editor/CRUDModalShell';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { useConfirmStore } from '@/stores/confirm-store';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import type {
  ChoreDefinition,
  ChoreResetFrequency,
  ChoreTimeOfDay,
  ChoreRotation,
} from '@/types/config';
import {
  getOrderedDays,
  resolveAssignee,
  choreAssigneeIds,
  choreAppliesToday,
  localDateStr,
  addChoreToList,
  updateChoreInList,
  removeChoreFromList,
  getTimeOfDayLabelKey,
} from '@/components/modules/chore-chart/types';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import ChoreIcon, {
  CHORE_ICONS,
} from '@/components/modules/chore-chart/ChoreIcon';
import { Users, X } from 'lucide-react';
import IconPicker from '@/components/modules/chore-chart/IconPicker';
import { useChoreForm, useChoreLabelMaps } from '@/components/modules/chore-chart/form-hooks';
import { buildChoreAssigneeLine, buildChoreSummaryLine, getChoreRotationSummaryKey } from '@/components/modules/chore-chart/chore-form-presentation';
import { groupMembers } from '@/lib/family-groups';
import { CHORE_FREQUENCIES, CHORE_ROTATIONS } from '@/lib/chore-constants';

// ── Props ─────────────────────────────────────────────────────────

interface ChoreChartModalProps {
  weekStartDay: 'sunday' | 'monday';
  accentColor: string;
  onClose: () => void;
}

// ── Chore Form ────────────────────────────────────────────────────

function ChoreForm({
  initial,
  members,
  groups,
  familyReady,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ChoreDefinition;
  members: FamilyMember[];
  groups: FamilyGroup[];
  /** False until the family list has loaded; the form holds saves until then. */
  familyReady: boolean;
  submitLabel: string;
  onSubmit: (data: Omit<ChoreDefinition, 'id'>) => void;
  onCancel: () => void;
}) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const tModules = useTranslate('modules');
  const formattingLocale = useFormattingLocale();
  // Day-of-week labels follow the formatting locale, not the UI language.
  // Memoize so re-renders during day toggles don't redo seven
  // `formatDateSync` calls each tick.
  const dayNamesShort = useMemo(
    () => getLocalizedDayNames(formattingLocale, 'short'),
    [formattingLocale],
  );

  const f = useChoreForm(initial, members, groups, familyReady);
  const {
    name, emoji, points, frequency, daysOfWeek, specificDate, timeOfDay,
    assigneeIds, assigneeGroupIds, rotation, schedule, groupSchedule, canRotate, coveredByGroup, goesToNobody,
    setName, setEmoji, setPoints, setFrequency, setSpecificDate, setTimeOfDay,
    switchToSchedule, switchFromSchedule, setRotation,
    toggleDay, toggleAssignee, toggleGroup, toggleScheduleDay, addMemberToSchedule, toggleGroupScheduleDay, addGroupToSchedule,
    removeMemberFromSchedule, removeGroupFromSchedule,
    scheduleMembers, scheduleGroups, scheduleDays, unscheduledMembers, unscheduledGroups,
    canSave, validationHintKind,
  } = f;
  const submit = () => f.submit(onSubmit);

  const { frequencyLabelMap, rotationLabelMap } = useChoreLabelMaps(tModules);

  return (
    <div className="bg-hs-card/60 rounded-lg p-3 space-y-3 border border-hs-border-strong">
      <input
        type="text"
        placeholder={t('choreChartModal.choreForm.namePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className={MODAL_INPUT_CLASS}
        autoFocus
      />

      <IconPicker
        value={emoji}
        onChange={setEmoji}
        icons={CHORE_ICONS}
        label={t('fields.icon')}
        variant="desktop"
        suggestedName={name}
      />

      {/* Points & Frequency */}
      <div className="flex gap-2">
        <label className="flex flex-col gap-0.5 w-20">
          <span className="text-xs text-hs-text-muted">{t('choreChartModal.choreForm.ticketsLabel')}</span>
          <input
            type="number"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            className={MODAL_INPUT_CLASS}
            min={0}
          />
        </label>
        <label className="flex flex-col gap-0.5 flex-1">
          <span className="text-xs text-hs-text-muted">{t('choreChartModal.choreForm.frequencyLabel')}</span>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as ChoreResetFrequency)}
            className={MODAL_INPUT_CLASS}
          >
            {CHORE_FREQUENCIES.map((opt) => (
              <option key={opt.value} value={opt.value}>{frequencyLabelMap[opt.value]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 flex-1">
          <span className="text-xs text-hs-text-muted">{t('choreChartModal.choreForm.timeOfDayLabel')}</span>
          <select
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value as ChoreTimeOfDay)}
            className={MODAL_INPUT_CLASS}
          >
            {(['morning', 'afternoon', 'evening', 'anytime'] as const).map((tod) => (
              <option key={tod} value={tod}>
                {tModules(getTimeOfDayLabelKey(tod))}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rotation !== 'schedule' && (
        <>
          {/* Days — date picker for one-time, day-of-week toggles for recurring */}
          <div className="space-y-1.5">
            <span className="text-xs text-hs-text-muted">
              {frequency === 'once' ? t('choreChartModal.choreForm.dateLabel') : t('fields.days')}
            </span>
            {frequency === 'once' ? (
              <input
                type="date"
                value={specificDate}
                onChange={(e) => setSpecificDate(e.target.value)}
                className={MODAL_INPUT_CLASS}
              />
            ) : (
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`flex-1 py-1 rounded text-xs font-medium transition-all ${
                      daysOfWeek.includes(d)
                        ? 'bg-hs-accent-soft text-hs-accent'
                        : 'bg-hs-card text-hs-text-faint hover:bg-hs-hover'
                    }`}
                  >
                    {dayNamesShort[d][0]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Assignees */}
          <div className="space-y-1.5">
            <span className="text-xs text-hs-text-muted">{t('choreChartModal.choreForm.assignToLabel')}</span>
            {/* A household that never made a group sees the form it always had. */}
            {groups.length > 0 && (
              <>
                <div className="text-[11px] text-hs-text-faint">{tModules('chore-chart.choreForm.groupsLabel')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      aria-pressed={assigneeGroupIds.includes(group.id)}
                      title={groupMembers(group, members).map((m) => m.name).join(', ')}
                      onClick={() => toggleGroup(group.id)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
                        assigneeGroupIds.includes(group.id)
                          ? 'bg-hs-accent-soft text-hs-accent ring-1 ring-hs-accent/30'
                          : 'bg-hs-card text-hs-text-faint hover:bg-hs-hover'
                      }`}
                    >
                      <span>{group.name}</span>
                      <span className="opacity-70">{groupMembers(group, members).length}</span>
                    </button>
                  ))}
                </div>
                <p className={`text-[11px] ${goesToNobody ? 'text-hs-warning' : 'text-hs-text-faint'}`}>
                  {tModules(goesToNobody ? 'chore-chart.choreForm.emptyGroupNote' : 'chore-chart.choreForm.groupsHint')}
                </p>
                <div className="text-[11px] text-hs-text-faint">{tModules('chore-chart.choreForm.peopleLabel')}</div>
              </>
            )}
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleAssignee(m.id)}
                  // Ticking a group does not tick its people, so show who it already covers.
                  title={coveredByGroup.has(m.id) ? tModules('chore-chart.choreForm.groupMemberNote', { group: coveredByGroup.get(m.id)!.join(', ') }) : undefined}
                  data-covered-by-group={coveredByGroup.has(m.id) || undefined}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
                    assigneeIds.includes(m.id)
                      ? 'bg-hs-accent-soft text-hs-accent ring-1 ring-hs-accent/30'
                      : coveredByGroup.has(m.id)
                        ? 'bg-hs-card text-hs-text-secondary outline-dashed outline-1 outline-hs-accent/50 hover:bg-hs-hover'
                        : 'bg-hs-card text-hs-text-faint hover:bg-hs-hover'
                  }`}
                >
                  {m.emoji && <ChoreIcon value={m.emoji} size={14} color="currentColor" />}
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Schedule grid (when rotation = schedule) */}
      {rotation === 'schedule' && (
        <div className="space-y-1.5">
          <span className="text-xs text-hs-text-muted">{t('choreChartModal.choreForm.weeklyScheduleLabel')}</span>
          {/* Day headers */}
          <div className="flex gap-0.5" style={{ paddingLeft: 125, paddingRight: 33 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <div key={d} className="flex-1 text-center text-[10px] font-semibold text-hs-text-faint">
                {dayNamesShort[d][0]}
              </div>
            ))}
          </div>
          {/* Member rows */}
          <div className="rounded-lg border border-hs-border-strong overflow-hidden">
            {/* A group's row is everyone in it, whoever that is on the day. */}
            {scheduleGroups.map((group) => {
              const groupDays = groupSchedule[group.id] ?? [];
              return (
                <div key={group.id} data-testid={`schedule-group-${group.id}`} className="flex items-center gap-1.5 pl-2 pr-1.5 py-1.5 border-b border-hs-border last:border-b-0">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center bg-hs-accent-soft text-hs-accent shrink-0">
                    <Users size={14} aria-hidden />
                  </div>
                  <span className="text-xs font-medium text-hs-text-body w-20 truncate shrink-0" title={`${group.name}: ${groupMembers(group, members).map((m) => m.name).join(', ')}`}>{group.name}</span>
                  <div className="flex gap-0.5 flex-1">
                    {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                      const isOn = groupDays.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={isOn}
                          aria-label={`${group.name}, ${dayNamesShort[d]}`}
                          onClick={() => toggleGroupScheduleDay(group.id, d)}
                          className={`flex-1 aspect-square rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                            isOn ? 'bg-hs-accent text-white' : 'bg-hs-card text-hs-text-faint'
                          }`}
                        >
                          {dayNamesShort[d][0]}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    aria-label={tModules('chore-chart.choreForm.removeFromSchedule', { name: group.name })}
                    title={tModules('chore-chart.choreForm.removeFromSchedule', { name: group.name })}
                    onClick={() => removeGroupFromSchedule(group.id)}
                    className="w-5 h-5 shrink-0 rounded flex items-center justify-center text-hs-text-faint hover:text-hs-danger hover:bg-hs-hover transition-colors"
                  >
                    <X size={12} aria-hidden />
                  </button>
                </div>
              );
            })}
            {scheduleMembers.map((memberId) => {
              const member = members.find((m) => m.id === memberId);
              if (!member) return null;
              const memberDays = schedule[memberId] ?? [];
              return (
                <div key={memberId} className="flex items-center gap-1.5 pl-2 pr-1.5 py-1.5 border-b border-hs-border last:border-b-0">
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ background: member.color }}
                  >
                    {member.emoji ? <ChoreIcon value={member.emoji} size={14} color="white" fallback={member.name[0]} /> : member.name[0]}
                  </div>
                  <span className="text-xs font-medium text-hs-text-body w-20 truncate shrink-0">{member.name}</span>
                  <div className="flex gap-0.5 flex-1">
                    {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                      const isOn = memberDays.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleScheduleDay(memberId, d)}
                          className={`flex-1 aspect-square rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                            isOn ? '' : 'bg-hs-card text-hs-text-faint'
                          }`}
                          style={isOn ? { background: member.color, color: 'white' } : undefined}
                        >
                          {dayNamesShort[d][0]}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    aria-label={tModules('chore-chart.choreForm.removeFromSchedule', { name: member.name })}
                    title={tModules('chore-chart.choreForm.removeFromSchedule', { name: member.name })}
                    onClick={() => removeMemberFromSchedule(memberId)}
                    className="w-5 h-5 shrink-0 rounded flex items-center justify-center text-hs-text-faint hover:text-hs-danger hover:bg-hs-hover transition-colors"
                  >
                    <X size={12} aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
          {goesToNobody && <p className="text-[11px] text-hs-warning">{tModules('chore-chart.choreForm.emptyGroupNote')}</p>}
          {/* Add group and member buttons */}
          {unscheduledMembers.length + unscheduledGroups.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {unscheduledGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  title={groupMembers(group, members).map((m) => m.name).join(', ')}
                  onClick={() => addGroupToSchedule(group.id)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-hs-card text-hs-text-faint hover:bg-hs-hover border border-dashed border-hs-border transition-all max-w-full"
                >
                  <span>+</span> <Users size={12} aria-hidden /> <span className="truncate">{group.name}</span>
                </button>
              ))}
              {unscheduledMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => addMemberToSchedule(m.id)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-hs-card text-hs-text-faint hover:bg-hs-hover border border-dashed border-hs-border transition-all"
                >
                  <span>+</span> {m.name}
                </button>
              ))}
            </div>
          )}
          {/* Coverage summary */}
          <div className="text-[11px] text-hs-text-faint flex items-center gap-1.5">
            <span>{t('choreChartModal.choreForm.coverageLabel', { covered: scheduleDays.length })}</span>
            {scheduleDays.length < 7 && (
              <>
                {' · '}
                <span className="text-hs-warning/70">
                  {tModules('chore-chart.choreForm.coverageUncovered', {
                    days: [0,1,2,3,4,5,6].filter((d) => !scheduleDays.includes(d)).map((d) => dayNamesShort[d]).join(', '),
                  })}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {members.length === 0 && <FamilyManager />}

      {/* Rotation (only when 2+ assignees and not a one-time chore) */}
      {frequency !== 'once' && canRotate && (
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-hs-text-muted">{t('fields.rotation')}</span>
          <select
            value={rotation}
            onChange={(e) => {
              const val = e.target.value as ChoreRotation;
              if (val === 'schedule') switchToSchedule();
              else if (rotation === 'schedule') switchFromSchedule(val);
              else setRotation(val);
            }}
            className={MODAL_INPUT_CLASS}
          >
            {CHORE_ROTATIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{rotationLabelMap[opt.value]}</option>
            ))}
          </select>
        </label>
      )}

      {validationHintKind && (
        <p className="text-xs text-hs-warning/80">
          {tModules(`chore-chart.choreForm.validation.${validationHintKind}`)}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <Button variant="primary" size="sm" onClick={submit} className="flex-1" disabled={!canSave}>
          {submitLabel}
        </Button>
        <Button size="sm" onClick={onCancel}>
          {tCore('actions.cancel')}
        </Button>
      </div>
    </div>
  );
}

// ── Weekly Preview ────────────────────────────────────────────────

function WeeklyPreview({
  chores,
  members,
  groups,
  weekStartDay,
  accentColor,
}: {
  chores: ChoreDefinition[];
  members: FamilyMember[];
  groups: FamilyGroup[];
  weekStartDay: 'sunday' | 'monday';
  accentColor: string;
}) {
  const t = useTranslate('editor');
  // The chore-summary vocabulary lives in the modules namespace so /remote and
  // /chores can render it without pulling the whole editor dictionary.
  const tModules = useTranslate('modules');
  const formattingLocale = useFormattingLocale();
  const dayNamesFull = useMemo(
    () => getLocalizedDayNames(formattingLocale, 'full'),
    [formattingLocale],
  );

  const days = getOrderedDays(weekStartDay);
  const today = new Date().getDay();

  const weekStartDow = weekStartDay === 'monday' ? 1 : 0;
  const getWeekDate = (day: number): Date => {
    const now = new Date();
    const daysFromWeekStart = ((now.getDay() - weekStartDow) + 7) % 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysFromWeekStart);
    const dayOffset = ((day - weekStartDow) + 7) % 7;
    const result = new Date(weekStart);
    result.setDate(weekStart.getDate() + dayOffset);
    return result;
  };

  const totals = useMemo(() => {
    const counts: Record<string, { chores: number; points: number }> = {};
    for (const m of members) {
      counts[m.id] = { chores: 0, points: 0 };
    }

    for (const day of days) {
      const dateStr = localDateStr(getWeekDate(day));

      for (const chore of chores) {
        if (!choreAppliesToday(chore, day, dateStr)) continue;
        const assignees = resolveAssignee(chore, dateStr, groups);
        for (const aid of assignees) {
          if (counts[aid]) {
            counts[aid].chores++;
            counts[aid].points += chore.points;
          }
        }
      }
    }

    return counts;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- getWeekDate is stable within a render (depends only on weekStartDow)
  }, [chores, members, groups, days]);

  return (
    <div className="space-y-3">
      {days.map((day) => {
        const isToday = day === today;
        const dateStr = localDateStr(getWeekDate(day));

        const dayChores = chores.filter((c) => choreAppliesToday(c, day, dateStr));

        return (
          <div key={day}>
            <div
              className="text-xs font-semibold mb-1"
              style={{
                color: isToday ? accentColor : undefined,
                opacity: isToday ? 1 : 0.6,
              }}
            >
              {isToday
                ? t('choreChartModal.preview.todayLabel', { day: dayNamesFull[day] })
                : dayNamesFull[day]}
            </div>
            {dayChores.length === 0 ? (
              <div className="text-[11px] text-hs-text-faint pl-2">{t('choreChartModal.preview.noChores')}</div>
            ) : (
              dayChores.map((chore) => {
                const assignees = resolveAssignee(chore, dateStr, groups);
                const isRotated = chore.rotation !== 'fixed' && choreAssigneeIds(chore, groups).length > 1;
                return (
                  <div
                    key={chore.id}
                    className="flex items-center gap-1.5 pl-2 py-0.5 text-[11px]"
                  >
                    {chore.emoji && <ChoreIcon value={chore.emoji} size={12} color="currentColor" />}
                    <span className="text-hs-text-secondary">{chore.name}</span>
                    <span className="text-hs-text-faint">{tModules('chore-chart.choreSummary.arrow')}</span>
                    {assignees.map((aid) => {
                      const m = members.find((x) => x.id === aid);
                      if (!m) return null;
                      return (
                        <span key={aid} className="flex items-center gap-0.5">
                          {m.emoji && <ChoreIcon value={m.emoji} size={11} color="currentColor" />}
                          {m.name}
                        </span>
                      );
                    })}
                    {isRotated && (
                      <span className="text-hs-text-faint text-[10px]">{tModules('chore-chart.choreSummary.rotatedShort')}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        );
      })}

      {/* Weekly totals */}
      <div className="pt-2 border-t border-hs-border-strong/50">
        <div className="text-xs font-semibold mb-1.5 opacity-60">
          {t('choreChartModal.preview.weeklyTotalsHeading')}
        </div>
        {members.map((m) => {
          const totalsForMember = totals[m.id];
          return (
            <div key={m.id} className="flex items-center gap-1.5 text-[11px] py-0.5 pl-2">
              {m.emoji && <ChoreIcon value={m.emoji} size={11} color="currentColor" />}
              <span className="text-hs-text-secondary">{m.name}:</span>
              <span className="text-hs-text-muted">
                {t('choreChartModal.preview.memberLine', {
                  chores: totalsForMember?.chores ?? 0,
                  tickets: totalsForMember?.points ?? 0,
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Chore Column ─────────────────────────────────────────────────

interface ChoreColumnProps {
  chores: ChoreDefinition[];
  members: FamilyMember[];
  groups: FamilyGroup[];
  choreSearch: string;
  showAddChore: boolean;
  editingChoreId: string | null;
  setChoreSearch: (v: string) => void;
  setShowAddChore: (v: boolean) => void;
  setEditingChoreId: (v: string | null) => void;
  deleteChore: (id: string) => void;
}

function ChoreColumn({
  chores,
  members,
  groups,
  choreSearch,
  showAddChore,
  editingChoreId,
  setChoreSearch,
  setShowAddChore,
  setEditingChoreId,
  deleteChore,
}: ChoreColumnProps) {
  const t = useTranslate('editor');
  const tModules = useTranslate('modules');
  // Day names on a chore row follow the formatting locale, not the UI language.
  const formattingLocale = useFormattingLocale();
  const dayNamesShort = useMemo(() => getLocalizedDayNames(formattingLocale, 'short'), [formattingLocale]);
  return (
    <div className="flex-1 border-r border-hs-border-strong flex flex-col min-w-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-hs-border-strong/50">
        <span className="text-xs font-semibold text-hs-text-muted uppercase tracking-wider">
          {t('choreChartModal.chores.columnTitle')}
        </span>
        {members.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setShowAddChore(true);
              setEditingChoreId(null);
            }}
            className="text-[11px] font-medium px-2 py-0.5 rounded bg-hs-card text-hs-text-body hover:bg-hs-hover transition-colors"
          >
            + {t('choreChartModal.chores.addButton')}
          </button>
        )}
      </div>

      {chores.length > 5 && (
        <div className="px-3 pt-2">
          <input
            type="text"
            placeholder={t('choreChartModal.chores.searchPlaceholder')}
            value={choreSearch}
            onChange={(e) => setChoreSearch(e.target.value)}
            className={MODAL_INPUT_CLASS}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {chores.length === 0 && !showAddChore && (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <p className="text-xs text-hs-text-faint">{t('choreChartModal.chores.empty')}</p>
            {members.length === 0 && (
              <p className="text-[11px] text-hs-text-faint">{t('choreChartModal.chores.addMembersFirst')}</p>
            )}
          </div>
        )}

        {chores
          .filter((c) => !choreSearch || c.name.toLowerCase().includes(choreSearch.toLowerCase()))
          .map((chore) => {
            const rotationKey = getChoreRotationSummaryKey(chore, groups);
            const rotationSuffix = rotationKey ? tModules(rotationKey) : null;
            return (
            <div
              key={chore.id}
              className={`group flex items-start gap-2.5 rounded-lg p-2.5 transition-colors border ${
                editingChoreId === chore.id
                  ? 'bg-hs-hover border-hs-border-strong'
                  : 'bg-hs-hover hover:bg-hs-card/70 border-transparent hover:border-hs-border-strong/50'
              }`}
            >
              <span className="w-5 h-5 mt-0.5 shrink-0 flex items-center justify-center text-hs-text-secondary">
                {chore.emoji ? (
                  <ChoreIcon value={chore.emoji} size={18} color="currentColor" />
                ) : (
                  <span className="w-4 h-4 rounded bg-hs-card" />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-hs-text-body truncate">
                  {chore.name}
                </div>
                <div className="text-[11px] text-hs-text-muted mt-0.5">
                  {buildChoreSummaryLine({ chore, t: tModules, dayNames: dayNamesShort })}
                </div>
                <div className="text-[11px] text-hs-text-muted mt-0.5">
                  {tModules('chore-chart.choreSummary.arrow')}{' '}
                  <span className={choreAssigneeIds(chore, groups).length === 0 ? 'text-hs-warning' : undefined}>
                    {buildChoreAssigneeLine({ chore, members, groups, unknownLabel: tModules('chore-chart.unknownAssignee'), nobodyLabel: tModules('chore-chart.choreSummary.nobody') })}
                  </span>
                  {rotationSuffix && (
                    <span className="text-hs-text-faint">
                      {' '}({rotationSuffix})
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingChoreId(chore.id);
                    setShowAddChore(false);
                  }}
                  className="w-6 h-6 rounded flex items-center justify-center text-hs-text-faint hover:text-hs-text-body hover:bg-hs-card transition-colors text-xs"
                  aria-label={t('choreChartModal.chores.editAriaLabel', { name: chore.name })}
                >
                  &#9998;
                </button>
                <button
                  type="button"
                  onClick={() => deleteChore(chore.id)}
                  className="w-6 h-6 rounded flex items-center justify-center text-hs-text-faint hover:text-hs-danger hover:bg-hs-card transition-colors text-xs"
                  aria-label={t('choreChartModal.chores.deleteAriaLabel', { name: chore.name })}
                >
                  &times;
                </button>
              </div>
            </div>
            );
          })}
      </div>
    </div>
  );
}

// ── Preview Column ───────────────────────────────────────────────

interface PreviewColumnProps {
  chores: ChoreDefinition[];
  members: FamilyMember[];
  groups: FamilyGroup[];
  familyReady: boolean;
  showAddChore: boolean;
  editingChoreId: string | null;
  weekStartDay: 'sunday' | 'monday';
  accentColor: string;
  addChore: (data: Omit<ChoreDefinition, 'id'>) => void;
  updateChore: (id: string, data: Omit<ChoreDefinition, 'id'>) => void;
  setShowAddChore: (v: boolean) => void;
  setEditingChoreId: (v: string | null) => void;
}

function PreviewColumn({
  chores,
  members,
  groups,
  familyReady,
  showAddChore,
  editingChoreId,
  weekStartDay,
  accentColor,
  addChore,
  updateChore,
  setShowAddChore,
  setEditingChoreId,
}: PreviewColumnProps) {
  const t = useTranslate('editor');
  let columnTitle: string;
  if (showAddChore) columnTitle = t('choreChartModal.preview.columnTitleNew');
  else if (editingChoreId) columnTitle = t('choreChartModal.preview.columnTitleEdit');
  else columnTitle = t('choreChartModal.preview.columnTitleSchedule');
  return (
    <div className={`${showAddChore || editingChoreId ? 'w-[450px]' : 'w-[280px]'} flex flex-col transition-all duration-200`}>
      <div className="px-3 py-2 border-b border-hs-border-strong/50">
        <span className="text-xs font-semibold text-hs-text-muted uppercase tracking-wider">
          {columnTitle}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {showAddChore ? (
          <ChoreForm
            members={members}
            groups={groups}
            familyReady={familyReady}
            submitLabel={t('choreChartModal.choreForm.addSubmit')}
            onSubmit={addChore}
            onCancel={() => setShowAddChore(false)}
          />
        ) : editingChoreId ? (
          <ChoreForm
            key={editingChoreId}
            initial={chores.find((c) => c.id === editingChoreId)}
            members={members}
            groups={groups}
            familyReady={familyReady}
            submitLabel={t('choreChartModal.choreForm.saveSubmit')}
            onSubmit={(data) => updateChore(editingChoreId, data)}
            onCancel={() => setEditingChoreId(null)}
          />
        ) : chores.length === 0 || members.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-xs text-hs-text-faint text-center">
              {t('choreChartModal.preview.placeholder')}
            </p>
          </div>
        ) : (
          <WeeklyPreview
            chores={chores}
            members={members}
            groups={groups}
            weekStartDay={weekStartDay}
            accentColor={accentColor}
          />
        )}
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────

export default function ChoreChartModal({
  weekStartDay,
  accentColor,
  onClose,
}: ChoreChartModalProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const { members, groups, revision: familyRevision } = useFamilyData();
  const [chores, setChores] = useState<ChoreDefinition[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState<'failed' | 'conflict' | null>(null);
  // Saves go through one session (`lib/chore-client.ts`): they run in order,
  // each quoting the revision the previous one was answered with, so a list
  // from an older copy cannot overwrite what a phone saved since.
  const [session] = useState(() => new ChoreSession(editorFetch));
  // A list the hub handed us (the load, a reload, or a conflict's current
  // copy) is already saved: the auto-save below must not send it back.
  const adoptedRef = useRef<ChoreDefinition[] | null>(null);
  const adoptChores = useCallback((snapshot: ChoreSnapshot) => {
    adoptedRef.current = snapshot.chores;
    session.adopt(snapshot);
    setChores(snapshot.chores);
  }, [session]);
  const [showAddChore, setShowAddChore] = useState(false);
  const [editingChoreId, setEditingChoreId] = useState<string | null>(null);
  const [choreSearch, setChoreSearch] = useState('');

  useEffect(() => {
    editorFetch('/api/chores/data')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const snapshot = asChoreSnapshot(json);
        if (!snapshot) throw new Error('Malformed chore data');
        adoptChores(snapshot);
        setLoaded(true);
      })
      .catch(() => setLoadError(true));
  }, [adoptChores]);

  const { flush: flushSave } = useDebouncedSave({
    values: [chores],
    enabled: loaded,
    save: async () => {
      if (chores === adoptedRef.current) return;
      const outcome = await session.save(chores, chores.length === 0);
      // Somebody else saved first. Show their list rather than replace it;
      // the change made here has to be made again on top of it.
      if (outcome.kind === 'conflict') {
        adoptChores(outcome.snapshot);
        setSaveError('conflict');
        return;
      }
      if (outcome.kind === 'superseded') return;
      setSaveError(null);
      displayCache.invalidate('/api/chores/data');
    },
    // The read path above already surfaced failures via `loadError`; the write
    // path checked nothing (the session now rejects), so a 500 left the edit
    // on screen and gone on reload.
    onError: (err) => {
      if (isSessionExpired(err)) return;
      setSaveError('failed');
    },
  });

  // ── Chore CRUD ──
  const addChore = (data: Omit<ChoreDefinition, 'id'>) => {
    setChores((prev) => addChoreToList(prev, data));
    setShowAddChore(false);
  };

  const updateChore = (id: string, data: Omit<ChoreDefinition, 'id'>) => {
    setChores((prev) => updateChoreInList(prev, id, data));
    setEditingChoreId(null);
  };

  const deleteChore = async (id: string) => {
    const chore = chores.find((c) => c.id === id);
    if (!chore) return;
    const ok = await useConfirmStore.getState().confirm({
      title: t('choreChartModal.chores.deleteConfirm.title'),
      message: t('choreChartModal.chores.deleteConfirm.message', { name: chore.name }),
      confirmLabel: t('choreChartModal.chores.deleteConfirm.confirmLabel'),
      variant: 'danger',
    });
    if (!ok) return;
    setChores((prev) => removeChoreFromList(prev, id));
  };

  return (
    <CRUDModalShell
      title={t('choreChartModal.title')}
      subtitle={t('choreChartModal.subtitleMembersChores', { members: members.length, chores: chores.length })}
      maxWidth="max-w-6xl"
      onClose={() => { flushSave(); displayCache.invalidate('/api/chores/data'); onClose(); }}
    >
      {loadError && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-hs-danger/10 border border-hs-danger/30 text-hs-danger text-xs">
          {t('choreChartModal.loadError')}
        </div>
      )}
      {saveError && (
        <div role="alert" className="mx-4 mt-3 px-3 py-2 rounded-lg bg-hs-danger/10 border border-hs-danger/30 text-hs-danger text-xs">
          {saveError === 'conflict' ? t('choreChartModal.changedElsewhere') : t('common.saveError')}
        </div>
      )}
      {/* Nothing is editable until the store is in hand. The columns start
          empty, and the load below replaces whatever is in state when it
          lands, so a member typed into an "empty" chart before then was both
          discarded by the load AND never saved (the debounced saver is
          dormant while `loaded` is false). An error still renders the columns:
          the banner above already says the changes won't be saved. */}
      {!loaded && !loadError ? (
        <div className="flex flex-1 min-h-0 items-center justify-center text-sm text-hs-text-faint">
          {tCore('loading')}
        </div>
      ) : (
      <div className="flex flex-1 min-h-0">
          <div className="w-[300px] shrink-0 overflow-y-auto border-r border-hs-border-strong p-3">
            <FamilyManager chores={chores} onChanged={() => {
              void editorFetch('/api/chores/data').then(throwIfNotOk).then((res) => res.json()).then((json) => {
                const snapshot = asChoreSnapshot(json);
                if (!snapshot) throw new Error('Malformed chore data');
                adoptChores(snapshot);
              }).catch(() => setLoadError(true));
            }} />
          </div>
          <ChoreColumn
            chores={chores}
            members={members}
            groups={groups}
            choreSearch={choreSearch}
            showAddChore={showAddChore}
            editingChoreId={editingChoreId}
            setChoreSearch={setChoreSearch}
            setShowAddChore={setShowAddChore}
            setEditingChoreId={setEditingChoreId}
            deleteChore={deleteChore}
          />
          <PreviewColumn
            chores={chores}
            members={members}
            groups={groups}
            familyReady={familyRevision !== null}
            showAddChore={showAddChore}
            editingChoreId={editingChoreId}
            weekStartDay={weekStartDay}
            accentColor={accentColor}
            addChore={addChore}
            updateChore={updateChore}
            setShowAddChore={setShowAddChore}
            setEditingChoreId={setEditingChoreId}
          />
        </div>
      )}
    </CRUDModalShell>
  );
}
