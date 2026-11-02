'use client';

import { useCallback } from 'react';
import type { MealPlannerViewProps } from './meal-planner-utils';
import { px } from './meal-planner-utils';
import { RecipeBookPanel } from '../shared/recipe-book/RecipeBookPanel';
import type { WallRecipeBook } from '../shared/recipe-book/useWallRecipeBook';
import { BROWSE_HOLD_ATTR } from '@/components/display/useTapRotationHold';

/**
 * The family's recipe book on the wall, for cooking from instead of a book on
 * the counter: Mealie's recipes (or the saved meals with a recipe) to browse
 * by chip or search with the wall's keyboard, each opening on the recipe
 * card. It never pages or turns by itself; it waits to be touched.
 */
export default function RecipeBookView({ s, headerFont, bodyFont, landscape, interactive, book }: MealPlannerViewProps & { book: WallRecipeBook }) {
  const P = useCallback((n: number) => px(s, n), [s]);
  return (
    <div data-testid="fmp-recipe-book" {...(interactive ? BROWSE_HOLD_ATTR : {})} style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: bodyFont }}>
      <RecipeBookPanel book={book} P={P} landscape={landscape} interactive={interactive} headerFont={headerFont} mode="book" />
    </div>
  );
}
