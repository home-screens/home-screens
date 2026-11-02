'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import type { SavedMeal } from '@/types/config';
import { useTranslate } from '@/i18n';
import { useInteractionHold, useStayAwakeHold } from '@/lib/interaction-hold';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import { buildThemeCSSVars, getThemeTokens, resolveFullscreenAccent, resolveFullscreenOnAccent } from '@/lib/fullscreen-themes';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { recipeCardCloseAfter } from '@/lib/meal-recipe';
import { UI_SANS_STACK } from '@/lib/font-registry';
import { useRecipeLink } from '@/components/meals/useMealieLink';
import { RecipeSheet } from './RecipeSheet';
import { useMealRecipe } from './useMealRecipe';
import { recipeServingAt, useMealRecipeContext, type MealServingRef } from './MealRecipeContext';
import { useViewportSize } from './useViewportSize';

const HEADER_FONT = "var(--font-dm-serif), 'DM Serif Display', Georgia, serif";

/**
 * The recipe of a tapped meal, drawn on a card over the wall in the display's
 * full-screen theme: the same layout as the Recipe view, with a close button,
 * a QR code for a phone, and the courses as buttons that open their own
 * recipes on the same card. Portals to the body so it escapes the screen's
 * zoom and holds rotation while open. A card nobody cooks from closes itself
 * ten minutes after the last touch; the first tick, step or course starts
 * cooking mode, which keeps the screen awake and the card open until an hour
 * passes with no touch (`recipeCardCloseAfter`).
 */
export function RecipeCard({ meal: tapped, at, onClose }: { meal: SavedMeal; at?: MealServingRef; onClose: () => void }) {
  const t = useTranslate('modules');
  const ctx = useMealRecipeContext();
  const [meal, setMeal] = useState(tapped);
  const recipeLink = useRecipeLink();
  const { w, h } = useViewportSize();
  useInteractionHold();
  // Cooking mode, from the first tick, step or course: the idle dim and sleep
  // wait, and the card stays an hour. A card opened by accident does neither.
  const [cooking, setCooking] = useState(false);
  const startCooking = useCallback(() => setCooking(true), []);
  useStayAwakeHold(cooking);

  // Every touch on the card starts the wait over; onClose in a ref so a
  // parent re-render (the minute clock) never restarts it.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [touchedAt, setTouchedAt] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), recipeCardCloseAfter(cooking));
    return () => clearTimeout(timer);
  }, [touchedAt, meal, cooking]);

  const theme = getThemeTokens(ctx?.theme);
  const cssVars = {
    ...buildThemeCSSVars('fmp', theme),
    '--fmp-accent': resolveFullscreenAccent('', theme, DEFAULT_ACCENT_COLOR),
    '--fmp-on-accent': resolveFullscreenOnAccent('', theme, DEFAULT_ACCENT_COLOR),
  } as CSSProperties;

  // Authored at 1080 across the short side, like the full-screen views.
  const unit = Math.min(w, h) / 1080;
  const P = (n: number) => n * unit;
  const landscape = w > h;
  const { serving, courses, scale } = useMemo(() => recipeServingAt(ctx, at, meal), [ctx, at, meal]);
  const recipe = useMealRecipe(meal, scale);
  const recipeUrl = recipeLink(meal);

  if (typeof document === 'undefined') return null;

  const footer = (measuring: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: P(26), marginTop: P(24), flexShrink: 0 }}>
      {recipeUrl && (
        <div data-testid={measuring ? undefined : 'recipe-card-qr'} style={{
          width: P(132), height: P(132), padding: P(10), background: '#fff', borderRadius: P(16),
          border: '1px solid var(--fmp-border-sub)', flexShrink: 0, display: 'flex',
        }}>
          <QRCodeSVG value={recipeUrl} fgColor="#000000" bgColor="#ffffff" style={{ width: '100%', height: '100%' }} />
        </div>
      )}
      <div style={{ fontSize: P(28), lineHeight: 1.35, color: 'var(--fmp-text-2)' }}>
        {recipeUrl && t('meal-planner.recipe.scanForPhone')}
        {/* How long it stays, before and after cooking starts. Both lines sit in one cell and take the
            taller one's room, so the first tick never moves a step to another page. */}
        <div style={{ display: 'grid', fontSize: P(23), color: 'var(--fmp-text-3)' }}>
          <span data-testid={!measuring && !cooking ? 'recipe-card-stays' : undefined} style={{ gridArea: '1 / 1', visibility: cooking ? 'hidden' : undefined }}>
            {t('meal-planner.recipe.keepOpen')}
          </span>
          <span data-testid={!measuring && cooking ? 'recipe-card-stays' : undefined} style={{ gridArea: '1 / 1', visibility: cooking ? undefined : 'hidden' }}>
            {t('meal-planner.recipe.staysOpen')}
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <div
      role="dialog"
      aria-label={meal.name}
      data-testid="recipe-card"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: DISPLAY_LAYERS.moduleOverlay, backgroundColor: 'rgba(0,0,0,0.62)' }}
    >
      <div
        className="fmp-root"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={() => setTouchedAt(Date.now())}
        style={{
          ...cssVars,
          position: 'absolute', left: P(40), right: P(40), top: P(70), bottom: P(70),
          borderRadius: P(44), boxShadow: '0 30px 80px rgba(0,0,0,0.5)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', fontFamily: UI_SANS_STACK, lineHeight: 1.5,
          backgroundColor: 'var(--fmp-bg)', backgroundImage: 'var(--fmp-bg-image)', color: 'var(--fmp-text)',
          colorScheme: theme.isDark ? 'dark' : 'light',
        }}
      >
        <RecipeSheet
          meal={meal}
          recipe={recipe}
          scale={scale}
          serving={serving}
          courses={courses}
          timeFormat={ctx?.timeFormat ?? '12h'}
          P={P}
          padding={`${P(48)}px ${P(48)}px ${P(40)}px`}
          headerFont={HEADER_FONT}
          layout={landscape ? 'landscape' : 'portrait'}
          showPicture
          interactive
          stepButtons="paged"
          onCourse={setMeal}
          resetKey={meal.id}
          footer={footer}
          headerEndGap={P(110)}
          held={cooking}
          onCook={startCooking}
        />
        <button
          type="button"
          data-testid="recipe-card-close"
          aria-label={t('meal-planner.closeRecipe')}
          onClick={onClose}
          style={{
            position: 'absolute', top: P(28), right: P(28), width: P(92), height: P(92), borderRadius: '50%',
            border: 0, background: 'var(--fmp-border-sub)', color: 'var(--fmp-text-2)', fontSize: P(54), lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          &times;
        </button>
      </div>
    </div>,
    document.body,
  );
}
