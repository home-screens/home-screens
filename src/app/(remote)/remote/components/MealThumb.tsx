'use client';

import { Pencil } from 'lucide-react';
import type { SavedMeal } from '@/types/config';
import MealPicture, { mealHasPicture } from '@/components/meals/MealPicture';
import { isMealieMeal } from '@/lib/meal-dish-rules';

interface MealThumbProps {
  /** The dish's saved meal; null for words typed in instead of a meal. */
  meal: SavedMeal | null | undefined;
  /** Draw the pencil box for typed words (the meal sheet's rows), or nothing (week and plan rows). */
  typedMark?: boolean;
  /** The square's side, in px. */
  size: number;
  radius: number;
  /** An emoji's font size inside the square. */
  emojiSize: number;
}

/**
 * A dish's picture on the phone, as a fixed square so names line up: the
 * Mealie photo, else the meal's emoji, else the plate on a soft square for a
 * Mealie recipe with no photo. Typed words get a dashed pencil box where the
 * sheet asks for one, and no square otherwise.
 */
export default function MealThumb({ meal, typedMark = false, size, radius, emojiSize }: MealThumbProps) {
  const box = { width: size, height: size, borderRadius: radius, flex: 'none' as const };
  if (!meal || !mealHasPicture(meal)) {
    if (!typedMark || meal) return null;
    return (
      <span
        aria-hidden
        style={{
          ...box,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed var(--hs-border-strong)',
          color: 'var(--hs-text-faint)',
          boxSizing: 'border-box',
        }}
      >
        <Pencil size={Math.round(size * 0.42)} strokeWidth={2} />
      </span>
    );
  }
  const plate = isMealieMeal(meal) && !meal.photoUrl;
  return (
    <MealPicture
      meal={meal}
      photoSize={`${size}px`}
      pictureSize={`${Math.round(size * 0.7)}px`}
      style={{ borderRadius: radius }}
      emojiStyle={{
        ...box,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: emojiSize,
        lineHeight: 1,
        background: plate ? 'var(--hs-bg-card)' : 'transparent',
      }}
    />
  );
}
