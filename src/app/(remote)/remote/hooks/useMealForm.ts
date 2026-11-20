'use client';

import { useState, useRef } from 'react';
import type { SavedMeal, MealIngredient } from '@/types/config';
import { uuid } from '@/lib/uuid';
import { buildSavedMeal, mealFormFields } from '@/lib/meal-dish-rules';

export function useMealForm() {
  const [editingMeal, setEditingMeal] = useState<SavedMeal | 'new' | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmoji, setFormEmoji] = useState('');
  const [formPrepTime, setFormPrepTime] = useState<number | ''>('');
  const [formCookTime, setFormCookTime] = useState<number | ''>('');
  const [formServings, setFormServings] = useState<number | ''>('');
  const [formDifficulty, setFormDifficulty] = useState<SavedMeal['difficulty']>(undefined);
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formIngredients, setFormIngredients] = useState<MealIngredient[]>([]);
  const [formRecipeUrl, setFormRecipeUrl] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formFavorite, setFormFavorite] = useState(false);
  // What kind of dish it is: "Add a side" lists the sides first.
  const [formCategory, setFormCategory] = useState<NonNullable<SavedMeal['category']>>('main');
  const nameInputRef = useRef<HTMLInputElement>(null);

  /** Fill the form from a saved meal, or with a new meal's values (`null`); the defaults are `mealFormFields`'. */
  const fill = (meal: SavedMeal | null) => {
    const fields = mealFormFields(meal);
    setFormName(fields.name);
    setFormEmoji(fields.emoji);
    setFormPrepTime(fields.prepTime ?? '');
    setFormCookTime(fields.cookTime ?? '');
    setFormServings(fields.servings ?? '');
    setFormDifficulty(fields.difficulty);
    setFormTags(fields.tags);
    setFormIngredients(fields.ingredients);
    setFormRecipeUrl(fields.recipeUrl);
    setFormNotes(fields.notes);
    setFormFavorite(fields.favorite);
    setFormCategory(fields.kind);
  };

  const openNew = (clearError: () => void) => {
    fill(null);
    clearError();
    setEditingMeal('new');
    setTimeout(() => nameInputRef.current?.focus(), 350);
  };

  const openEdit = (meal: SavedMeal, clearError: () => void) => {
    fill(meal);
    clearError();
    setEditingMeal(meal);
    setTimeout(() => nameInputRef.current?.focus(), 350);
  };

  /** The meal the form saves; null while it has no name. */
  const buildMealData = (): SavedMeal | null => buildSavedMeal(
    {
      name: formName, emoji: formEmoji, prepTime: formPrepTime, cookTime: formCookTime, servings: formServings,
      difficulty: formDifficulty, kind: formCategory, tags: formTags, ingredients: formIngredients,
      recipeUrl: formRecipeUrl, notes: formNotes, favorite: formFavorite,
    },
    editingMeal === 'new' ? null : editingMeal,
    uuid,
  );

  return {
    editingMeal,
    setEditingMeal,
    formName,
    setFormName,
    formEmoji,
    setFormEmoji,
    formPrepTime,
    setFormPrepTime,
    formCookTime,
    setFormCookTime,
    formServings,
    setFormServings,
    formDifficulty,
    setFormDifficulty,
    formCategory,
    setFormCategory,
    formTags,
    setFormTags,
    formIngredients,
    setFormIngredients,
    formRecipeUrl,
    setFormRecipeUrl,
    formNotes,
    setFormNotes,
    formFavorite,
    setFormFavorite,
    nameInputRef,
    openNew,
    openEdit,
    buildMealData,
  };
}

export type MealFormState = ReturnType<typeof useMealForm>;
