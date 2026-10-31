'use client';

import type { CSSProperties } from 'react';
import type { SavedMeal } from '@/types/config';
import Glyph from '@/components/ui/Glyph';
import { useAuthImage } from '@/components/display/useAuthImage';
import { DEFAULT_MEAL_EMOJI } from '@/lib/meal-constants';
import { parseMealieMealId } from '@/lib/mealie-map';

/** The size of Mealie's copy to ask for: `tiny` for rows and cells, `full` for a photo that fills the wall. */
export type MealPhotoSize = 'tiny' | 'min' | 'full';

/** Rounded the same at every size, so a cell photo and a hero photo are one shape. */
const PHOTO_RADIUS = '18%';

export function mealPhotoSrc(meal: SavedMeal | null | undefined, size: MealPhotoSize): string | undefined {
  if (!meal?.photoUrl) return undefined;
  return `${meal.photoUrl}${meal.photoUrl.includes('?') ? '&' : '?'}size=${size}`;
}

/**
 * Whether a meal has a picture to draw: its photo, its emoji, or the plate a
 * Mealie recipe without a photo gets. A meal typed straight into the day has
 * none.
 */
export function mealHasPicture(meal: SavedMeal | null | undefined): boolean {
  return !!meal && (!!meal.photoUrl || !!meal.emoji || parseMealieMealId(meal.id) !== null);
}

interface MealPictureProps {
  meal: SavedMeal | null | undefined;
  /** The photo's square, as a CSS length. */
  photoSize: string;
  /** Wraps an emoji drawn instead; omit to draw it at the surrounding size. */
  emojiStyle?: CSSProperties;
  /** Which of Mealie's copies to load. */
  size?: MealPhotoSize;
  /** A household picture (`custom:<id>`) in the emoji's place uses this size. */
  pictureSize?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * A dish's picture wherever a meal view draws one: the recipe photo from
 * Mealie, otherwise the meal's emoji (or a household picture), otherwise the
 * plate for a Mealie recipe with no photo. Draws nothing for typed text.
 *
 * The photo loads through the hub (`/api/mealie/image`) with the display's
 * sign-in, so a wall never talks to Mealie itself. Until it arrives the box
 * holds its place as a soft square, so the name beside it does not jump.
 */
export default function MealPicture({ meal, photoSize, emojiStyle, size = 'tiny', pictureSize, className, style }: MealPictureProps) {
  const src = useAuthImage(mealPhotoSrc(meal, size));
  if (!meal) return null;
  if (meal.photoUrl) {
    const box: CSSProperties = {
      width: photoSize,
      height: photoSize,
      borderRadius: PHOTO_RADIUS,
      flexShrink: 0,
      display: 'block',
      objectFit: 'cover',
      backgroundColor: 'rgba(127,127,127,0.25)',
      ...style,
    };
    return src ? <img src={src} alt="" aria-hidden className={className} style={box} draggable={false} /> : <span aria-hidden className={className} style={box} />;
  }
  if (!mealHasPicture(meal)) return null;
  // Not hidden from screen readers: a household picture carries its own name
  // ("Taco night"), as it did before photos came along.
  return (
    <span className={className} style={{ ...emojiStyle, ...style }}>
      <Glyph value={meal.emoji ?? DEFAULT_MEAL_EMOJI} fallback={DEFAULT_MEAL_EMOJI} pictureSize={pictureSize} />
    </span>
  );
}
