'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { uuid } from '@/lib/uuid';
import { displayCache } from '@/lib/display-cache';
import Button from '@/components/ui/Button';
import CRUDModalShell from '@/components/editor/CRUDModalShell';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import type {
  ChoreMember,
  ChoreDefinition,
  ChoreResetFrequency,
  ChoreTimeOfDay,
  ChoreRotation,
} from '@/types/config';
import {
  MEMBER_COLORS,
  DAY_NAMES_SHORT,
  DAY_NAMES_FULL,
  TIME_OF_DAY_META,
  getOrderedDays,
  resolveAssignee,
  choreAppliesToday,
  localDateStr,
  cascadeDeleteMember,
} from '@/components/modules/chore-chart/types';
import ChoreIcon, {
  MEMBER_ICONS,
  CHORE_ICONS,
  getIconDef,
  toLucideValue,
} from '@/components/modules/chore-chart/ChoreIcon';
import { CHORE_FREQUENCIES, CHORE_ROTATIONS } from '@/lib/chore-constants';

// ── Icon Picker ───────────────────────────────────────────────────

function IconPicker({
  value,
  onChange,
  icons,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  icons: string[];
  label: string;
}) {
  const [search, setSearch] = useState('');
  const showSearch = icons.length > 20;

  const filtered = search
    ? icons.filter((name) => {
        const def = getIconDef(name);
        if (!def) return false;
        const q = search.toLowerCase();
        return name.toLowerCase().includes(q) || def.label.toLowerCase().includes(q);
      })
    : icons;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-hs-text-muted">{label}</span>
        {value ? (
          <ChoreIcon value={value} size={22} />
        ) : (
          <span className="text-xs text-hs-text-faint">None</span>
        )}
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-[10px] text-hs-text-faint hover:text-hs-text-secondary ml-auto"
            aria-label={`Clear ${label.toLowerCase()}`}
          >
            Clear
          </button>
        )}
      </div>

      {showSearch && (
        <input
          type="text"
          placeholder="Filter icons..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={MODAL_INPUT_CLASS}
        />
      )}

      <div className="flex flex-wrap gap-1.5">
        {filtered.map((name) => {
          const def = getIconDef(name);
          if (!def) return null;
          const lucideVal = toLucideValue(name);
          const isSelected = value === lucideVal;
          const Icon = def.component;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(lucideVal)}
              className={`flex flex-col items-center gap-0.5 rounded-lg transition-all px-1.5 py-1.5 ${
                isSelected
                  ? 'ring-2 ring-white ring-offset-1 ring-offset-hs-panel scale-105'
                  : 'hover:scale-105 hover:brightness-125'
              }`}
              style={{
                backgroundColor: `${def.defaultColor}${isSelected ? '30' : '15'}`,
                color: def.defaultColor,
                width: 52,
              }}
            >
              <Icon size={22} strokeWidth={1.75} />
              <span className="text-[9px] leading-tight text-hs-text-muted truncate w-full text-center">
                {def.label}
              </span>
            </button>
          );
        })}
        {search && filtered.length === 0 && (
          <span className="text-xs text-hs-text-faint py-2">No matching icons</span>
        )}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────

interface ChoreChartModalProps {
  weekStartDay: 'sunday' | 'monday';
  accentColor: string;
  onClose: () => void;
}

// ── Member Form ───────────────────────────────────────────────────

function MemberForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ChoreMember;
  submitLabel: string;
  onSubmit: (data: Omit<ChoreMember, 'id'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [color, setColor] = useState(initial?.color ?? MEMBER_COLORS[0]);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), emoji, color });
  };

  return (
    <div className="bg-hs-card/60 rounded-lg p-3 space-y-3 border border-hs-border-strong">
      <input
        type="text"
        placeholder="Name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className={MODAL_INPUT_CLASS}
        autoFocus
      />

      <IconPicker
        value={emoji}
        onChange={setEmoji}
        icons={MEMBER_ICONS}
        label="Avatar"
      />

      {/* Color picker */}
      <div className="space-y-1.5">
        <span className="text-xs text-hs-text-muted">Color</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {MEMBER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full transition-all ${
                color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-hs-panel scale-110' : ''
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <label
            className="w-6 h-6 rounded-full cursor-pointer transition-all flex items-center justify-center border-2 border-dashed border-hs-border-strong hover:border-hs-text-secondary relative"
            style={!MEMBER_COLORS.includes(color) ? { backgroundColor: color, borderStyle: 'solid', borderColor: 'white' } : undefined}
            title="Pick custom color"
          >
            {MEMBER_COLORS.includes(color) && (
              <span className="text-hs-text-faint text-[10px] font-bold leading-none">+</span>
            )}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="opacity-0 w-0 h-0 absolute"
            />
          </label>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="primary" size="sm" onClick={submit} className="flex-1">
          {submitLabel}
        </Button>
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Chore Form ────────────────────────────────────────────────────

function ChoreForm({
  initial,
  members,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ChoreDefinition;
  members: ChoreMember[];
  submitLabel: string;
  onSubmit: (data: Omit<ChoreDefinition, 'id'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [points, setPoints] = useState(initial?.points?.toString() ?? '1');
  const [frequency, setFrequency] = useState<ChoreResetFrequency>(initial?.frequency ?? 'daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initial?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]);
  const [timeOfDay, setTimeOfDay] = useState<ChoreTimeOfDay>(initial?.timeOfDay ?? 'anytime');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initial?.assigneeIds ?? []);
  const [rotation, setRotation] = useState<ChoreRotation>(initial?.rotation ?? 'fixed');
  const [schedule, setSchedule] = useState<Record<string, number[]>>(
    initial?.schedule ?? {}
  );

  const switchToSchedule = () => {
    setRotation('schedule');
    if (Object.keys(schedule).length === 0) {
      const seeded: Record<string, number[]> = {};
      for (const id of assigneeIds) {
        seeded[id] = [...daysOfWeek];
      }
      setSchedule(seeded);
    }
  };

  const switchFromSchedule = (newRotation: ChoreRotation) => {
    const ids = Object.entries(schedule).filter(([, d]) => d.length > 0).map(([id]) => id);
    const days = [...new Set(Object.values(schedule).flat())].sort((a, b) => a - b);
    if (ids.length > 0) setAssigneeIds(ids);
    if (days.length > 0) setDaysOfWeek(days);
    setRotation(newRotation);
  };

  const toggleScheduleDay = (memberId: string, day: number) => {
    setSchedule((prev) => {
      const current = prev[memberId] ?? [];
      const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
      if (next.length === 0) {
        const { [memberId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [memberId]: next };
    });
  };

  const addMemberToSchedule = (memberId: string) => {
    setSchedule((prev) => ({ ...prev, [memberId]: [] }));
  };

  const scheduleMembers = Object.keys(schedule);
  const scheduleDays = [...new Set(Object.values(schedule).flat())].sort((a, b) => a - b);
  const unscheduledMembers = members.filter((m) => !scheduleMembers.includes(m.id));

  const toggleDay = (d: number) => {
    setDaysOfWeek((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const toggleAssignee = (id: string) => {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const scheduleHasAssignment = rotation === 'schedule'
    ? Object.values(schedule).some((days) => days.length > 0)
    : true;
  const canSave = name.trim().length > 0
    && (rotation === 'schedule' ? scheduleHasAssignment : assigneeIds.length > 0);
  const validationHint = !name.trim()
    ? 'Enter a chore name'
    : rotation === 'schedule' && !scheduleHasAssignment
      ? 'Add at least one person to the schedule'
      : rotation !== 'schedule' && assigneeIds.length === 0
        ? 'Select at least one person'
        : null;

  const submit = () => {
    if (!canSave) return;
    const isSchedule = rotation === 'schedule';
    const finalAssigneeIds = isSchedule
      ? Object.entries(schedule).filter(([, d]) => d.length > 0).map(([id]) => id)
      : assigneeIds;
    const finalDaysOfWeek = isSchedule
      ? [...new Set(Object.values(schedule).flat())].sort((a, b) => a - b)
      : daysOfWeek;
    onSubmit({
      name: name.trim(),
      emoji,
      points: Number.isNaN(parseInt(points)) ? 1 : parseInt(points),
      frequency,
      daysOfWeek: finalDaysOfWeek,
      timeOfDay,
      assigneeIds: finalAssigneeIds,
      rotation: finalAssigneeIds.length <= 1 && !isSchedule ? 'fixed' : rotation,
      ...(isSchedule ? { schedule: Object.fromEntries(Object.entries(schedule).filter(([, d]) => d.length > 0)) } : {}),
    });
  };

  return (
    <div className="bg-hs-card/60 rounded-lg p-3 space-y-3 border border-hs-border-strong">
      <input
        type="text"
        placeholder="Chore name..."
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
        label="Icon"
      />

      {/* Points & Frequency */}
      <div className="flex gap-2">
        <label className="flex flex-col gap-0.5 w-20">
          <span className="text-xs text-hs-text-muted">Points</span>
          <input
            type="number"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            className={MODAL_INPUT_CLASS}
            min={0}
          />
        </label>
        <label className="flex flex-col gap-0.5 flex-1">
          <span className="text-xs text-hs-text-muted">Frequency</span>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as ChoreResetFrequency)}
            className={MODAL_INPUT_CLASS}
          >
            {CHORE_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 flex-1">
          <span className="text-xs text-hs-text-muted">Time of Day</span>
          <select
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value as ChoreTimeOfDay)}
            className={MODAL_INPUT_CLASS}
          >
            {(['morning', 'afternoon', 'evening', 'anytime'] as const).map((t) => (
              <option key={t} value={t}>
                {TIME_OF_DAY_META[t].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rotation !== 'schedule' && (
        <>
          {/* Days of week */}
          <div className="space-y-1.5">
            <span className="text-xs text-hs-text-muted">Days</span>
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
                  {DAY_NAMES_SHORT[d][0]}
                </button>
              ))}
            </div>
          </div>

          {/* Assignees */}
          <div className="space-y-1.5">
            <span className="text-xs text-hs-text-muted">Assign to</span>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleAssignee(m.id)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
                    assigneeIds.includes(m.id)
                      ? 'bg-hs-accent-soft text-hs-accent ring-1 ring-hs-accent/30'
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
          <span className="text-xs text-hs-text-muted">Weekly Schedule</span>
          {/* Day headers */}
          <div className="flex gap-0.5" style={{ paddingLeft: 72 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <div key={d} className="flex-1 text-center text-[10px] font-semibold text-hs-text-faint">
                {DAY_NAMES_SHORT[d][0]}
              </div>
            ))}
          </div>
          {/* Member rows */}
          <div className="rounded-lg border border-hs-border-strong overflow-hidden">
            {scheduleMembers.map((memberId) => {
              const member = members.find((m) => m.id === memberId);
              if (!member) return null;
              const memberDays = schedule[memberId] ?? [];
              return (
                <div key={memberId} className="flex items-center gap-1.5 px-2 py-1.5 border-b border-hs-border last:border-b-0">
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ background: member.color }}
                  >
                    {member.emoji ? <ChoreIcon value={member.emoji} size={14} color="white" /> : member.name[0]}
                  </div>
                  <span className="text-xs font-medium text-hs-text-body w-12 truncate shrink-0">{member.name}</span>
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
                          {DAY_NAMES_SHORT[d][0]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Add member buttons */}
          {unscheduledMembers.length > 0 && (
            <div className="flex flex-wrap gap-1">
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
            <span>Coverage: {scheduleDays.length} of 7 days</span>
            {scheduleDays.length < 7 && (
              <span className="text-hs-warning/70">
                · {[0,1,2,3,4,5,6].filter((d) => !scheduleDays.includes(d)).map((d) => DAY_NAMES_SHORT[d]).join(', ')} uncovered
              </span>
            )}
          </div>
        </div>
      )}

      {/* Rotation (only when 2+ assignees) */}
      {(assigneeIds.length >= 2 || rotation === 'schedule') && (
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-hs-text-muted">Rotation</span>
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
            {CHORE_ROTATIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
      )}

      {validationHint && (
        <p className="text-xs text-hs-warning/80">{validationHint}</p>
      )}
      <div className="flex gap-2 pt-1">
        <Button variant="primary" size="sm" onClick={submit} className="flex-1" disabled={!canSave}>
          {submitLabel}
        </Button>
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Weekly Preview ────────────────────────────────────────────────

function WeeklyPreview({
  chores,
  members,
  weekStartDay,
  accentColor,
}: {
  chores: ChoreDefinition[];
  members: ChoreMember[];
  weekStartDay: 'sunday' | 'monday';
  accentColor: string;
}) {
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
        const assignees = resolveAssignee(chore, dateStr);
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
  }, [chores, members, days]);

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
              {isToday ? `Today (${DAY_NAMES_FULL[day]})` : DAY_NAMES_FULL[day]}
            </div>
            {dayChores.length === 0 ? (
              <div className="text-[11px] text-hs-text-faint pl-2">No chores</div>
            ) : (
              dayChores.map((chore) => {
                const assignees = resolveAssignee(chore, dateStr);
                const isRotated = chore.rotation !== 'fixed' && chore.assigneeIds.length > 1;
                return (
                  <div
                    key={chore.id}
                    className="flex items-center gap-1.5 pl-2 py-0.5 text-[11px]"
                  >
                    {chore.emoji && <ChoreIcon value={chore.emoji} size={12} color="currentColor" />}
                    <span className="text-hs-text-secondary">{chore.name}</span>
                    <span className="text-hs-text-faint">&rarr;</span>
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
                      <span className="text-hs-text-faint text-[10px]">&larr; rot</span>
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
          Weekly totals
        </div>
        {members.map((m) => {
          const t = totals[m.id];
          return (
            <div key={m.id} className="flex items-center gap-1.5 text-[11px] py-0.5 pl-2">
              {m.emoji && <ChoreIcon value={m.emoji} size={11} color="currentColor" />}
              <span className="text-hs-text-secondary">{m.name}:</span>
              <span className="text-hs-text-muted">
                {t?.chores ?? 0} chores, {t?.points ?? 0} pts
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Member Column ────────────────────────────────────────────────

interface MemberColumnProps {
  members: ChoreMember[];
  showAddMember: boolean;
  editingMemberId: string | null;
  setShowAddMember: (v: boolean) => void;
  setEditingMemberId: (v: string | null) => void;
  addMember: (data: Omit<ChoreMember, 'id'>) => void;
  updateMember: (id: string, data: Omit<ChoreMember, 'id'>) => void;
  deleteMember: (id: string) => void;
}

function MemberColumn({
  members,
  showAddMember,
  editingMemberId,
  setShowAddMember,
  setEditingMemberId,
  addMember,
  updateMember,
  deleteMember,
}: MemberColumnProps) {
  return (
    <div className="w-[260px] border-r border-hs-border-strong flex flex-col">
      <div className="px-3 py-2 border-b border-hs-border-strong/50">
        <span className="text-xs font-semibold text-hs-text-muted uppercase tracking-wider">
          Family Members
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5" style={{ scrollbarWidth: 'thin' }}>
        {members.length === 0 && !showAddMember && (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <p className="text-xs text-hs-text-faint">No members yet</p>
          </div>
        )}

        {members.map((member) =>
          editingMemberId === member.id ? (
            <MemberForm
              key={member.id}
              initial={member}
              submitLabel="Save"
              onSubmit={(data) => updateMember(member.id, data)}
              onCancel={() => setEditingMemberId(null)}
            />
          ) : (
            <div
              key={member.id}
              className="group flex items-center gap-2.5 bg-hs-hover hover:bg-hs-card/70 rounded-lg p-2.5 transition-colors border border-transparent hover:border-hs-border-strong/50"
            >
              <span className="w-6 h-6 flex items-center justify-center shrink-0" style={{ color: member.color }}>
                {member.emoji ? (
                  <ChoreIcon value={member.emoji} size={20} color={member.color} />
                ) : (
                  <span className="w-5 h-5 rounded-full" style={{ backgroundColor: member.color }} />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-hs-text-body truncate">{member.name}</div>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => {
                    setEditingMemberId(member.id);
                    setShowAddMember(false);
                  }}
                  className="w-6 h-6 rounded flex items-center justify-center text-hs-text-faint hover:text-hs-text-body hover:bg-hs-card transition-colors text-xs"
                  aria-label={`Edit ${member.name}`}
                >
                  &#9998;
                </button>
                <button
                  type="button"
                  onClick={() => deleteMember(member.id)}
                  className="w-6 h-6 rounded flex items-center justify-center text-hs-text-faint hover:text-hs-danger hover:bg-hs-card transition-colors text-xs"
                  aria-label={`Delete ${member.name}`}
                >
                  &times;
                </button>
              </div>
            </div>
          ),
        )}

        {showAddMember && (
          <MemberForm
            submitLabel="Add Member"
            onSubmit={addMember}
            onCancel={() => setShowAddMember(false)}
          />
        )}
      </div>

      {!showAddMember && (
        <div className="p-3 border-t border-hs-border-strong/50">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => {
              setShowAddMember(true);
              setEditingMemberId(null);
            }}
          >
            + Add Member
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Chore Column ─────────────────────────────────────────────────

interface ChoreColumnProps {
  chores: ChoreDefinition[];
  members: ChoreMember[];
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
  choreSearch,
  showAddChore,
  editingChoreId,
  setChoreSearch,
  setShowAddChore,
  setEditingChoreId,
  deleteChore,
}: ChoreColumnProps) {
  return (
    <div className="flex-1 border-r border-hs-border-strong flex flex-col min-w-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-hs-border-strong/50">
        <span className="text-xs font-semibold text-hs-text-muted uppercase tracking-wider">
          Chores
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
            + Add Chore
          </button>
        )}
      </div>

      {chores.length > 5 && (
        <div className="px-3 pt-2">
          <input
            type="text"
            placeholder="Search chores..."
            value={choreSearch}
            onChange={(e) => setChoreSearch(e.target.value)}
            className={MODAL_INPUT_CLASS}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5" style={{ scrollbarWidth: 'thin' }}>
        {chores.length === 0 && !showAddChore && (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <p className="text-xs text-hs-text-faint">No chores yet</p>
            {members.length === 0 && (
              <p className="text-[11px] text-hs-text-faint">Add family members first</p>
            )}
          </div>
        )}

        {chores
          .filter((c) => !choreSearch || c.name.toLowerCase().includes(choreSearch.toLowerCase()))
          .map((chore) => (
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
                  {chore.frequency === 'daily' ? 'Daily' : chore.frequency === 'biweekly' ? 'Every Other Week' : 'Weekly'}{' '}
                  &middot; {TIME_OF_DAY_META[chore.timeOfDay].label}{' '}
                  &middot; {chore.points}pt{chore.points !== 1 ? 's' : ''}
                </div>
                <div className="text-[11px] text-hs-text-muted mt-0.5">
                  &rarr;{' '}
                  {chore.assigneeIds
                    .map((id) => members.find((m) => m.id === id)?.name ?? '?')
                    .join(', ')}
                  {((chore.rotation !== 'fixed' && chore.assigneeIds.length > 1) || chore.rotation === 'schedule') && (
                    <span className="text-hs-text-faint">
                      {' '}({chore.rotation === 'rotate-daily' ? 'rotate daily' : chore.rotation === 'rotate-weekly' ? 'rotate weekly' : 'schedule'})
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
                  aria-label={`Edit ${chore.name}`}
                >
                  &#9998;
                </button>
                <button
                  type="button"
                  onClick={() => deleteChore(chore.id)}
                  className="w-6 h-6 rounded flex items-center justify-center text-hs-text-faint hover:text-hs-danger hover:bg-hs-card transition-colors text-xs"
                  aria-label={`Delete ${chore.name}`}
                >
                  &times;
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

// ── Preview Column ───────────────────────────────────────────────

interface PreviewColumnProps {
  chores: ChoreDefinition[];
  members: ChoreMember[];
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
  showAddChore,
  editingChoreId,
  weekStartDay,
  accentColor,
  addChore,
  updateChore,
  setShowAddChore,
  setEditingChoreId,
}: PreviewColumnProps) {
  return (
    <div className={`${showAddChore || editingChoreId ? 'w-[450px]' : 'w-[280px]'} flex flex-col transition-all duration-200`}>
      <div className="px-3 py-2 border-b border-hs-border-strong/50">
        <span className="text-xs font-semibold text-hs-text-muted uppercase tracking-wider">
          {showAddChore ? 'New Chore' : editingChoreId ? 'Edit Chore' : "This Week\u2019s Schedule"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3" style={{ scrollbarWidth: 'thin' }}>
        {showAddChore ? (
          <ChoreForm
            members={members}
            submitLabel="Add Chore"
            onSubmit={addChore}
            onCancel={() => setShowAddChore(false)}
          />
        ) : editingChoreId ? (
          <ChoreForm
            key={editingChoreId}
            initial={chores.find((c) => c.id === editingChoreId)}
            members={members}
            submitLabel="Save"
            onSubmit={(data) => updateChore(editingChoreId, data)}
            onCancel={() => setEditingChoreId(null)}
          />
        ) : chores.length === 0 || members.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-xs text-hs-text-faint text-center">
              Add members and chores to see the weekly schedule
            </p>
          </div>
        ) : (
          <WeeklyPreview
            chores={chores}
            members={members}
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
  const [members, setMembers] = useState<ChoreMember[]>([]);
  const [chores, setChores] = useState<ChoreDefinition[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [showAddChore, setShowAddChore] = useState(false);
  const [editingChoreId, setEditingChoreId] = useState<string | null>(null);
  const [choreSearch, setChoreSearch] = useState('');

  // Fetch shared chore data on mount
  useEffect(() => {
    editorFetch('/api/chores/data')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setMembers(data.members ?? []);
        setChores(data.chores ?? []);
        setLoaded(true);
      })
      .catch(() => setLoadError(true));
  }, []);

  // Persist changes to shared file (debounced, skip until initial load completes)
  const isFirstChange = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const loadedRef = useRef(false);
  const membersRef = useRef(members);
  const choresRef = useRef(chores);
  useEffect(() => { loadedRef.current = loaded; }, [loaded]);
  useEffect(() => { membersRef.current = members; }, [members]);
  useEffect(() => { choresRef.current = chores; }, [chores]);

  const flushSave = useCallback(() => {
    if (!loadedRef.current) return;
    clearTimeout(saveTimerRef.current);
    editorFetch('/api/chores/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: membersRef.current, chores: choresRef.current }),
    }).then(() => {
      displayCache.invalidate('/api/chores/data');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (isFirstChange.current) { isFirstChange.current = false; return; }
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, 400);
  }, [members, chores, loaded, flushSave]);

  // ── Member CRUD ──
  const addMember = (data: Omit<ChoreMember, 'id'>) => {
    setMembers((prev) => [...prev, { ...data, id: uuid() }]);
    setShowAddMember(false);
  };

  const updateMember = (id: string, data: Omit<ChoreMember, 'id'>) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...data, id } : m)));
    setEditingMemberId(null);
  };

  const deleteMember = (id: string) => {
    const result = cascadeDeleteMember(members, chores, id);
    setMembers(result.members);
    setChores(result.chores);
  };

  // ── Chore CRUD ──
  const addChore = (data: Omit<ChoreDefinition, 'id'>) => {
    setChores((prev) => [...prev, { ...data, id: uuid() }]);
    setShowAddChore(false);
  };

  const updateChore = (id: string, data: Omit<ChoreDefinition, 'id'>) => {
    setChores((prev) => prev.map((c) => (c.id === id ? { ...data, id } : c)));
    setEditingChoreId(null);
  };

  const deleteChore = (id: string) => {
    setChores((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <CRUDModalShell
      title="Chore Chart"
      subtitle={`${members.length} members \u00b7 ${chores.length} chores`}
      maxWidth="max-w-6xl"
      onClose={() => { flushSave(); displayCache.invalidate('/api/chores/data'); onClose(); }}
    >
      {loadError && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-hs-danger/10 border border-hs-danger/30 text-hs-danger text-xs">
          Failed to load chore data — changes won&apos;t be saved.
        </div>
      )}
      <div className="flex flex-1 min-h-0">
          <MemberColumn
            members={members}
            showAddMember={showAddMember}
            editingMemberId={editingMemberId}
            setShowAddMember={setShowAddMember}
            setEditingMemberId={setEditingMemberId}
            addMember={addMember}
            updateMember={updateMember}
            deleteMember={deleteMember}
          />
          <ChoreColumn
            chores={chores}
            members={members}
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

    </CRUDModalShell>
  );
}
