'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import { useMealOverlayTheme } from '../MealRecipeContext';
import { useWallOverlayScale } from '../useWallOverlayScale';
import { WallOverlay } from '../WallOverlay';
import { RecipeBookPanel } from './RecipeBookPanel';
import type { WallRecipeBook } from './useWallRecipeBook';

/** A sheet nobody touches for this long closes, unless a recipe card is open from it. */
export const RECIPE_BOOK_SHEET_AUTO_CLOSE_MS = 2 * 60_000;

const HEADER_FONT = "var(--font-dm-serif), 'DM Serif Display', Georgia, serif";

/**
 * The recipe book over the whole screen, opened from the small Meal
 * Planner's Recipes view: `search` with the keyboard up (its Search button),
 * or `book` with every chip (its "+ N" chip). Drawn in the display's
 * full-screen theme like the recipe card, at 1080 across the window's short
 * side, since a small module has no room to type. Shares the module's book,
 * so a chip picked here is the one the module shows afterwards.
 */
export function RecipeBookSheet({ book, mode, onClose }: { book: WallRecipeBook; mode: 'search' | 'book'; onClose: () => void }) {
  const t = useTranslate('modules');
  const { P, landscape } = useWallOverlayScale();
  const { panelStyle } = useMealOverlayTheme();
  // A recipe card opened from the sheet lives inside it, so the sheet must not
  // close under someone cooking: the card keeps its own, longer clock.
  const [cardOpen, setCardOpen] = useState(false);

  return (
    <WallOverlay label={t('meal-planner.recipeBook.title')} testId="recipe-book-sheet" onClose={onClose} autoCloseMs={RECIPE_BOOK_SHEET_AUTO_CLOSE_MS} paused={cardOpen} scrim="rgba(0,0,0,0.5)">
      <div
        className="fmp-root"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...panelStyle,
          position: 'absolute', left: 0, right: 0, bottom: 0, height: mode === 'search' ? (landscape ? '86%' : '64%') : '90%',
          borderRadius: `${P(44)}px ${P(44)}px 0 0`, boxShadow: '0 -20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ padding: `${P(20)}px 0 0`, flexShrink: 0 }}>
          <div style={{ width: P(96), height: P(10), borderRadius: P(5), background: 'var(--fmp-border)', margin: '0 auto' }} />
        </div>
        <RecipeBookPanel book={book} P={P} landscape={landscape} interactive headerFont={HEADER_FONT} mode={mode} onClose={onClose} onCardChange={setCardOpen} />
      </div>
    </WallOverlay>
  );
}
