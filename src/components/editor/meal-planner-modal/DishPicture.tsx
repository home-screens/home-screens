'use client';

import { Pencil } from 'lucide-react';
import type { SavedMeal } from '@/types/config';
import { DEFAULT_MEAL_EMOJI } from '@/lib/meal-constants';
import MealPicture, { mealHasPicture } from '@/components/meals/MealPicture';
import Glyph from '@/components/ui/Glyph';

/**
 * A dish's picture at `size` px: its photo or emoji, the plate for a saved
 * meal with neither. Typed text has no picture: the week grid gives it the
 * plate as it always has, the meal popover a pencil (`typed="pencil"`) so a
 * typed course reads as typed.
 */
export default function DishPicture({
  meal,
  size,
  typed = 'plate',
}: {
  meal: SavedMeal | null;
  size: number;
  typed?: 'plate' | 'pencil';
}) {
  if (!meal && typed === 'pencil') return <TypedMark size={size} />;
  const emojiStyle = { fontSize: Math.round(size * 0.68), width: size, textAlign: 'center' as const, lineHeight: 1, flexShrink: 0 };
  if (meal && mealHasPicture(meal)) return <MealPicture meal={meal} photoSize={`${size}px`} emojiStyle={emojiStyle} />;
  return (
    <span aria-hidden style={emojiStyle}>
      <Glyph value={DEFAULT_MEAL_EMOJI} fallback={DEFAULT_MEAL_EMOJI} />
    </span>
  );
}

/** A typed meal or course has no picture: a pencil in a dashed square says it was typed. */
function TypedMark({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className="shrink-0 rounded-md border border-dashed border-hs-border-strong text-hs-text-faint flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <Pencil style={{ width: size * 0.4, height: size * 0.4 }} />
    </span>
  );
}
