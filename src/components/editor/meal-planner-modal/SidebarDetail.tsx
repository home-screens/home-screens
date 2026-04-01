'use client';

import { useState, useEffect } from 'react';
import type { SavedMeal, MealIngredient, GroceryCategory } from '@/types/config';
import { MEAL_TAGS, FOOD_EMOJIS } from '@/components/modules/meal-planner/types';
import { INPUT } from '@/components/editor/CRUDModalShell';
import Button from '@/components/ui/Button';

interface SidebarDetailProps {
  meal: SavedMeal | null;
  onSave: (updated: SavedMeal) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

const GROCERY_CATEGORIES: GroceryCategory[] = [
  'produce', 'dairy', 'meat', 'seafood', 'bakery', 'pantry', 'frozen', 'beverages', 'other',
];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

  // Reinitialize all local state when the meal changes
  useEffect(() => {
    if (!meal) return;
    setName(meal.name);
    setEmoji(meal.emoji ?? '');
    setPrepTime(meal.prepTime);
    setCookTime(meal.cookTime);
    setServings(meal.servings);
    setDifficulty(meal.difficulty);
    setTags(meal.tags ?? []);
    setIngredients(meal.ingredients ? meal.ingredients.map((i) => ({ ...i })) : []);
    setRecipeUrl(meal.recipeUrl ?? '');
    setNotes(meal.notes ?? '');
    setRating(meal.rating);
  }, [meal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!meal) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-neutral-500 gap-3">
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

  const labelClass = 'text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5';

  return (
    <>
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-neutral-700">
          <span className="text-4xl">{emoji || '🍽️'}</span>
          <div className="flex-1">
            <div className="text-lg font-bold text-neutral-200">{name || 'Untitled'}</div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="text-base transition-colors"
                  style={{ color: rating && star <= rating ? '#f59e0b' : '#525252' }}
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
            style={{ color: meal.isFavorite ? '#ef4444' : '#525252' }}
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
            className={INPUT}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Emoji grid */}
        <div className="mb-4">
          <label className={labelClass}>Emoji</label>
          <div className="grid grid-cols-8 gap-1">
            {FOOD_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className={`aspect-square rounded border-2 text-lg flex items-center justify-center transition ${
                  emoji === e
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-transparent bg-neutral-800 hover:bg-neutral-700 hover:border-neutral-600'
                }`}
                onClick={() => setEmoji(emoji === e ? '' : e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Prep Time / Cook Time */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelClass}>Prep Time</label>
            <input
              type="number"
              className={INPUT}
              placeholder="min"
              value={prepTime ?? ''}
              onChange={(e) => setPrepTime(e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div>
            <label className={labelClass}>Cook Time</label>
            <input
              type="number"
              className={INPUT}
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
              className={INPUT}
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
                  hard: 'border-red-500 bg-red-500/8 text-red-500',
                };
                return (
                  <button
                    key={level}
                    type="button"
                    className={`flex-1 py-2 text-xs font-semibold rounded border transition text-center ${
                      isActive
                        ? colorMap[level]
                        : 'border-neutral-700 bg-neutral-800 text-neutral-500'
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
                      : 'border-neutral-700 text-neutral-500 hover:border-neutral-600'
                  }`}
                  onClick={() => toggleTag(tag)}
                >
                  {capitalize(tag)}
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
              className="bg-neutral-800 border border-neutral-700 rounded-md p-2 mb-1.5"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  className={`flex-1 ${INPUT}`}
                  placeholder="Ingredient name"
                  value={ingredient.name}
                  onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                />
                <button
                  type="button"
                  className="w-7 h-7 rounded border border-neutral-700 text-neutral-600 hover:text-red-400 hover:border-red-400 hover:bg-red-500/8 flex items-center justify-center transition"
                  onClick={() => removeIngredient(index)}
                >
                  &times;
                </button>
              </div>
              <div className="flex gap-2 mt-1.5">
                <input
                  type="text"
                  className={`w-24 ${INPUT}`}
                  placeholder="Amount"
                  value={ingredient.amount ?? ''}
                  onChange={(e) => updateIngredient(index, 'amount', e.target.value)}
                />
                <select
                  className={`flex-1 ${INPUT}`}
                  value={ingredient.category ?? ''}
                  onChange={(e) =>
                    updateIngredient(index, 'category', e.target.value)
                  }
                >
                  <option value="">Category...</option>
                  {GROCERY_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {capitalize(cat)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="w-full py-2 text-xs font-semibold border border-dashed border-neutral-700 rounded-md text-neutral-600 hover:border-neutral-500 hover:text-neutral-400 transition"
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
            className={INPUT}
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
            className={`${INPUT} resize-none`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Pinned footer */}
      <div className="px-4 py-2.5 border-t border-neutral-700 flex gap-2">
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
