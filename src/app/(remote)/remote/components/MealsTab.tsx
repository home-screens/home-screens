'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { SavedMeal, PlannedMeal, MealSlotType, GroceryCategory, MealIngredient } from '@/types/config';

// ── Slot metadata ──

const SLOT_META: Record<MealSlotType, { label: string; color: string }> = {
  breakfast: { label: 'Breakfast', color: '#f59e0b' },
  lunch:     { label: 'Lunch',     color: '#10b981' },
  dinner:    { label: 'Dinner',    color: '#6366f1' },
  snack:     { label: 'Snack',     color: '#ec4899' },
};
const SLOT_ORDER: MealSlotType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

// ── Grocery category labels ──

const GROCERY_CATEGORIES: Record<string, string> = {
  produce:   'Produce',
  dairy:     'Dairy & Eggs',
  meat:      'Meat & Seafood',
  seafood:   'Meat & Seafood',
  bakery:    'Bakery',
  pantry:    'Pantry',
  frozen:    'Frozen',
  beverages: 'Beverages',
  other:     'Other',
};

const GROCERY_CATEGORY_ORDER = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other'];

// SVG path data for grocery category icons (Lucide-style)
const GROCERY_CATEGORY_ICONS: Record<string, string> = {
  produce:   'M17 8C8 10 5.9 16.9 3.9 19.9A2 2 0 005.8 22h12.4a2 2 0 001.9-2.1c-.5-2.5-2-5-4.1-7 M2 12h20',    // leaf
  meat:      'M13.3 3.7a8 8 0 0111 11l-7.4 7.4a2 2 0 01-2.8 0L3.7 11.7a2 2 0 010-2.8z M8 12l4 4',               // beef-like
  dairy:     'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 6a3 3 0 013 3',        // egg
  bakery:    'M4.6 13.11L10 18.5l5.4-5.39a3.82 3.82 0 000-5.39A3.82 3.82 0 0010 7.72a3.82 3.82 0 00-5.4 0 3.82 3.82 0 000 5.39z', // croissant-like
  pantry:    'M21 8v13H3V8 M1 3h22v5H1z M10 12h4',                                                                 // archive
  frozen:    'M12 2v20 M2 12h20 M4.93 4.93l14.14 14.14 M19.07 4.93L4.93 19.07',                                     // snowflake
  beverages: 'M8 2h8l4 10H4L8 2z M12 12v6 M6 22h12',                                                               // glass
  other:     'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z', // package
};

// ── Tag options ──

const TAG_OPTIONS = ['Quick', 'Healthy', 'Comfort', 'Kid-Friendly', 'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Spicy', 'Batch Cook'];

// ── Emoji picker grid ──

const FOOD_EMOJIS = [
  '🍳', '🥞', '🧇', '🥣', '🥗', '🥪', '🌮', '🌯', '🍕', '🍔',
  '🍝', '🍜', '🍲', '🥘', '🍛', '🍣', '🍱', '🥩', '🍗', '🐟',
  '🥦', '🥕', '🌽', '🥑', '🍅', '🫑', '🧀', '🥚', '🍞', '🥐',
  '🍰', '🧁', '🍪', '🍩', '🍫', '🥤', '☕', '🍵', '🧃', '🥛',
  '🥧', '🍿', '🥜', '🫘', '🍓', '🍌', '🍎', '🥝', '🍋', '🫐',
];

// ── Day helpers ──

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWeekDates(): { day: number; date: Date; label: string; shortDate: string }[] {
  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun
  const result: { day: number; date: Date; label: string; shortDate: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - currentDay + i);
    result.push({
      day: i,
      date: d,
      label: DAY_NAMES[i],
      shortDate: `${d.getMonth() + 1}/${d.getDate()}`,
    });
  }
  return result;
}

function currentSlotIndex(): number {
  const h = new Date().getHours();
  if (h < 10) return 0;   // breakfast
  if (h < 14) return 1;   // lunch
  if (h < 20) return 2;   // dinner
  return 3;                // snack
}

// ── Grocery list generation ──

function generateGroceryList(
  planArr: PlannedMeal[],
  meals: SavedMeal[],
  checkedItems: string[],
): Map<string, { items: Array<{ name: string; amount: string; checked: boolean }> }> {
  const mealMap = new Map(meals.map((m) => [m.id, m]));
  const grouped = new Map<string, Map<string, string>>(); // category -> name -> amount

  for (const entry of planArr) {
    if (!entry.mealId) continue;
    const meal = mealMap.get(entry.mealId);
    if (!meal?.ingredients) continue;
    for (const ing of meal.ingredients) {
      const cat = ing.category ?? 'other';
      // Merge 'seafood' into 'meat' bucket for display
      const displayCat = cat === 'seafood' ? 'meat' : cat;
      if (!grouped.has(displayCat)) grouped.set(displayCat, new Map());
      const catMap = grouped.get(displayCat)!;
      const existing = catMap.get(ing.name.toLowerCase());
      const amt = ing.amount ?? '';
      if (existing && amt) {
        catMap.set(ing.name.toLowerCase(), `${existing}, ${amt}`);
      } else if (!existing) {
        catMap.set(ing.name.toLowerCase(), amt);
      }
    }
  }

  const result = new Map<string, { items: Array<{ name: string; amount: string; checked: boolean }> }>();
  for (const catKey of GROCERY_CATEGORY_ORDER) {
    const catMap = grouped.get(catKey);
    if (!catMap || catMap.size === 0) continue;
    const items = Array.from(catMap.entries()).map(([name, amount]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      amount,
      checked: checkedItems.includes(name.toLowerCase()),
    }));
    items.sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    result.set(catKey, { items });
  }
  return result;
}

// ── Component ──

export default function MealsTab() {
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [plan, setPlan] = useState<PlannedMeal[]>([]);
  const [groceryChecked, setGroceryChecked] = useState<string[]>([]);
  const [subView, setSubView] = useState<'week' | 'plan' | 'library' | 'grocery'>('week');
  const [loading, setLoading] = useState(true);

  // Plan view: meal picker state
  const [pickingSlot, setPickingSlot] = useState<{ day: number; slot: MealSlotType } | null>(null);

  // Library view: search, filter, editing
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string>('All');
  const [editingMeal, setEditingMeal] = useState<SavedMeal | 'new' | null>(null);

  // Form state (for add/edit meal overlay)
  const [formName, setFormName] = useState('');
  const [formEmoji, setFormEmoji] = useState('');
  const [formPrepTime, setFormPrepTime] = useState<number | ''>('');
  const [formCookTime, setFormCookTime] = useState<number | ''>('');
  const [formServings, setFormServings] = useState<number | ''>('');
  const [formDifficulty, setFormDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formIngredients, setFormIngredients] = useState<MealIngredient[]>([]);
  const [formRecipeUrl, setFormRecipeUrl] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formRating, setFormRating] = useState(0);
  const [formFavorite, setFormFavorite] = useState(false);

  // Saving / error / confirmation state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ── Data fetching ──

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/meals/data');
      if (!res.ok) return;
      const data = await res.json();
      setSavedMeals(data.savedMeals ?? []);
      setPlan(data.plan ?? []);
      setGroceryChecked(data.groceryChecked ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Re-fetch when switching sub-views to stay in sync
  useEffect(() => {
    fetchData();
  }, [subView, fetchData]);

  // ── Save helpers ──

  const saveData = useCallback(async (meals: SavedMeal[], planData: PlannedMeal[], grocery?: string[]): Promise<boolean> => {
    try {
      const res = await fetch('/api/meals/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          savedMeals: meals,
          plan: planData,
          ...(grocery !== undefined ? { groceryChecked: grocery } : {}),
          force: meals.length === 0 && planData.length === 0,
        }),
      });
      if (!res.ok) {
        setSaveError('Failed to save. Please try again.');
        return false;
      }
      return true;
    } catch {
      setSaveError('Network error. Please try again.');
      return false;
    }
  }, []);

  const toggleGroceryItem = useCallback(async (itemName: string) => {
    const lower = itemName.toLowerCase();
    // Optimistic update
    setGroceryChecked((prev) => {
      const idx = prev.indexOf(lower);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev, lower];
    });
    try {
      const res = await fetch('/api/meals/grocery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: lower }),
      });
      if (res.ok) {
        const data = await res.json();
        setGroceryChecked(data.groceryChecked ?? []);
      }
    } catch {
      /* silent */
    }
  }, []);

  // ── Week view helpers ──

  const weekDates = useMemo(() => getWeekDates(), []);
  const today = new Date().getDay();
  const currentSlot = currentSlotIndex();

  const getMealForSlot = useCallback((day: number, slot: MealSlotType): { planned: PlannedMeal | undefined; meal: SavedMeal | undefined } => {
    const planned = plan.find((p) => p.day === day && p.slot === slot);
    const meal = planned?.mealId ? savedMeals.find((m) => m.id === planned.mealId) : undefined;
    return { planned, meal };
  }, [plan, savedMeals]);

  // ── Plan view helpers ──

  const assignMealToSlot = useCallback(async (day: number, slot: MealSlotType, mealId: string) => {
    const newPlan = plan.filter((p) => !(p.day === day && p.slot === slot));
    newPlan.push({ day, slot, mealId });
    setPlan(newPlan);
    setPickingSlot(null);
    await saveData(savedMeals, newPlan);
  }, [plan, savedMeals, saveData]);

  const clearSlot = useCallback(async (day: number, slot: MealSlotType) => {
    const newPlan = plan.filter((p) => !(p.day === day && p.slot === slot));
    setPlan(newPlan);
    await saveData(savedMeals, newPlan);
  }, [plan, savedMeals, saveData]);

  const clearAllPlan = useCallback(() => {
    setConfirmAction({
      message: 'Clear all planned meals for the week?',
      onConfirm: async () => {
        setPlan([]);
        await saveData(savedMeals, []);
        setConfirmAction(null);
      },
    });
  }, [savedMeals, saveData]);

  const suggestRandom = useCallback(async () => {
    if (savedMeals.length === 0) return;
    const newPlan: PlannedMeal[] = [];
    for (let day = 0; day < 7; day++) {
      for (const slot of SLOT_ORDER) {
        const randomMeal = savedMeals[Math.floor(Math.random() * savedMeals.length)];
        newPlan.push({ day, slot, mealId: randomMeal.id });
      }
    }
    setPlan(newPlan);
    await saveData(savedMeals, newPlan);
  }, [savedMeals, saveData]);

  // ── Library form helpers ──

  const openNewMealForm = () => {
    setFormName('');
    setFormEmoji('🍽️');
    setFormPrepTime('');
    setFormCookTime('');
    setFormServings('');
    setFormDifficulty('easy');
    setFormTags([]);
    setFormIngredients([]);
    setFormRecipeUrl('');
    setFormNotes('');
    setFormRating(0);
    setFormFavorite(false);
    setSaveError(null);
    setEditingMeal('new');
    setTimeout(() => nameInputRef.current?.focus(), 350);
  };

  const openEditMealForm = (meal: SavedMeal) => {
    setFormName(meal.name);
    setFormEmoji(meal.emoji ?? '🍽️');
    setFormPrepTime(meal.prepTime ?? '');
    setFormCookTime(meal.cookTime ?? '');
    setFormServings(meal.servings ?? '');
    setFormDifficulty(meal.difficulty ?? 'easy');
    setFormTags(meal.tags ?? []);
    setFormIngredients(meal.ingredients ?? []);
    setFormRecipeUrl(meal.recipeUrl ?? '');
    setFormNotes(meal.notes ?? '');
    setFormRating(meal.rating ?? 0);
    setFormFavorite(meal.isFavorite ?? false);
    setSaveError(null);
    setEditingMeal(meal);
    setTimeout(() => nameInputRef.current?.focus(), 350);
  };

  const saveMealForm = async () => {
    if (!formName.trim() || saving) return;
    setSaving(true);
    setSaveError(null);

    const mealData: SavedMeal = {
      id: editingMeal === 'new' ? crypto.randomUUID() : (editingMeal as SavedMeal).id,
      name: formName.trim(),
      emoji: formEmoji || undefined,
      prepTime: formPrepTime ? Number(formPrepTime) : undefined,
      cookTime: formCookTime ? Number(formCookTime) : undefined,
      servings: formServings ? Number(formServings) : undefined,
      difficulty: formDifficulty,
      tags: formTags.length > 0 ? formTags : undefined,
      ingredients: formIngredients.length > 0 ? formIngredients : undefined,
      recipeUrl: formRecipeUrl.trim() || undefined,
      notes: formNotes.trim() || undefined,
      rating: formRating > 0 ? formRating : undefined,
      isFavorite: formFavorite || undefined,
    };

    let newMeals: SavedMeal[];
    if (editingMeal === 'new') {
      newMeals = [...savedMeals, mealData];
    } else {
      newMeals = savedMeals.map((m) => (m.id === mealData.id ? mealData : m));
    }

    const ok = await saveData(newMeals, plan);
    setSaving(false);
    if (ok) {
      setSavedMeals(newMeals);
      setEditingMeal(null);
    }
  };

  const deleteMeal = () => {
    if (editingMeal === 'new' || editingMeal === null) return;
    const mealToDelete = editingMeal;
    setConfirmAction({
      message: `Delete "${mealToDelete.name}"? This will also remove it from any planned slots.`,
      onConfirm: async () => {
        const id = mealToDelete.id;
        const newMeals = savedMeals.filter((m) => m.id !== id);
        const newPlan = plan.filter((p) => p.mealId !== id);
        setSavedMeals(newMeals);
        setPlan(newPlan);
        setEditingMeal(null);
        setConfirmAction(null);
        await saveData(newMeals, newPlan);
      },
    });
  };

  const toggleFavorite = async (mealId: string) => {
    const newMeals = savedMeals.map((m) =>
      m.id === mealId ? { ...m, isFavorite: !m.isFavorite } : m,
    );
    setSavedMeals(newMeals);
    await saveData(newMeals, plan);
  };

  // ── Filtered meals for library ──

  const filteredMeals = useMemo(() => {
    let result = savedMeals;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        m.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (filterTag === 'Favorites') {
      result = result.filter((m) => m.isFavorite);
    } else if (filterTag !== 'All') {
      result = result.filter((m) => m.tags?.some((t) => t.toLowerCase() === filterTag.toLowerCase()));
    }
    return result;
  }, [savedMeals, searchQuery, filterTag]);

  // ── Grocery list ──

  const groceryList = useMemo(() => generateGroceryList(plan, savedMeals, groceryChecked), [plan, savedMeals, groceryChecked]);

  const groceryStats = useMemo(() => {
    let total = 0;
    let checked = 0;
    for (const [, cat] of groceryList) {
      for (const item of cat.items) {
        total++;
        if (item.checked) checked++;
      }
    }
    return { total, checked };
  }, [groceryList]);

  // ── Loading state ──

  if (loading) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#525252' }}>Loading meals...</div>
      </div>
    );
  }

  // ── Shared styles ──

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    minHeight: 44,
    fontSize: 14,
    background: '#171717',
    border: '1px solid #262626',
    borderRadius: 10,
    color: '#fafafa',
    outline: 'none',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  const cardStyle: React.CSSProperties = {
    background: '#171717',
    border: '1px solid #262626',
    borderRadius: 12,
    padding: 14,
  };

  // ── Render ──

  return (
    <div>
      {/* Header */}
      <div style={{ padding: '12px 0 4px' }}>
        <div style={{ fontSize: 12, color: '#525252' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fafafa', margin: 0 }}>Meals</h2>
      </div>

      {/* Sub-navigation */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: 3,
          background: '#171717',
          borderRadius: 10,
          marginTop: 12,
          marginBottom: 16,
        }}
      >
        {(['week', 'plan', 'library', 'grocery'] as const).map((view) => {
          const labels: Record<typeof view, string> = {
            week: 'This Week',
            plan: 'Plan',
            library: 'Library',
            grocery: 'Grocery',
          };
          const icons: Record<typeof view, React.ReactNode> = {
            week: (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="2" width="12" height="11" rx="1.5" /><line x1="1" y1="5.5" x2="13" y2="5.5" /><line x1="4.5" y1="1" x2="4.5" y2="3" /><line x1="9.5" y1="1" x2="9.5" y2="3" />
              </svg>
            ),
            plan: (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="1" width="3.5" height="3.5" rx="0.5" /><rect x="5.25" y="1" width="3.5" height="3.5" rx="0.5" /><rect x="9.5" y="1" width="3.5" height="3.5" rx="0.5" /><rect x="1" y="5.25" width="3.5" height="3.5" rx="0.5" /><rect x="5.25" y="5.25" width="3.5" height="3.5" rx="0.5" /><rect x="9.5" y="5.25" width="3.5" height="3.5" rx="0.5" /><rect x="1" y="9.5" width="3.5" height="3.5" rx="0.5" /><rect x="5.25" y="9.5" width="3.5" height="3.5" rx="0.5" /><rect x="9.5" y="9.5" width="3.5" height="3.5" rx="0.5" />
              </svg>
            ),
            library: (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 2 L2 5 L2 12 L7 9.5 L12 12 L12 5 Z" /><line x1="7" y1="2" x2="7" y2="9.5" />
              </svg>
            ),
            grocery: (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 1 L3 1 L4.5 9 L11.5 9" /><circle cx="5.5" cy="12" r="1" /><circle cx="10.5" cy="12" r="1" /><path d="M3.5 3.5 L12.5 3.5 L11.5 9 L4.5 9 Z" />
              </svg>
            ),
          };
          return (
            <button
              key={view}
              onClick={() => setSubView(view)}
              style={{
                flex: 1,
                padding: '8px 6px',
                minHeight: 40,
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: subView === view ? '#262626' : 'transparent',
                color: subView === view ? '#fafafa' : '#525252',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              {icons[view]}
              {labels[view]}
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════
          Sub-View 1: This Week
          ════════════════════════════════════════════════════════════ */}
      {subView === 'week' && (
        <div style={{ paddingBottom: 80 }}>
          {weekDates.map(({ day, label, shortDate }) => {
            const isToday = day === today;
            const isPast = day < today;

            return (
              <div key={day} style={{ marginBottom: 16 }}>
                {/* Day header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: isToday ? '#fafafa' : '#a3a3a3' }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 12, color: '#525252' }}>{shortDate}</span>
                  {isToday && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'rgba(245,158,11,0.12)',
                        color: '#f59e0b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginLeft: 'auto',
                      }}
                    >
                      Today
                    </span>
                  )}
                </div>

                {/* Meal slots */}
                {SLOT_ORDER.map((slot, slotIdx) => {
                  const { planned, meal } = getMealForSlot(day, slot);
                  const hasMeal = !!(meal || planned?.customText);
                  const isPastSlot = isPast || (isToday && slotIdx < currentSlot);
                  const isCurrentSlot = isToday && slotIdx === currentSlot;

                  if (!hasMeal) {
                    return (
                      <div
                        key={slot}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          marginBottom: 4,
                          borderRadius: 10,
                          border: '1px dashed #262626',
                          opacity: isPastSlot ? 0.4 : 0.6,
                        }}
                      >
                        <div style={{ width: 4, height: 28, borderRadius: 2, background: SLOT_META[slot].color, opacity: 0.3 }} />
                        <span style={{ fontSize: 13, color: '#525252' }}>
                          {SLOT_META[slot].label} - Not planned
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={slot}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 12px',
                        marginBottom: 6,
                        borderRadius: 12,
                        background: '#171717',
                        opacity: isPastSlot ? 0.4 : 1,
                        border: isCurrentSlot ? '1px solid #f59e0b' : '1px solid #262626',
                        boxShadow: isCurrentSlot ? '0 0 12px rgba(245,158,11,0.08)' : 'none',
                      }}
                    >
                      <div style={{ width: 4, height: 28, borderRadius: 2, background: SLOT_META[slot].color }} />
                      {meal?.emoji && <span style={{ fontSize: 24 }}>{meal.emoji}</span>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: '#525252', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                            {SLOT_META[slot].label}{isCurrentSlot ? ' \u2022 Now' : ''}
                          </span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#fafafa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {meal?.name ?? planned?.customText ?? ''}
                        </div>
                      </div>
                      {meal?.prepTime && (
                        <span style={{ fontSize: 11, color: '#525252', flexShrink: 0 }}>
                          {meal.prepTime}m
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {plan.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <p style={{ fontSize: 15, color: '#737373', marginBottom: 4 }}>No meals planned this week</p>
              <p style={{ fontSize: 13, color: '#525252', marginBottom: 20 }}>
                Switch to Plan to start adding meals.
              </p>
              <button
                onClick={() => setSubView('plan')}
                style={{
                  padding: '10px 24px',
                  minHeight: 44,
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  background: '#f59e0b',
                  color: '#000',
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                }}
              >
                Plan Meals
              </button>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          Sub-View 2: Plan
          ════════════════════════════════════════════════════════════ */}
      {subView === 'plan' && (
        <div style={{ paddingBottom: 80 }}>
          {/* Quick actions */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              onClick={suggestRandom}
              disabled={savedMeals.length === 0}
              style={{
                flex: 1,
                padding: '8px 8px',
                minHeight: 44,
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                border: '1px solid #262626',
                cursor: savedMeals.length === 0 ? 'default' : 'pointer',
                background: '#171717',
                color: savedMeals.length === 0 ? '#333' : '#a3a3a3',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
              aria-label="Suggest random meals"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>
              Suggest
            </button>
            <button
              style={{
                flex: 1,
                padding: '8px 8px',
                minHeight: 44,
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                border: '1px solid #262626',
                cursor: 'pointer',
                background: '#171717',
                color: '#a3a3a3',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
              aria-label="Copy last week's plan"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              Copy Last Week
            </button>
            <button
              onClick={clearAllPlan}
              disabled={plan.length === 0}
              style={{
                flex: 1,
                padding: '8px 8px',
                minHeight: 44,
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                border: '1px solid #262626',
                cursor: plan.length === 0 ? 'default' : 'pointer',
                background: '#171717',
                color: plan.length === 0 ? '#333' : '#a3a3a3',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
              aria-label="Clear all planned meals"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              Clear
            </button>
          </div>

          {savedMeals.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <p style={{ fontSize: 15, color: '#737373', marginBottom: 4 }}>No meals in your library</p>
              <p style={{ fontSize: 13, color: '#525252', marginBottom: 20 }}>
                Add meals to your library first, then plan your week.
              </p>
              <button
                onClick={() => setSubView('library')}
                style={{
                  padding: '10px 24px',
                  minHeight: 44,
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  background: '#f59e0b',
                  color: '#000',
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                }}
              >
                Add Meals
              </button>
            </div>
          )}

          {/* Days grid */}
          {weekDates.map(({ day, label }) => {
            const isToday = day === today;

            return (
              <div key={day} style={{ marginBottom: 20 }}>
                {/* Day label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: isToday ? '#fafafa' : '#a3a3a3' }}>
                    {label}
                  </span>
                  {isToday && (
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: '#f59e0b' }} />
                  )}
                </div>

                {/* 2-column slot grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {SLOT_ORDER.map((slot) => {
                    const { planned, meal } = getMealForSlot(day, slot);
                    const hasMeal = !!(meal || planned?.customText);

                    return (
                      <button
                        key={slot}
                        onClick={() => {
                          if (hasMeal) {
                            clearSlot(day, slot);
                          } else {
                            setPickingSlot({ day, slot });
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '10px 10px',
                          minHeight: 50,
                          borderRadius: 10,
                          border: hasMeal ? `1px solid ${SLOT_META[slot].color}30` : '1px dashed #262626',
                          background: hasMeal ? `${SLOT_META[slot].color}10` : 'transparent',
                          cursor: 'pointer',
                          textAlign: 'left' as const,
                          color: 'inherit',
                          fontFamily: 'inherit',
                          overflow: 'hidden',
                        }}
                      >
                        {hasMeal ? (
                          <>
                            <div style={{ width: 3, height: 28, borderRadius: 2, background: SLOT_META[slot].color, flexShrink: 0 }} />
                            {meal?.emoji && <span style={{ fontSize: 16, flexShrink: 0 }}>{meal.emoji}</span>}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 10, color: SLOT_META[slot].color, fontWeight: 600, textTransform: 'uppercase' as const }}>
                                {SLOT_META[slot].label}
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 500, color: '#d4d4d4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {meal?.name ?? planned?.customText ?? ''}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div style={{ flex: 1, textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: '#525252' }}>{SLOT_META[slot].label}</div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Meal picker overlay */}
          {pickingSlot && (
            <div
              style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                top: 0,
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
              }}
            >
              {/* Backdrop */}
              <div
                onClick={() => setPickingSlot(null)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.6)',
                }}
              />
              {/* Picker panel */}
              <div
                style={{
                  position: 'relative',
                  background: '#0a0a0a',
                  borderRadius: '16px 16px 0 0',
                  maxHeight: '60vh',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
                }}
              >
                {/* Drag handle */}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                  <div style={{ width: 36, height: 4, borderRadius: 2, background: '#525252' }} />
                </div>
                {/* Title */}
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fafafa', padding: '8px 16px 10px', borderBottom: '1px solid #262626' }}>
                  Choose a Meal
                </div>
                {/* Scrollable list */}
                <div style={{ overflow: 'auto', padding: '8px 16px', flex: 1, scrollbarWidth: 'none' as const }}>
                  {savedMeals.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#525252', fontSize: 13 }}>
                      No meals in library. Add some first.
                    </div>
                  ) : (
                    savedMeals.map((meal) => (
                      <button
                        key={meal.id}
                        onClick={() => assignMealToSlot(pickingSlot.day, pickingSlot.slot, meal.id)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '11px 0',
                          border: 'none',
                          borderBottom: '1px solid #262626',
                          background: 'transparent',
                          cursor: 'pointer',
                          textAlign: 'left' as const,
                          color: 'inherit',
                          fontFamily: 'inherit',
                        }}
                      >
                        <span style={{ fontSize: 24 }}>{meal.emoji ?? '🍽️'}</span>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#fafafa' }}>{meal.name}</span>
                        {meal.prepTime ? (
                          <span style={{ fontSize: 11, color: '#525252' }}>{meal.prepTime}m</span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
                {/* Remove Meal button */}
                <div style={{ padding: '12px 16px 24px', borderTop: '1px solid #262626' }}>
                  <button
                    onClick={() => {
                      clearSlot(pickingSlot.day, pickingSlot.slot);
                      setPickingSlot(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      minHeight: 44,
                      borderRadius: 10,
                      border: '1px solid #262626',
                      background: '#171717',
                      color: '#ef4444',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Remove Meal
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          Sub-View 3: Library
          ════════════════════════════════════════════════════════════ */}
      {subView === 'library' && (
        <div style={{ paddingBottom: 80 }}>
          {/* Search input */}
          <input
            type="text"
            placeholder="Search meals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              ...inputStyle,
              marginBottom: 12,
            }}
          />

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' as const, paddingBottom: 12 }}>
            {['All', 'Favorites', 'Quick', 'Healthy', 'Comfort', 'Kid-Friendly'].map((tag) => {
              const isActive = filterTag === tag;
              return (
                <button
                  key={tag}
                  onClick={() => setFilterTag(tag)}
                  aria-label={`Filter by ${tag}`}
                  aria-pressed={isActive}
                  style={{
                    padding: '6px 14px',
                    minHeight: 36,
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 999,
                    border: isActive ? '1px solid #f59e0b' : '1px solid #262626',
                    cursor: 'pointer',
                    background: isActive ? 'rgba(245,158,11,0.15)' : '#171717',
                    color: isActive ? '#f59e0b' : '#525252',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    fontFamily: 'inherit',
                  }}
                >
                  {tag}
                </button>
              );
            })}
          </div>

          {/* Meal list */}
          {filteredMeals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px' }}>
              <p style={{ fontSize: 15, color: '#737373', marginBottom: 4 }}>
                {savedMeals.length === 0 ? 'No meals yet' : 'No matches'}
              </p>
              <p style={{ fontSize: 13, color: '#525252' }}>
                {savedMeals.length === 0 ? 'Tap the + button to add your first meal.' : 'Try a different search or filter.'}
              </p>
            </div>
          ) : (
            filteredMeals.map((meal) => (
              <button
                key={meal.id}
                onClick={() => openEditMealForm(meal)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  ...cardStyle,
                  marginBottom: 8,
                  cursor: 'pointer',
                  textAlign: 'left' as const,
                  color: 'inherit',
                  fontFamily: 'inherit',
                }}
              >
                {/* Emoji */}
                <span style={{ fontSize: 32, flexShrink: 0 }}>{meal.emoji ?? '🍽️'}</span>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#e5e5e5', marginBottom: 4 }}>
                    {meal.name}
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#525252' }}>
                    {meal.prepTime && <span>{meal.prepTime}m prep</span>}
                    {meal.difficulty && <span>{meal.difficulty}</span>}
                  </div>
                  {meal.tags && meal.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {meal.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: 10,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: '#262626',
                            color: '#a3a3a3',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Favorite */}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(meal.id);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={meal.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggleFavorite(meal.id); } }}
                  style={{
                    fontSize: 20,
                    flexShrink: 0,
                    color: meal.isFavorite ? '#ef4444' : '#333',
                    cursor: 'pointer',
                    padding: 4,
                    minWidth: 44,
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {meal.isFavorite ? '♥' : '♡'}
                </span>
              </button>
            ))
          )}

          {/* FAB */}
          <button
            onClick={openNewMealForm}
            style={{
              position: 'fixed',
              bottom: 80,
              right: 20,
              width: 52,
              height: 52,
              borderRadius: 16,
              background: '#f59e0b',
              color: '#000',
              fontSize: 28,
              fontWeight: 300,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(245,158,11,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
              fontFamily: 'inherit',
            }}
          >
            +
          </button>

          {/* ── Meal form overlay ── */}
          {editingMeal !== null && (
            <div
              style={{
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: 0,
                top: 60,
                zIndex: 200,
                background: '#0a0a0a',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '16px 16px 0 0',
                animation: 'slideUp 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
              }}
            >
              {/* Form header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '14px 16px',
                  borderBottom: '1px solid #262626',
                  flexShrink: 0,
                }}
              >
                <button
                  onClick={() => setEditingMeal(null)}
                  style={{
                    padding: '4px 0',
                    minHeight: 44,
                    fontSize: 14,
                    fontWeight: 600,
                    border: 'none',
                    background: 'transparent',
                    color: '#f59e0b',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  aria-label="Go back"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                  Back
                </button>
                <span style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#fafafa' }}>
                  {editingMeal === 'new' ? 'Add Meal' : 'Edit Meal'}
                </span>
                <div style={{ width: 60 }} />
              </div>

              {/* Scrollable form body */}
              <div style={{ flex: 1, overflow: 'auto', padding: 16, scrollbarWidth: 'none' as const }}>
                {/* Name */}
                <div style={{ marginBottom: 18 }}>
                  <label htmlFor="meal-name" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                    Meal Name
                  </label>
                  <input
                    id="meal-name"
                    ref={nameInputRef}
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Chicken Stir Fry"
                    style={inputStyle}
                  />
                </div>

                {/* Emoji picker */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                    Emoji
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }}>
                    {FOOD_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setFormEmoji(emoji)}
                        aria-label={`Select ${emoji}`}
                        aria-pressed={formEmoji === emoji}
                        style={{
                          width: '100%',
                          aspectRatio: '1',
                          borderRadius: 8,
                          border: formEmoji === emoji ? '2px solid #f59e0b' : '2px solid transparent',
                          background: formEmoji === emoji ? 'rgba(245,158,11,0.12)' : '#171717',
                          cursor: 'pointer',
                          fontSize: 22,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prep time + Cook time (side by side) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                  <div>
                    <label htmlFor="meal-prep" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                      Prep Time
                    </label>
                    <input
                      id="meal-prep"
                      type="number"
                      value={formPrepTime}
                      onChange={(e) => setFormPrepTime(e.target.value ? Number(e.target.value) : '')}
                      placeholder="min"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label htmlFor="meal-cook" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                      Cook Time
                    </label>
                    <input
                      id="meal-cook"
                      type="number"
                      value={formCookTime}
                      onChange={(e) => setFormCookTime(e.target.value ? Number(e.target.value) : '')}
                      placeholder="min"
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Servings + Difficulty (side by side) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                  <div>
                    <label htmlFor="meal-servings" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                      Servings
                    </label>
                    <input
                      id="meal-servings"
                      type="number"
                      value={formServings}
                      onChange={(e) => setFormServings(e.target.value ? Number(e.target.value) : '')}
                      placeholder="4"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                      Difficulty
                    </label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(['easy', 'medium', 'hard'] as const).map((d) => {
                        const diffColors: Record<typeof d, { color: string; bg: string; border: string }> = {
                          easy:   { color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: '#10b981' },
                          medium: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: '#f59e0b' },
                          hard:   { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: '#ef4444' },
                        };
                        const isSelected = formDifficulty === d;
                        return (
                          <button
                            key={d}
                            onClick={() => setFormDifficulty(d)}
                            style={{
                              flex: 1,
                              padding: '10px 4px',
                              minHeight: 44,
                              fontSize: 12,
                              fontWeight: 600,
                              borderRadius: 8,
                              border: isSelected ? `1px solid ${diffColors[d].border}` : '1px solid #262626',
                              background: isSelected ? diffColors[d].bg : '#171717',
                              color: isSelected ? diffColors[d].color : '#525252',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            {d === 'easy' ? 'Easy' : d === 'medium' ? 'Med' : 'Hard'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Tags */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                    Tags
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {TAG_OPTIONS.map((tag) => {
                      const isActive = formTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => {
                            setFormTags((prev) =>
                              isActive ? prev.filter((t) => t !== tag) : [...prev, tag],
                            );
                          }}
                          style={{
                            padding: '6px 14px',
                            minHeight: 36,
                            fontSize: 12,
                            fontWeight: 600,
                            borderRadius: 999,
                            border: isActive ? '1px solid #f59e0b' : '1px solid #262626',
                            background: isActive ? 'rgba(245,158,11,0.15)' : '#171717',
                            color: isActive ? '#f59e0b' : '#525252',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Ingredients */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                    Ingredients
                  </label>
                  {formIngredients.map((ing, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                      <input
                        type="text"
                        placeholder="Name"
                        value={ing.name}
                        onChange={(e) => {
                          const next = [...formIngredients];
                          next[idx] = { ...next[idx], name: e.target.value };
                          setFormIngredients(next);
                        }}
                        style={{ ...inputStyle, flex: 2 }}
                      />
                      <input
                        type="text"
                        placeholder="Amount"
                        value={ing.amount ?? ''}
                        onChange={(e) => {
                          const next = [...formIngredients];
                          next[idx] = { ...next[idx], amount: e.target.value };
                          setFormIngredients(next);
                        }}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <select
                        value={ing.category ?? 'other'}
                        onChange={(e) => {
                          const next = [...formIngredients];
                          next[idx] = { ...next[idx], category: e.target.value as GroceryCategory };
                          setFormIngredients(next);
                        }}
                        style={{
                          ...inputStyle,
                          flex: 1,
                          appearance: 'none' as const,
                          paddingRight: 8,
                        }}
                      >
                        {GROCERY_CATEGORY_ORDER.map((cat) => (
                          <option key={cat} value={cat}>
                            {GROCERY_CATEGORIES[cat]}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          setFormIngredients((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 8,
                          border: '1px solid #262626',
                          background: 'transparent',
                          color: '#ef4444',
                          fontSize: 18,
                          cursor: 'pointer',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'inherit',
                        }}
                      >
                        &#215;
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setFormIngredients((prev) => [...prev, { name: '', amount: '', category: 'other' }])}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      minHeight: 44,
                      fontSize: 13,
                      fontWeight: 600,
                      borderRadius: 10,
                      border: '1px dashed #262626',
                      background: 'transparent',
                      color: '#525252',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    + Add ingredient
                  </button>
                </div>

                {/* Recipe URL */}
                <div style={{ marginBottom: 18 }}>
                  <label htmlFor="meal-url" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                    Recipe URL
                  </label>
                  <input
                    id="meal-url"
                    type="url"
                    value={formRecipeUrl}
                    onChange={(e) => setFormRecipeUrl(e.target.value)}
                    placeholder="https://..."
                    style={inputStyle}
                  />
                </div>

                {/* Notes */}
                <div style={{ marginBottom: 18 }}>
                  <label htmlFor="meal-notes" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                    Notes
                  </label>
                  <textarea
                    id="meal-notes"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Any notes about this meal..."
                    rows={3}
                    style={{
                      ...inputStyle,
                      resize: 'none' as const,
                      minHeight: 80,
                    }}
                  />
                </div>

                {/* Rating */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                    Rating
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setFormRating(formRating === star ? 0 : star)}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 8,
                          border: 'none',
                          background: star <= formRating ? 'rgba(245,158,11,0.2)' : '#171717',
                          color: star <= formRating ? '#f59e0b' : '#333',
                          fontSize: 22,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        &#9733;
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bottom spacing so content doesn't hide behind save bar */}
                <div style={{ height: 20 }} />
              </div>

              {/* Pinned save bar */}
              <div style={{ padding: '12px 16px 28px', borderTop: '1px solid #262626', flexShrink: 0 }}>
                {saveError && (
                  <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 8, textAlign: 'center' }}>
                    {saveError}
                  </div>
                )}
                <button
                  onClick={saveMealForm}
                  disabled={!formName.trim() || saving}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    minHeight: 50,
                    fontSize: 15,
                    fontWeight: 700,
                    borderRadius: 12,
                    border: 'none',
                    cursor: formName.trim() && !saving ? 'pointer' : 'default',
                    background: formName.trim() && !saving ? '#f59e0b' : '#333',
                    color: formName.trim() && !saving ? '#000' : '#666',
                    fontFamily: 'inherit',
                  }}
                >
                  {saving ? 'Saving...' : editingMeal === 'new' ? 'Save Meal' : 'Save Changes'}
                </button>
                {editingMeal !== 'new' && (
                  <button
                    onClick={deleteMeal}
                    style={{
                      width: '100%',
                      padding: '12px',
                      minHeight: 44,
                      marginTop: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      borderRadius: 10,
                      border: 'none',
                      background: 'transparent',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Delete Meal
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          Sub-View 4: Grocery
          ════════════════════════════════════════════════════════════ */}
      {subView === 'grocery' && (
        <div style={{ paddingBottom: 80 }}>
          {/* Header stats */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#e5e5e5' }}>
                {groceryStats.checked} of {groceryStats.total} items
              </span>
              <button
                style={{
                  padding: '6px 14px',
                  minHeight: 36,
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: '1px solid #262626',
                  background: '#171717',
                  color: '#a3a3a3',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Share
              </button>
            </div>
            {/* Progress bar */}
            <div style={{ height: 6, background: '#262626', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 3,
                  width: groceryStats.total > 0 ? `${(groceryStats.checked / groceryStats.total) * 100}%` : '0%',
                  backgroundColor: '#22c55e',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: '#525252' }}>
              Auto-generated from this week&apos;s meals
            </div>
          </div>

          {/* Empty state */}
          {groceryStats.total === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 16px' }}>
              <p style={{ fontSize: 15, color: '#737373', marginBottom: 4 }}>No grocery items</p>
              <p style={{ fontSize: 13, color: '#525252' }}>
                Plan meals with ingredients to see your shopping list.
              </p>
            </div>
          )}

          {/* Category groups */}
          {Array.from(groceryList.entries()).map(([catKey, { items }]) => {
            const catChecked = items.filter((i) => i.checked).length;
            return (
            <div key={catKey} style={{ marginBottom: 20 }}>
              {/* Category header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                {GROCERY_CATEGORY_ICONS[catKey] && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#525252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={GROCERY_CATEGORY_ICONS[catKey]} />
                  </svg>
                )}
                <span style={{ fontSize: 12, fontWeight: 700, color: '#525252', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {GROCERY_CATEGORIES[catKey] ?? catKey}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 8,
                    background: '#171717',
                    color: '#525252',
                    fontWeight: 500,
                    marginLeft: 'auto',
                  }}
                >
                  {catChecked}/{items.length}
                </span>
              </div>

              {/* Items */}
              {items.map((item) => (
                <button
                  key={item.name}
                  onClick={() => toggleGroceryItem(item.name)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '11px 12px',
                    minHeight: 44,
                    marginBottom: 4,
                    borderRadius: 10,
                    border: '1px solid #262626',
                    background: '#171717',
                    cursor: 'pointer',
                    opacity: item.checked ? 0.45 : 1,
                    transition: 'all 0.15s',
                    textAlign: 'left' as const,
                    color: 'inherit',
                    fontFamily: 'inherit',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {/* Checkbox */}
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      background: item.checked ? '#22c55e' : 'transparent',
                      border: item.checked ? 'none' : '2px solid #525252',
                      transition: 'all 0.15s',
                    }}
                  >
                    {item.checked && (
                      <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>&#10003;</span>
                    )}
                  </div>

                  {/* Name */}
                  <span
                    style={{
                      flex: 1,
                      fontSize: 14,
                      fontWeight: 500,
                      color: item.checked ? '#525252' : '#e5e5e5',
                      textDecoration: item.checked ? 'line-through' : 'none',
                    }}
                  >
                    {item.name}
                  </span>

                  {/* Amount */}
                  {item.amount && (
                    <span style={{ fontSize: 12, color: '#525252', flexShrink: 0 }}>
                      {item.amount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            );
          })}
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmAction && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
          }}
          onClick={() => setConfirmAction(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1a1a1a',
              borderRadius: 16,
              padding: '20px 24px',
              maxWidth: 320,
              width: '90%',
              border: '1px solid #262626',
            }}
          >
            <p style={{ fontSize: 15, color: '#e5e5e5', marginBottom: 20, lineHeight: 1.5 }}>
              {confirmAction.message}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmAction(null)}
                style={{
                  flex: 1,
                  padding: '12px',
                  minHeight: 44,
                  borderRadius: 10,
                  border: '1px solid #262626',
                  background: '#171717',
                  color: '#a3a3a3',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmAction.onConfirm}
                style={{
                  flex: 1,
                  padding: '12px',
                  minHeight: 44,
                  borderRadius: 10,
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save error toast */}
      {saveError && !editingMeal && (
        <div
          style={{
            position: 'fixed',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#ef4444',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            zIndex: 250,
            boxShadow: '0 4px 20px rgba(239,68,68,0.3)',
            cursor: 'pointer',
          }}
          onClick={() => setSaveError(null)}
          role="alert"
        >
          {saveError}
        </div>
      )}

      {/* Inline keyframe for form overlay slide-up animation */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}
