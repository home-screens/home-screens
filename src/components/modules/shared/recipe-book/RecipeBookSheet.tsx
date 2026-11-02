'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useInteractionHold } from '@/lib/interaction-hold';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import { buildThemeCSSVars, getThemeTokens, resolveFullscreenAccent, resolveFullscreenOnAccent } from '@/lib/fullscreen-themes';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { UI_SANS_STACK } from '@/lib/font-registry';
import { useMealRecipeContext } from '../MealRecipeContext';
import { useViewportSize } from '../useViewportSize';
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
  const ctx = useMealRecipeContext();
  const { w, h } = useViewportSize();
  useInteractionHold();

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [touchedAt, setTouchedAt] = useState(0);
  // A recipe card opened from the sheet lives inside it, so the sheet must not
  // close under someone cooking: the card keeps its own, longer clock.
  const [cardOpen, setCardOpen] = useState(false);
  useEffect(() => {
    if (cardOpen) return;
    const timer = setTimeout(() => closeRef.current(), RECIPE_BOOK_SHEET_AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [touchedAt, cardOpen]);

  const theme = getThemeTokens(ctx?.theme);
  const cssVars = {
    ...buildThemeCSSVars('fmp', theme),
    '--fmp-accent': resolveFullscreenAccent('', theme, DEFAULT_ACCENT_COLOR),
    '--fmp-on-accent': resolveFullscreenOnAccent('', theme, DEFAULT_ACCENT_COLOR),
  } as CSSProperties;
  const unit = Math.min(w, h) / 1080;
  const P = (n: number) => n * unit;
  const landscape = w > h;

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      role="dialog"
      data-testid="recipe-book-sheet"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: DISPLAY_LAYERS.moduleOverlay, backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="fmp-root"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={() => setTouchedAt(Date.now())}
        style={{
          ...cssVars,
          position: 'absolute', left: 0, right: 0, bottom: 0, height: mode === 'search' ? (landscape ? '86%' : '64%') : '90%',
          borderRadius: `${P(44)}px ${P(44)}px 0 0`, boxShadow: '0 -20px 60px rgba(0,0,0,0.4)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', fontFamily: UI_SANS_STACK, lineHeight: 1.5,
          backgroundColor: 'var(--fmp-bg)', backgroundImage: 'var(--fmp-bg-image)', color: 'var(--fmp-text)',
          colorScheme: theme.isDark ? 'dark' : 'light',
        }}
      >
        <div style={{ padding: `${P(20)}px 0 0`, flexShrink: 0 }}>
          <div style={{ width: P(96), height: P(10), borderRadius: P(5), background: 'var(--fmp-border)', margin: '0 auto' }} />
        </div>
        <RecipeBookPanel book={book} P={P} landscape={landscape} interactive headerFont={HEADER_FONT} mode={mode} onClose={onClose} onCardChange={setCardOpen} />
      </div>
    </div>,
    document.body,
  );
}
