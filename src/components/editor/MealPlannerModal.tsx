'use client';

import { useState, useMemo } from 'react';
import Button from '@/components/ui/Button';
import CRUDModalShell, { INPUT } from '@/components/editor/CRUDModalShell';
import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';
import {
  SLOT_META,
  DAY_NAMES_SHORT,
  DAY_NAMES_FULL,
  getOrderedDays,
  MEAL_TAGS,
} from '@/components/modules/meal-planner/types';

// ── Constants ────────────────────────────────────────────────────────

const EMOJI_PICKS = [
  '🍳', '🥣', '🥞', '🧇', '🥯', '🥐',
  '🥗', '🥪', '🌯', '🌮', '🍕', '🍔',
  '🍝', '🍛', '🍜', '🍲', '🥘', '🍱',
  '🐟', '🥩', '🍗', '🍖', '🧆', '🥚',
  '🥑', '🥦', '🌽', '🍠', '🫘', '🧀',
  '🍰', '🧁', '🍪', '🍎', '🫐', '🥤',
];

// ── Props ────────────────────────────────────────────────────────────

interface MealPlannerModalProps {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  slots: MealSlotType[];
  weekStartDay: 'sunday' | 'monday';
  accentColor: string;
  onUpdate: (updates: Record<string, unknown>) => void;
  onClose: () => void;
}

// ── Meal Form (shared for add & edit) ────────────────────────────────

function MealForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: SavedMeal;
  submitLabel: string;
  onSubmit: (data: Omit<SavedMeal, 'id'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [prepTime, setPrepTime] = useState(initial?.prepTime?.toString() ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      emoji: emoji || undefined,
      prepTime: prepTime ? parseInt(prepTime) : undefined,
      notes: notes.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
    });
  };

  return (
    <div className="bg-neutral-800/60 rounded-lg p-3 space-y-3 border border-neutral-700">
      <input
        type="text"
        placeholder="Meal name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className={INPUT}
        autoFocus
      />

      {/* Emoji */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Emoji"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className={`${INPUT} !w-16`}
            maxLength={4}
          />
          {emoji && (
            <span className="text-2xl">{emoji}</span>
          )}
          <span className="text-xs text-neutral-500 ml-auto">or pick below</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {EMOJI_PICKS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`w-7 h-7 flex items-center justify-center rounded-md text-base transition-all ${
                emoji === e
                  ? 'bg-neutral-600 ring-1 ring-neutral-400 scale-110'
                  : 'hover:bg-neutral-700'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Prep time */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-neutral-400 shrink-0">Prep time</label>
        <input
          type="number"
          placeholder="minutes"
          value={prepTime}
          onChange={(e) => setPrepTime(e.target.value)}
          className={`${INPUT} !w-24`}
          min={0}
        />
        <span className="text-xs text-neutral-500">min</span>
      </div>

      {/* Tags */}
      <div className="space-y-1.5">
        <span className="text-xs text-neutral-400">Tags</span>
        <div className="flex flex-wrap gap-1.5">
          {MEAL_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() =>
                setTags(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag])
              }
              className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                tags.includes(tag)
                  ? 'border-neutral-400 bg-neutral-700 text-neutral-200'
                  : 'border-neutral-700 text-neutral-500 hover:border-neutral-500'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <textarea
        placeholder="Notes (optional) — cooking instructions, serving suggestions..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className={`${INPUT} resize-none`}
        rows={2}
      />

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

// ── Meal Card ────────────────────────────────────────────────────────

function MealCard({
  meal,
  onEdit,
  onDelete,
}: {
  meal: SavedMeal;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-start gap-2.5 bg-neutral-800/40 hover:bg-neutral-800/70 rounded-lg p-2.5 transition-colors border border-transparent hover:border-neutral-700/50">
      {/* Emoji */}
      {meal.emoji ? (
        <span className="text-xl mt-0.5 shrink-0">{meal.emoji}</span>
      ) : (
        <span className="w-6 h-6 rounded bg-neutral-700/50 flex items-center justify-center text-neutral-500 text-xs shrink-0 mt-0.5">
          ?
        </span>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-200 truncate">{meal.name}</span>
          {meal.prepTime && (
            <span className="text-[11px] text-neutral-500 shrink-0">
              &#9201; {meal.prepTime}m
            </span>
          )}
        </div>
        {meal.tags && meal.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {meal.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-px rounded-full bg-neutral-700/50 text-neutral-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {meal.notes && (
          <p className="text-[11px] text-neutral-500 mt-1 line-clamp-1">{meal.notes}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="w-6 h-6 rounded flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700 transition-colors text-xs"
          title="Edit"
        >
          &#9998;
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="w-6 h-6 rounded flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-neutral-700 transition-colors text-xs"
          title="Delete"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

// ── Week Plan Grid ───────────────────────────────────────────────────

function WeekPlanGrid({
  plan,
  savedMeals,
  slots,
  weekStartDay,
  accentColor,
  onSetMeal,
}: {
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  slots: MealSlotType[];
  weekStartDay: 'sunday' | 'monday';
  accentColor: string;
  onSetMeal: (day: number, slot: MealSlotType, value: string) => void;
}) {
  const days = getOrderedDays(weekStartDay);
  const today = new Date().getDay();

  return (
    <div className="flex flex-col gap-0.5">
      {/* Header */}
      <div
        className="grid gap-2 pb-2 border-b border-neutral-700/50 mb-1"
        style={{ gridTemplateColumns: `100px repeat(${slots.length}, 1fr)` }}
      >
        <div />
        {slots.map((s) => (
          <div
            key={s}
            className="text-center text-xs font-semibold uppercase tracking-wider"
            style={{ color: SLOT_META[s].color, opacity: 0.7 }}
          >
            {SLOT_META[s].label}
          </div>
        ))}
      </div>

      {/* Rows */}
      {days.map((day) => {
        const isToday = day === today;
        return (
          <div
            key={day}
            className="grid gap-2 items-center py-1.5 px-1 rounded-md transition-colors"
            style={{
              gridTemplateColumns: `100px repeat(${slots.length}, 1fr)`,
              backgroundColor: isToday ? `${accentColor}08` : undefined,
            }}
          >
            {/* Day label */}
            <div className="flex items-center gap-1.5">
              {isToday && (
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: accentColor }}
                />
              )}
              <span
                className="text-sm"
                style={{
                  fontWeight: isToday ? 600 : 400,
                  color: isToday ? accentColor : undefined,
                  opacity: isToday ? 1 : 0.6,
                }}
              >
                {isToday ? 'Today' : DAY_NAMES_SHORT[day]}
              </span>
              {isToday && (
                <span className="text-[10px] opacity-40">{DAY_NAMES_FULL[day]}</span>
              )}
            </div>

            {/* Cells */}
            {slots.map((slot) => {
              const planned = plan.find((p) => p.day === day && p.slot === slot);
              const value = planned?.mealId ?? '';
              const meta = SLOT_META[slot];

              return (
                <select
                  key={slot}
                  value={value}
                  onChange={(e) => onSetMeal(day, slot, e.target.value)}
                  className={`w-full px-2 py-1.5 text-xs rounded-md border transition-all cursor-pointer ${
                    value
                      ? 'bg-neutral-800 text-neutral-200 border-neutral-600'
                      : 'bg-neutral-800/30 text-neutral-500 border-neutral-700/50'
                  }`}
                  style={{
                    borderLeftColor: value ? `${meta.color}60` : undefined,
                    borderLeftWidth: value ? '3px' : undefined,
                  }}
                  title={`${DAY_NAMES_FULL[day]} ${meta.label}`}
                >
                  <option value="">&mdash;</option>
                  {savedMeals.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.emoji ? `${m.emoji} ` : ''}{m.name}
                    </option>
                  ))}
                </select>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Modal ───────────────────────────────────────────────────────

export default function MealPlannerModal({
  savedMeals,
  plan,
  slots,
  weekStartDay,
  accentColor,
  onUpdate,
  onClose,
}: MealPlannerModalProps) {
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filtered meals
  const filteredMeals = useMemo(() => {
    if (!search.trim()) return savedMeals;
    const q = search.toLowerCase();
    return savedMeals.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.tags?.some((t) => t.toLowerCase().includes(q)) ||
        m.notes?.toLowerCase().includes(q),
    );
  }, [savedMeals, search]);

  const addMeal = (data: Omit<SavedMeal, 'id'>) => {
    const newMeal: SavedMeal = { ...data, id: crypto.randomUUID() };
    onUpdate({ savedMeals: [...savedMeals, newMeal] });
    setShowAddForm(false);
  };

  const updateMeal = (id: string, data: Omit<SavedMeal, 'id'>) => {
    onUpdate({
      savedMeals: savedMeals.map((m) => (m.id === id ? { ...data, id } : m)),
    });
    setEditingId(null);
  };

  const deleteMeal = (id: string) => {
    onUpdate({
      savedMeals: savedMeals.filter((m) => m.id !== id),
      plan: plan.filter((p) => p.mealId !== id),
    });
  };

  const setMeal = (day: number, slot: MealSlotType, value: string) => {
    const filtered = plan.filter((p) => !(p.day === day && p.slot === slot));
    if (!value) {
      onUpdate({ plan: filtered });
    } else {
      onUpdate({ plan: [...filtered, { day, slot, mealId: value }] });
    }
  };

  const plannedCount = plan.length;

  return (
    <CRUDModalShell
      title="Meal Planner"
      icon={<span className="text-lg">&#127869;</span>}
      subtitle={`${savedMeals.length} meals \u00b7 ${plannedCount} planned`}
      onClose={onClose}
    >
      <div className="flex flex-1 min-h-0">
          {/* ── Left: Meal Library ────────────────────────── */}
          <div className="w-[320px] border-r border-neutral-700 flex flex-col">
            {/* Search */}
            <div className="p-3 border-b border-neutral-700/50">
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">
                  &#128269;
                </span>
                <input
                  type="text"
                  placeholder="Search meals..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`${INPUT} !pl-8`}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 text-xs"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>

            {/* Meal list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5" style={{ scrollbarWidth: 'thin' }}>
              {filteredMeals.length === 0 && !showAddForm ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <span className="text-3xl opacity-30">&#127858;</span>
                  <p className="text-xs text-neutral-500">
                    {search ? 'No meals match your search' : 'No saved meals yet'}
                  </p>
                  {!search && (
                    <p className="text-[11px] text-neutral-600">
                      Add your family&apos;s favorite meals to get started
                    </p>
                  )}
                </div>
              ) : (
                filteredMeals.map((meal) =>
                  editingId === meal.id ? (
                    <MealForm
                      key={meal.id}
                      initial={meal}
                      submitLabel="Save Changes"
                      onSubmit={(data) => updateMeal(meal.id, data)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <MealCard
                      key={meal.id}
                      meal={meal}
                      onEdit={() => {
                        setEditingId(meal.id);
                        setShowAddForm(false);
                      }}
                      onDelete={() => deleteMeal(meal.id)}
                    />
                  ),
                )
              )}

              {/* Add form */}
              {showAddForm && (
                <MealForm
                  submitLabel="Add Meal"
                  onSubmit={addMeal}
                  onCancel={() => setShowAddForm(false)}
                />
              )}
            </div>

            {/* Add button */}
            {!showAddForm && (
              <div className="p-3 border-t border-neutral-700/50">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setShowAddForm(true);
                    setEditingId(null);
                    setSearch('');
                  }}
                >
                  + Add New Meal
                </Button>
              </div>
            )}
          </div>

          {/* ── Right: Week Plan ──────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-neutral-700/50">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                This Week
              </span>
              <div className="flex-1" />
              {plannedCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Clear all planned meals for this week?')) {
                      onUpdate({ plan: [] });
                    }
                  }}
                  className="text-xs text-neutral-500 hover:text-red-400 transition-colors"
                >
                  Clear Week
                </button>
              )}
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {savedMeals.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <span className="text-4xl opacity-20">&#128197;</span>
                  <p className="text-sm text-neutral-500">Add meals to your library first</p>
                  <p className="text-xs text-neutral-600 max-w-[260px] text-center leading-relaxed">
                    Create your family&apos;s favorite meals in the library on the left,
                    then assign them to days of the week here.
                  </p>
                </div>
              ) : (
                <WeekPlanGrid
                  plan={plan}
                  savedMeals={savedMeals}
                  slots={slots}
                  weekStartDay={weekStartDay}
                  accentColor={accentColor}
                  onSetMeal={setMeal}
                />
              )}
            </div>
          </div>
        </div>
    </CRUDModalShell>
  );
}
