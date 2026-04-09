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
        <span className="text-xs text-neutral-400">{label}</span>
        {value ? (
          <ChoreIcon value={value} size={22} />
        ) : (
          <span className="text-xs text-neutral-600">None</span>
        )}
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-[10px] text-neutral-500 hover:text-neutral-300 ml-auto"
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
                  ? 'ring-2 ring-white ring-offset-1 ring-offset-neutral-900 scale-105'
                  : 'hover:scale-105 hover:brightness-125'
              }`}
              style={{
                backgroundColor: `${def.defaultColor}${isSelected ? '30' : '15'}`,
                color: def.defaultColor,
                width: 52,
              }}
            >
              <Icon size={22} strokeWidth={1.75} />
              <span className="text-[9px] leading-tight text-neutral-400 truncate w-full text-center">
                {def.label}
              </span>
            </button>
          );
        })}
        {search && filtered.length === 0 && (
          <span className="text-xs text-neutral-500 py-2">No matching icons</span>
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
    <div className="bg-neutral-800/60 rounded-lg p-3 space-y-3 border border-neutral-700">
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
        <span className="text-xs text-neutral-400">Color</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {MEMBER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full transition-all ${
                color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900 scale-110' : ''
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <label
            className="w-6 h-6 rounded-full cursor-pointer transition-all flex items-center justify-center border-2 border-dashed border-neutral-500 hover:border-neutral-300 relative"
            style={!MEMBER_COLORS.includes(color) ? { backgroundColor: color, borderStyle: 'solid', borderColor: 'white' } : undefined}
            title="Pick custom color"
          >
            {MEMBER_COLORS.includes(color) && (
              <span className="text-neutral-500 text-[10px] font-bold leading-none">+</span>
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

  const toggleDay = (d: number) => {
    setDaysOfWeek((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const toggleAssignee = (id: string) => {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const canSave = name.trim().length > 0 && assigneeIds.length > 0;
  const validationHint = !name.trim()
    ? 'Enter a chore name'
    : assigneeIds.length === 0
      ? 'Select at least one person'
      : null;

  const submit = () => {
    if (!canSave) return;
    onSubmit({
      name: name.trim(),
      emoji,
      points: parseInt(points) || 1,
      frequency,
      daysOfWeek,
      timeOfDay,
      assigneeIds,
      rotation: assigneeIds.length <= 1 ? 'fixed' : rotation,
    });
  };

  return (
    <div className="bg-neutral-800/60 rounded-lg p-3 space-y-3 border border-neutral-700">
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
          <span className="text-xs text-neutral-400">Points</span>
          <input
            type="number"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            className={MODAL_INPUT_CLASS}
            min={1}
          />
        </label>
        <label className="flex flex-col gap-0.5 flex-1">
          <span className="text-xs text-neutral-400">Frequency</span>
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
          <span className="text-xs text-neutral-400">Time of Day</span>
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

      {/* Days of week */}
      <div className="space-y-1.5">
        <span className="text-xs text-neutral-400">Days</span>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`flex-1 py-1 rounded text-xs font-medium transition-all ${
                daysOfWeek.includes(d)
                  ? 'bg-neutral-600 text-neutral-200'
                  : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'
              }`}
            >
              {DAY_NAMES_SHORT[d][0]}
            </button>
          ))}
        </div>
      </div>

      {/* Assignees */}
      <div className="space-y-1.5">
        <span className="text-xs text-neutral-400">Assign to</span>
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => toggleAssignee(m.id)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
                assigneeIds.includes(m.id)
                  ? 'bg-neutral-600 text-neutral-200 ring-1 ring-neutral-400'
                  : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'
              }`}
            >
              {m.emoji && <ChoreIcon value={m.emoji} size={14} color="currentColor" />}
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Rotation (only when 2+ assignees) */}
      {assigneeIds.length >= 2 && (
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-400">Rotation</span>
          <select
            value={rotation}
            onChange={(e) => setRotation(e.target.value as ChoreRotation)}
            className={MODAL_INPUT_CLASS}
          >
            {CHORE_ROTATIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
      )}

      {validationHint && (
        <p className="text-xs text-amber-400/80">{validationHint}</p>
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
              <div className="text-[11px] text-neutral-600 pl-2">No chores</div>
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
                    <span className="text-neutral-300">{chore.name}</span>
                    <span className="text-neutral-600">&rarr;</span>
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
                      <span className="text-neutral-600 text-[10px]">&larr; rot</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        );
      })}

      {/* Weekly totals */}
      <div className="pt-2 border-t border-neutral-700/50">
        <div className="text-xs font-semibold mb-1.5 opacity-60">
          Weekly totals
        </div>
        {members.map((m) => {
          const t = totals[m.id];
          return (
            <div key={m.id} className="flex items-center gap-1.5 text-[11px] py-0.5 pl-2">
              {m.emoji && <ChoreIcon value={m.emoji} size={11} color="currentColor" />}
              <span className="text-neutral-300">{m.name}:</span>
              <span className="text-neutral-400">
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
    <div className="w-[260px] border-r border-neutral-700 flex flex-col">
      <div className="px-3 py-2 border-b border-neutral-700/50">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
          Family Members
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5" style={{ scrollbarWidth: 'thin' }}>
        {members.length === 0 && !showAddMember && (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <p className="text-xs text-neutral-500">No members yet</p>
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
              className="group flex items-center gap-2.5 bg-neutral-800/40 hover:bg-neutral-800/70 rounded-lg p-2.5 transition-colors border border-transparent hover:border-neutral-700/50"
            >
              <span className="w-6 h-6 flex items-center justify-center shrink-0" style={{ color: member.color }}>
                {member.emoji ? (
                  <ChoreIcon value={member.emoji} size={20} color={member.color} />
                ) : (
                  <span className="w-5 h-5 rounded-full" style={{ backgroundColor: member.color }} />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral-200 truncate">{member.name}</div>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => {
                    setEditingMemberId(member.id);
                    setShowAddMember(false);
                  }}
                  className="w-6 h-6 rounded flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700 transition-colors text-xs"
                  aria-label={`Edit ${member.name}`}
                >
                  &#9998;
                </button>
                <button
                  type="button"
                  onClick={() => deleteMember(member.id)}
                  className="w-6 h-6 rounded flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-neutral-700 transition-colors text-xs"
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
        <div className="p-3 border-t border-neutral-700/50">
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
    <div className="flex-1 border-r border-neutral-700 flex flex-col min-w-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700/50">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
          Chores
        </span>
        {members.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setShowAddChore(true);
              setEditingChoreId(null);
            }}
            className="text-[11px] font-medium px-2 py-0.5 rounded bg-neutral-700 text-neutral-200 hover:bg-neutral-600 transition-colors"
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
            <p className="text-xs text-neutral-500">No chores yet</p>
            {members.length === 0 && (
              <p className="text-[11px] text-neutral-600">Add family members first</p>
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
                  ? 'bg-neutral-700/50 border-neutral-600'
                  : 'bg-neutral-800/40 hover:bg-neutral-800/70 border-transparent hover:border-neutral-700/50'
              }`}
            >
              <span className="w-5 h-5 mt-0.5 shrink-0 flex items-center justify-center text-neutral-300">
                {chore.emoji ? (
                  <ChoreIcon value={chore.emoji} size={18} color="currentColor" />
                ) : (
                  <span className="w-4 h-4 rounded bg-neutral-700" />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral-200 truncate">
                  {chore.name}
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  {chore.frequency === 'daily' ? 'Daily' : chore.frequency === 'biweekly' ? 'Every Other Week' : 'Weekly'}{' '}
                  &middot; {TIME_OF_DAY_META[chore.timeOfDay].label}{' '}
                  &middot; {chore.points}pt{chore.points !== 1 ? 's' : ''}
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  &rarr;{' '}
                  {chore.assigneeIds
                    .map((id) => members.find((m) => m.id === id)?.name ?? '?')
                    .join(', ')}
                  {chore.rotation !== 'fixed' && chore.assigneeIds.length > 1 && (
                    <span className="text-neutral-600">
                      {' '}({chore.rotation === 'rotate-daily' ? 'rotate daily' : 'rotate weekly'})
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
                  className="w-6 h-6 rounded flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700 transition-colors text-xs"
                  aria-label={`Edit ${chore.name}`}
                >
                  &#9998;
                </button>
                <button
                  type="button"
                  onClick={() => deleteChore(chore.id)}
                  className="w-6 h-6 rounded flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-neutral-700 transition-colors text-xs"
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
      <div className="px-3 py-2 border-b border-neutral-700/50">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
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
            <p className="text-xs text-neutral-500 text-center">
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
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-900/40 border border-red-700/50 text-red-300 text-xs">
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
