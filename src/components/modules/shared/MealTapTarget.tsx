'use client';

import { lazy, Suspense, useState, type CSSProperties, type ReactNode } from 'react';
import type { RecipeTapAction, SavedMeal } from '@/types/config';
import { useTranslate } from '@/i18n';

// Lazy so qrcode.react is only fetched/parsed after the first tap — most
// displays run with tapRecipeAction 'off' and never pay for it.
const RecipeOverlay = lazy(() =>
  import('./RecipeOverlay').then((m) => ({ default: m.RecipeOverlay })),
);

/**
 * How tapping a meal behaves in the current render context:
 * - 'off'    — inert (config disabled)
 * - 'qr'     — display kiosk, fullscreen QR overlay
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
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Wraps a meal's emoji+name cluster in all 9 meal-planner views. Always
 * renders exactly one container element so swapping div/button/anchor never
 * changes the layout — className/style pass through 1:1.
 */
export function MealTapTarget({ meal, mode, className, style, children }: MealTapTargetProps) {
  const t = useTranslate('modules');
  const [overlay, setOverlay] = useState<'qr' | 'iframe' | null>(null);
  const recipeUrl = meal?.recipeUrl;

  if (mode === 'off' || !meal || !recipeUrl) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  if (mode === 'link') {
    // Editor preview: the canvas wrapper sets pointer-events: none, so the
    // anchor opts back in; stopPropagation keeps the click from selecting
    // the module (drags need 5px of movement, so plain clicks are safe).
    return (
      <a
        href={recipeUrl}
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
      {overlay && (
        <Suspense fallback={null}>
          <RecipeOverlay meal={meal} variant={overlay} onClose={() => setOverlay(null)} />
        </Suspense>
      )}
    </>
  );
}
