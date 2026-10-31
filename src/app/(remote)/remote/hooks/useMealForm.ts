'use client';

import { ingredientsToSave } from '@/lib/meal-ingredients';
import { useState, useRef } from 'react';
import type { SavedMeal, MealIngredient } from '@/types/config';
import { uuid } from '@/lib/uuid';
import { kindToSave, mealKind } from '@/lib/meal-dish-rules';
import { DEFAULT_MEAL_EMOJI } from '@/lib/meal-constants';

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
  const [formRating, setFormRating] = useState(0);
  const [formFavorite, setFormFavorite] = useState(false);
  // What kind of dish it is: "Add a side" lists the sides first.
  const [formCategory, setFormCategory] = useState<NonNullable<SavedMeal['category']>>('main');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const openNew = (clearError: () => void) => {
    setFormName('');
    setFormEmoji(DEFAULT_MEAL_EMOJI);
    setFormPrepTime('');
    setFormCookTime('');
    setFormServings('');
    setFormDifficulty(undefined);
    setFormTags([]);
    setFormIngredients([]);
    setFormRecipeUrl('');
    setFormNotes('');
    setFormRating(0);
    setFormFavorite(false);
    setFormCategory('main');
    clearError();
    setEditingMeal('new');
    setTimeout(() => nameInputRef.current?.focus(), 350);
  };

  const openEdit = (meal: SavedMeal, clearError: () => void) => {
    setFormName(meal.name);
    setFormEmoji(meal.emoji ?? DEFAULT_MEAL_EMOJI);
    setFormPrepTime(meal.prepTime ?? '');
    setFormCookTime(meal.cookTime ?? '');
    setFormServings(meal.servings ?? '');
    setFormDifficulty(meal.difficulty);
    setFormTags(meal.tags ?? []);
    setFormIngredients(meal.ingredients ?? []);
    setFormRecipeUrl(meal.recipeUrl ?? '');
    setFormNotes(meal.notes ?? '');
    setFormRating(meal.rating ?? 0);
    setFormFavorite(meal.isFavorite ?? false);
    setFormCategory(mealKind(meal));
    clearError();
    setEditingMeal(meal);
    setTimeout(() => nameInputRef.current?.focus(), 350);
  };

  const buildMealData = (): SavedMeal => ({
    id: editingMeal === 'new' ? uuid() : (editingMeal as SavedMeal).id,
    name: formName.trim(),
    emoji: formEmoji || undefined,
    prepTime: formPrepTime ? Number(formPrepTime) : undefined,
    cookTime: formCookTime ? Number(formCookTime) : undefined,
    servings: formServings ? Number(formServings) : undefined,
    difficulty: formDifficulty,
    category: kindToSave(formCategory, editingMeal === 'new' ? undefined : (editingMeal as SavedMeal).category),
    tags: formTags.length > 0 ? formTags : undefined,
    ingredients: ingredientsToSave(formIngredients),
    recipeUrl: formRecipeUrl.trim() || undefined,
    notes: formNotes.trim() || undefined,
    rating: formRating > 0 ? formRating : undefined,
    isFavorite: formFavorite || undefined,
  });

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
    formRating,
    setFormRating,
    formFavorite,
    setFormFavorite,
    nameInputRef,
    openNew,
    openEdit,
    buildMealData,
  };
}

export type MealFormState = ReturnType<typeof useMealForm>;
