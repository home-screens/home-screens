'use client';

import { useState, useEffect, useMemo } from 'react';
import type { SavedMeal, MealIngredient, GroceryCategory } from '@/types/config';
import { MEAL_TAGS, FOOD_EMOJIS, formatTagLabel, normalizeTag, capitalize, DEFAULT_MEAL_EMOJI } from '@/lib/meal-constants';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import Button from '@/components/ui/Button';

/** All selectable categories for ingredient editing (includes seafood, which the grocery list merges into meat) */
const INGREDIENT_CATEGORIES: GroceryCategory[] = [
  'produce', 'dairy', 'meat', 'seafood', 'bakery', 'pantry', 'frozen', 'beverages', 'other',
];

/** Searchable keywords for each food emoji */
const EMOJI_KEYWORDS: Record<string, string[]> = {
  '🍳': ['eggs', 'fried', 'breakfast'],
  '🥞': ['pancakes', 'breakfast'],
  '🧇': ['waffle', 'breakfast'],
  '🥣': ['cereal', 'oatmeal', 'breakfast', 'bowl'],
  '🥗': ['salad', 'healthy', 'vegetables'],
  '🥪': ['sandwich', 'lunch'],
  '🌮': ['taco', 'mexican'],
  '🌯': ['burrito', 'wrap', 'mexican'],
  '🍕': ['pizza', 'italian'],
  '🍔': ['burger', 'hamburger'],
  '🍝': ['pasta', 'spaghetti', 'italian'],
  '🍜': ['noodles', 'ramen', 'soup', 'asian'],
  '🍲': ['stew', 'soup', 'pot'],
  '🥘': ['curry', 'casserole', 'pan'],
  '🍛': ['curry', 'rice', 'indian'],
  '🍣': ['sushi', 'japanese', 'fish'],
  '🍱': ['bento', 'japanese', 'box'],
  '🥩': ['steak', 'meat', 'beef'],
  '🍗': ['chicken', 'poultry', 'drumstick'],
  '🐟': ['fish', 'seafood'],
  '🥦': ['broccoli', 'vegetable', 'green'],
  '🥕': ['carrot', 'vegetable'],
  '🌽': ['corn', 'vegetable'],
  '🥑': ['avocado', 'guacamole'],
  '🍅': ['tomato', 'vegetable'],
  '🫑': ['pepper', 'vegetable', 'bell pepper'],
  '🧀': ['cheese', 'dairy'],
  '🥚': ['egg', 'breakfast'],
  '🍞': ['bread', 'toast', 'bakery'],
  '🥐': ['croissant', 'pastry', 'bakery', 'breakfast'],
  '🍰': ['cake', 'dessert'],
  '🧁': ['cupcake', 'dessert'],
  '🍪': ['cookie', 'dessert', 'snack'],
  '🍩': ['donut', 'doughnut', 'dessert'],
  '🍫': ['chocolate', 'dessert', 'candy'],
  '🥤': ['drink', 'soda', 'smoothie', 'beverage'],
  '☕': ['coffee', 'drink', 'beverage', 'hot'],
  '🍵': ['tea', 'drink', 'beverage', 'hot'],
  '🧃': ['juice', 'drink', 'beverage'],
  '🥛': ['milk', 'drink', 'dairy', 'beverage'],
  '🥧': ['pie', 'dessert'],
  '🍿': ['popcorn', 'snack'],
  '🥜': ['peanuts', 'nuts', 'snack'],
  '🫘': ['beans', 'legumes'],
  '🍓': ['strawberry', 'fruit', 'berry'],
  '🍌': ['banana', 'fruit'],
  '🍎': ['apple', 'fruit'],
  '🥝': ['kiwi', 'fruit'],
};

interface SidebarDetailProps {
  meal: SavedMeal | null;
  onSave: (updated: SavedMeal) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export default function SidebarDetail({ meal, onSave, onDelete, onToggleFavorite }: SidebarDetailProps) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [prepTime, setPrepTime] = useState<number | undefined>(undefined);
  const [cookTime, setCookTime] = useState<number | undefined>(undefined);
  const [servings, setServings] = useState<number | undefined>(undefined);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState<MealIngredient[]>([]);
  const [recipeUrl, setRecipeUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [emojiSearch, setEmojiSearch] = useState('');

  const filteredEmojis = useMemo(() => {
    if (!emojiSearch) return FOOD_EMOJIS as readonly string[];
    const q = emojiSearch.toLowerCase();
    return (FOOD_EMOJIS as readonly string[]).filter(
      (e) => EMOJI_KEYWORDS[e]?.some((kw) => kw.includes(q)),
    );
  }, [emojiSearch]);

  // Reinitialize all local state when the meal changes
  useEffect(() => {
    if (!meal) return;
    setName(meal.name);
    setEmoji(meal.emoji ?? '');
    setPrepTime(meal.prepTime);
    setCookTime(meal.cookTime);
    setServings(meal.servings);
    setDifficulty(meal.difficulty);
    setTags((meal.tags ?? []).map(normalizeTag));
    setIngredients(meal.ingredients ? meal.ingredients.map((i) => ({ ...i })) : []);
    setRecipeUrl(meal.recipeUrl ?? '');
    setNotes(meal.notes ?? '');
    setRating(meal.rating);
    setEmojiSearch('');
  }, [meal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!meal) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-hs-text-faint gap-3">
        <span className="text-3xl opacity-15">&#9998;</span>
        <p className="text-sm leading-relaxed">Select a meal from the Library tab<br />to edit its details</p>
      </div>
    );
  }

  function handleSave() {
    if (!meal) return;
    const assembled: SavedMeal = {
      id: meal.id,
      name: name.trim(),
      emoji: emoji || undefined,
      prepTime: prepTime || undefined,
      cookTime: cookTime || undefined,
      servings: servings || undefined,
      difficulty: difficulty,
      tags: tags.length > 0 ? tags : undefined,
      ingredients:
        ingredients.filter((i) => i.name.trim()).length > 0
          ? ingredients.filter((i) => i.name.trim())
          : undefined,
      recipeUrl: recipeUrl.trim() || undefined,
      notes: notes.trim() || undefined,
      rating: rating || undefined,
      isFavorite: meal.isFavorite,
    };
    onSave(assembled);
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function updateIngredient(index: number, field: keyof MealIngredient, value: string) {
    setIngredients((prev) => {
      const next = prev.map((i) => ({ ...i }));
      if (field === 'category') {
        next[index].category = value ? (value as GroceryCategory) : undefined;
      } else {
        next[index][field] = value;
      }
      return next;
    });
  }

  function removeIngredient(index: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, { name: '', amount: '', category: undefined }]);
  }

  const labelClass = 'text-[11px] font-bold text-hs-text-faint uppercase tracking-wider mb-1.5';

  return (
    <>
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-hs-border-strong">
          <span className="text-4xl">{emoji || DEFAULT_MEAL_EMOJI}</span>
          <div className="flex-1">
            <div className="text-lg font-bold text-hs-text-body">{name || 'Untitled'}</div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="text-base transition-colors"
                  style={{ color: rating && star <= rating ? '#f59e0b' : 'var(--hs-text-faint)' }}
                  onClick={() => setRating(star === rating ? undefined : star)}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="text-xl transition-colors"
            style={{ color: meal.isFavorite ? 'var(--hs-danger)' : 'var(--hs-text-faint)' }}
            onClick={() => onToggleFavorite(meal.id)}
          >
            {meal.isFavorite ? '♥' : '♡'}
          </button>
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className={labelClass}>Name</label>
          <input
            type="text"
            className={MODAL_INPUT_CLASS}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Emoji grid */}
        <div className="mb-4">
          <label className={labelClass}>Emoji</label>
          <input
            type="text"
            className={`${MODAL_INPUT_CLASS} mb-2`}
            placeholder="Search emojis (e.g. pizza, breakfast, dessert)..."
            value={emojiSearch}
            onChange={(e) => setEmojiSearch(e.target.value)}
          />
          <div className="grid grid-cols-6 gap-1">
            {filteredEmojis.map((e) => (
              <button
                key={e}
                type="button"
                className={`aspect-square rounded border-2 text-2xl flex items-center justify-center transition ${
                  emoji === e
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-transparent bg-hs-card hover:bg-hs-hover hover:border-hs-border-strong'
                }`}
                onClick={() => setEmoji(emoji === e ? '' : e)}
              >
                {e}
              </button>
            ))}
            {filteredEmojis.length === 0 && (
              <div className="col-span-6 py-4 text-center text-xs text-hs-text-faint">
                No emojis match &ldquo;{emojiSearch}&rdquo;
              </div>
            )}
          </div>
        </div>

        {/* Prep Time / Cook Time */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelClass}>Prep Time</label>
            <input
              type="number"
              className={MODAL_INPUT_CLASS}
              placeholder="min"
              value={prepTime ?? ''}
              onChange={(e) => setPrepTime(e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div>
            <label className={labelClass}>Cook Time</label>
            <input
              type="number"
              className={MODAL_INPUT_CLASS}
              placeholder="min"
              value={cookTime ?? ''}
              onChange={(e) => setCookTime(e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
        </div>

        {/* Servings / Difficulty */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelClass}>Servings</label>
            <input
              type="number"
              className={MODAL_INPUT_CLASS}
              value={servings ?? ''}
              onChange={(e) => setServings(e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div>
            <label className={labelClass}>Difficulty</label>
            <div className="flex gap-1">
              {(['easy', 'medium', 'hard'] as const).map((level) => {
                const isActive = difficulty === level;
                const colorMap = {
                  easy: 'border-emerald-500 bg-emerald-500/8 text-emerald-500',
                  medium: 'border-amber-500 bg-amber-500/8 text-amber-500',
                  hard: 'border-hs-danger bg-hs-danger/8 text-hs-danger',
                };
                return (
                  <button
                    key={level}
                    type="button"
                    className={`flex-1 py-2 text-xs font-semibold rounded border transition text-center ${
                      isActive
                        ? colorMap[level]
                        : 'border-hs-border-strong bg-hs-card text-hs-text-faint'
                    }`}
                    onClick={() => setDifficulty(isActive ? undefined : level)}
                  >
                    {capitalize(level)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="mb-4">
          <label className={labelClass}>Tags</label>
          <div className="flex flex-wrap gap-1.5">
            {MEAL_TAGS.map((tag) => {
              const isActive = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={`px-3 py-1 text-xs font-semibold rounded-full border transition cursor-pointer ${
                    isActive
                      ? 'border-amber-500/50 bg-amber-500/10 text-amber-500'
                      : 'border-hs-border-strong text-hs-text-faint hover:border-hs-text-faint'
                  }`}
                  onClick={() => toggleTag(tag)}
                >
                  {formatTagLabel(tag)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ingredients */}
        <div className="mb-4">
          <label className={labelClass}>Ingredients</label>
          {ingredients.map((ingredient, index) => (
            <div
              key={index}
              className="bg-hs-card border border-hs-border-strong rounded-md p-2 mb-1.5"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  className={`flex-1 ${MODAL_INPUT_CLASS}`}
                  placeholder="Ingredient name"
                  value={ingredient.name}
                  onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                />
                <button
                  type="button"
                  className="w-7 h-7 rounded border border-hs-border-strong text-hs-text-faint hover:text-hs-danger hover:border-hs-danger hover:bg-hs-danger/8 flex items-center justify-center transition"
                  onClick={() => removeIngredient(index)}
                >
                  &times;
                </button>
              </div>
              <div className="flex gap-2 mt-1.5">
                <input
                  type="text"
                  className={`flex-1 ${MODAL_INPUT_CLASS}`}
                  placeholder="Amount"
                  value={ingredient.amount ?? ''}
                  onChange={(e) => updateIngredient(index, 'amount', e.target.value)}
                />
                <div className="relative w-28 shrink-0">
                  <select
                    className={`w-full appearance-none ${MODAL_INPUT_CLASS} pr-7 cursor-pointer`}
                    style={{ color: ingredient.category ? undefined : '#737373' }}
                    value={ingredient.category ?? ''}
                    onChange={(e) =>
                      updateIngredient(index, 'category', e.target.value)
                    }
                  >
                    <option value="">Category</option>
                    {INGREDIENT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {capitalize(cat)}
                      </option>
                    ))}
                  </select>
                  <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-hs-text-faint" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="w-full py-2 text-xs font-semibold border border-dashed border-hs-border-strong rounded-md text-hs-text-faint hover:border-hs-border-strong hover:text-hs-text-muted transition"
            onClick={addIngredient}
          >
            + Add ingredient
          </button>
        </div>

        {/* Recipe URL */}
        <div className="mb-4">
          <label className={labelClass}>Recipe URL</label>
          <input
            type="url"
            className={MODAL_INPUT_CLASS}
            placeholder="https://..."
            value={recipeUrl}
            onChange={(e) => setRecipeUrl(e.target.value)}
          />
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label className={labelClass}>Notes</label>
          <textarea
            rows={3}
            className={`${MODAL_INPUT_CLASS} resize-none`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Pinned footer */}
      <div className="px-4 py-2.5 border-t border-hs-border-strong flex gap-2">
        <Button variant="primary" className="flex-1" onClick={handleSave}>
          Save Changes
        </Button>
        <Button variant="danger" onClick={() => onDelete(meal.id)}>
          Delete
        </Button>
      </div>
    </>
  );
}
