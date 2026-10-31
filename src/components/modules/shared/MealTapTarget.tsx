'use client';

import { lazy, Suspense, useState, type CSSProperties, type ReactNode } from 'react';
import type { RecipeTapAction, SavedMeal } from '@/types/config';
import { useTranslate } from '@/i18n';
import { isMealieMeal } from '@/lib/meal-dish-rules';
import { mealHasRecipe } from '@/lib/meal-recipe';
import { useMealieLink } from '@/components/meals/useMealieLink';
import type { MealServingRef } from './MealRecipeContext';

// Lazy so qrcode.react is only fetched/parsed after the first tap — most
// displays run with tapRecipeAction 'off' and never pay for it.
const RecipeOverlay = lazy(() =>
  import('./RecipeOverlay').then((m) => ({ default: m.RecipeOverlay })),
);
const RecipeCard = lazy(() =>
  import('./RecipeCard').then((m) => ({ default: m.RecipeCard })),
);

/**
 * How tapping a meal behaves in the current render context:
 * - 'off'    — inert (config disabled)
 * - 'qr'     — display kiosk, fullscreen QR overlay
 * - 'card'   — display kiosk, the recipe drawn on a card (RecipeCard)
 * - 'iframe' — display kiosk, embedded recipe overlay
 * - 'link'   — editor preview, open the recipe in a new tab
 */
export type RecipeTapMode = RecipeTapAction | 'link';

/**
 * Maps the configured action to the render-context mode. ScreenRenderer
 * threads screenId/moduleId on real displays only; the editor preview gets
 * neither and falls back to opening recipes in a new tab.
 */
export function resolveRecipeTapMode(
  action: RecipeTapAction | undefined,
  screenId: string | undefined,
  moduleId: string | undefined,
): RecipeTapMode {
  const resolved = action ?? 'off';
  if (resolved === 'off') return 'off';
  return screenId && moduleId ? resolved : 'link';
}

interface MealTapTargetProps {
  meal: SavedMeal | null;
  mode: RecipeTapMode;
  /** The day and meal the dish is planned for, for the recipe card's badge and courses. */
  serving?: MealServingRef;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Wraps a meal's emoji+name cluster in all 9 meal-planner views. Always
 * renders exactly one container element so swapping div/button/anchor never
 * changes the layout — className/style pass through 1:1.
 */
export function MealTapTarget({ meal, mode, serving, className, style, children }: MealTapTargetProps) {
  const t = useTranslate('modules');
  const [overlay, setOverlay] = useState<'qr' | 'iframe' | 'card' | null>(null);
  const recipeUrl = meal?.recipeUrl;
  // The card draws the recipe itself, so a saved meal with ingredients opens
  // one without a link; the other actions need a link to show or embed.
  const opens = mode === 'card' ? mealHasRecipe(meal) : !!recipeUrl;

  if (mode === 'off' || !meal || !opens) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  if (mode === 'link') {
    // `opens` means a link mode has its recipeUrl; `?? ''` only narrows the type.
    return (
      <RecipeLink meal={meal} recipeUrl={recipeUrl ?? ''} className={className} style={style}>
        {children}
      </RecipeLink>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={t('meal-planner.openRecipeAria', { name: meal.name })}
        onClick={() => setOverlay(mode)}
        className={className}
        style={{
          background: 'none',
          border: 0,
          padding: 0,
          margin: 0,
          font: 'inherit',
          color: 'inherit',
          textAlign: 'inherit',
          cursor: 'pointer',
          ...style,
        }}
      >
        {children}
        <span
          aria-hidden="true"
          data-testid="meal-chevron"
          style={{ fontSize: '1.1em', lineHeight: 1, opacity: 0.4, marginLeft: 'auto', flexShrink: 0, alignSelf: 'center' }}
        >
          ›
        </span>
      </button>
      {overlay === 'card' && (
        <Suspense fallback={null}>
          <RecipeCard meal={meal} at={serving} onClose={() => setOverlay(null)} />
        </Suspense>
      )}
      {(overlay === 'qr' || overlay === 'iframe') && (
        <Suspense fallback={null}>
          <RecipeOverlay meal={meal} variant={overlay} onClose={() => setOverlay(null)} />
        </Suspense>
      )}
    </>
  );
}

/**
 * Editor preview: the canvas wrapper sets pointer-events: none, so the anchor
 * opts back in; stopPropagation keeps the click from selecting the module
 * (drags need 5px of movement, so plain clicks are safe). A Mealie recipe
 * opens through the address this browser can reach Mealie at.
 */
function RecipeLink({ meal, recipeUrl, className, style, children }: { meal: SavedMeal; recipeUrl: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  const mealieLink = useMealieLink();
  return (
    <a
      href={isMealieMeal(meal) ? mealieLink(recipeUrl) : recipeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={{ ...style, pointerEvents: 'auto', cursor: 'pointer' }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  );
}
