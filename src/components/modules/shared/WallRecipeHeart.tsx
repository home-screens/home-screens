'use client';

import type { CSSProperties } from 'react';
import type { SavedMeal } from '@/types/config';
import { useTranslate } from '@/i18n';
import { displayFetch } from '@/lib/display-fetch';
import { useMealFavorite } from '@/components/meals/useMealFavorite';
import { BookIcon, type Px } from './recipe-book/RecipeBookParts';
import { recipeCardActionStyle } from './recipe-card-actions';
import { wallPressProps } from './wallPress';

/** The heart's red, the same on the light and the dark full-screen themes. */
const HEART_RED = '#e0453a';

/**
 * A recipe's heart on the wall: on the corner of a Recipe book tile's
 * picture, or under the recipe card's close button, the same size as it. On a
 * touch wall it is a button that hearts the recipe, in Mealie's favorites for
 * a Mealie recipe and in the family's own for theirs, the list the Favorites
 * chip shows. Without touch a tile shows only the red heart of a favorite.
 * A heart that does not save goes back to how it was; there is nothing on the
 * wall to fix, so it says no more.
 */
export function WallRecipeHeart({ meal, P, place, interactive = true }: {
  meal: Pick<SavedMeal, 'id' | 'name' | 'isFavorite'>;
  P: Px;
  place: 'tile' | 'card';
  interactive?: boolean;
}) {
  const t = useTranslate('modules');
  const { isFavorite, toggle } = useMealFavorite(meal, displayFetch);
  if (isFavorite === null || (!interactive && !isFavorite)) return null;
  const tile = place === 'tile';
  const size = P(tile ? 76 : 92);
  const style: CSSProperties = {
    position: 'absolute',
    ...(tile ? { top: P(14), right: P(14) } : { top: P(136), right: P(28) }),
    width: size,
    height: size,
    borderRadius: '50%',
    border: 0,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...(!tile ? recipeCardActionStyle(P, 1) : {}),
    color: isFavorite ? HEART_RED : 'var(--fmp-text-2)',
    background: tile
      ? 'color-mix(in srgb, var(--fmp-surface) 94%, transparent)'
      : isFavorite ? `color-mix(in srgb, ${HEART_RED} 16%, var(--fmp-border-sub))` : 'var(--fmp-border-sub)',
    ...(tile ? { boxShadow: '0 4px 14px rgba(0,0,0,0.18)' } : {}),
  };
  // Offset the top-heavy heart shape for optical centering in the round button.
  const icon = <BookIcon name="heart" size={P(tile ? 40 : 46)} fill={isFavorite ? 'currentColor' : 'none'} style={tile ? undefined : { transform: `translateY(${P(4)}px)` }} />;
  const testId = tile ? 'recipe-book-heart' : 'recipe-card-heart';
  if (!interactive) return <span data-testid={testId} aria-hidden style={style}>{icon}</span>;
  return (
    <button
      type="button"
      {...wallPressProps}
      data-testid={testId}
      aria-pressed={isFavorite}
      aria-label={t(isFavorite ? 'meal-planner.favoriteRemove' : 'meal-planner.favoriteAdd', { meal: meal.name })}
      onClick={toggle}
      style={{ ...style, cursor: 'pointer' }}
    >
      {icon}
    </button>
  );
}
