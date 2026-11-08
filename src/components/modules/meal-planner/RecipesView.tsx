'use client';

import { lazy, Suspense, useState, type CSSProperties } from 'react';
import type { MealPlannerConfig, SavedMeal } from '@/types/config';
import { INK, ink } from '@/lib/constants';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { isMealieMeal } from '@/lib/meal-dish-rules';
import { useTranslate } from '@/i18n';
import MealPicture from '@/components/meals/MealPicture';
import { useMealMinutes } from '../shared/useMealMinutes';
import { WallScroller } from '../shared/WallScroller';
import { mealieWords } from '../shared/mealie-problem';
import { BookIcon, RecipeBookChips, WALL_TOUCH_MIN_PX } from '../shared/recipe-book/RecipeBookParts';
import { RecipeBookSheet } from '../shared/recipe-book/RecipeBookSheet';
import type { WallRecipeBook } from '../shared/recipe-book/useWallRecipeBook';
import { BROWSE_HOLD_ATTR } from '@/components/display/useTapRotationHold';

const RecipeCard = lazy(() => import('../shared/RecipeCard').then((m) => ({ default: m.RecipeCard })));

interface RecipesViewProps {
  config: MealPlannerConfig;
  book: WallRecipeBook;
  /** The module's text size in pixels, which the chips are sized from. */
  fontSize: number;
  /** A touch wall with taps on: search, chips, scrolling and rows that open the recipe. */
  interactive: boolean;
}

/**
 * The family's recipes in a small module, for a kitchen layout with the
 * calendar beside a recipe column: a search button, the first chips, then
 * one recipe per row. Searching, and the chips that do not fit, open the
 * whole recipe book over the screen (`RecipeBookSheet`), since a small
 * module has no room to type; a row opens the recipe card to cook from.
 */
export function RecipesView({ config, book, fontSize, interactive }: RecipesViewProps) {
  const t = useTranslate('modules');
  const mealMinutes = useMealMinutes();
  const [sheet, setSheet] = useState<'search' | 'book' | null>(null);
  const [open, setOpen] = useState<SavedMeal | null>(null);
  const showPictures = config.showEmoji ?? true;

  // The shared chips are drawn on the full-screen palette; here it follows the card's own ink and accent.
  const palette = {
    '--fmp-text': INK,
    '--fmp-text-2': ink(0.62),
    '--fmp-text-3': ink(0.45),
    '--fmp-surface': ink(0.06),
    '--fmp-border': ink(0.14),
    '--fmp-border-sub': ink(0.08),
    '--fmp-accent': config.accentColor || DEFAULT_ACCENT_COLOR,
  } as CSSProperties;
  // Chips at about two thirds of the text, as the mockup draws them: the shared chip is authored at 30.
  const chipP = (n: number) => (n * fontSize * 0.68) / 30;

  const placeholder = book.recipeCount
    ? t('meal-planner.recipeBook.searchCount', { count: book.recipeCount })
    : t('meal-planner.recipeBook.searchPlaceholder');

  let list;
  if (book.problem && book.items.length === 0) {
    const word = book.problem === 'connection' ? 'mealieUnreachable' : mealieWords(book.problem);
    list = <Message title={t(`meal-planner.${word}`)} hint={t(`meal-planner.recipeBook.problemHint.${word}`)} testId="recipe-list-problem" />;
  } else if (book.loading && book.items.length === 0) {
    list = <Message title={t('meal-planner.recipeBook.loading')} testId="recipe-list-loading" />;
  } else if (book.items.length === 0) {
    list = <Message title={t(book.source === 'local' ? 'meal-planner.recipeBook.emptyTitle' : 'meal-planner.recipeBook.noFavoritesTitle')} testId="recipe-list-empty" />;
  } else {
    list = book.items.map((meal) => {
      const minutes = mealMinutes(meal);
      const picture = showPictures && (meal.photoUrl
        ? <MealPicture meal={meal} photoSize="3.1em" size="tiny" style={{ borderRadius: '0.6em' }} />
        : (
          <span style={{ width: '3.1em', height: '3.1em', borderRadius: '0.6em', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ink(0.07) }}>
            <MealPicture meal={meal} photoSize="3.1em" emojiStyle={{ fontSize: '1.5em', lineHeight: 1, opacity: isMealieMeal(meal) && !meal.emoji ? 0.4 : 1 }} />
          </span>
        ));
      const body = (
        <>
          {picture}
          <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
            <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontWeight: 500, fontSize: '0.92em', lineHeight: 1.25 }}>
              {meal.name}
            </span>
            {minutes && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3em', fontSize: '0.68em', opacity: 0.5, marginTop: '0.15em' }}>
                <BookIcon name="clock" size={fontSize * 0.68} />
                {minutes}
              </span>
            )}
          </span>
          {interactive && <span aria-hidden="true" style={{ opacity: 0.3, fontSize: '1.1em', lineHeight: 1 }}>&#8250;</span>}
        </>
      );
      const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.75em', padding: '0.35em 0.3em', width: '100%' };
      return interactive ? (
        <button
          key={meal.id}
          type="button"
          data-testid="recipe-list-row"
          onClick={() => setOpen(meal)}
          style={{ ...row, border: 0, background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', borderRadius: '0.6em' }}
        >
          {body}
        </button>
      ) : (
        <div key={meal.id} data-testid="recipe-list-row" style={row}>{body}</div>
      );
    });
    // The last chip's or words' rows, while these are on their way: old, and not for tapping.
    if (book.outdated) {
      list = <div data-testid="recipe-list-outdated" style={{ opacity: 0.35, pointerEvents: 'none', transition: 'opacity 150ms' }}>{list}</div>;
    } else if (book.hasMore && interactive) {
      // The end of a page is not the end of the book: say more are coming, or that they did not come.
      // Only where a finger can scroll there; a wall without touch never reads another page.
      list = (
        <>
          {list}
          {book.moreFailed ? (
            <button
              type="button"
              data-testid="recipe-list-more-failed"
              onClick={book.retryMore}
              style={{ display: 'block', width: '100%', border: 0, background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', padding: '0.8em 0.3em', fontSize: '0.75em', opacity: 0.6 }}
            >
              {t('meal-planner.recipeBook.moreFailed')} · {t('meal-planner.recipeBook.tryAgain')}
            </button>
          ) : (
            <div data-testid="recipe-list-more" style={{ padding: '0.8em 0.3em', fontSize: '0.75em', opacity: 0.45, textAlign: 'center' }}>{t('meal-planner.recipeBook.loadingMore')}</div>
          )}
        </>
      );
    }
  }

  return (
    <div data-testid="meal-planner-recipes" data-source={book.source} {...(interactive ? BROWSE_HOLD_ATTR : {})} style={{ ...palette, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <button
        type="button"
        data-testid="recipe-list-search"
        onClick={interactive ? () => setSheet('search') : undefined}
        tabIndex={interactive ? undefined : -1}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.55em', height: interactive ? `max(2.5em, ${WALL_TOUCH_MIN_PX}px)` : '2.5em',
          borderRadius: '0.75em', padding: '0 0.8em', flexShrink: 0,
          background: ink(0.07), border: `1px solid ${ink(0.14)}`, color: ink(0.5), font: 'inherit', fontSize: '0.85em',
          cursor: interactive ? 'pointer' : 'default', textAlign: 'left', width: '100%',
        }}
      >
        <BookIcon name="search" size={fontSize * 0.98} />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{placeholder}</span>
      </button>
      <div style={{ marginTop: '0.7em', flexShrink: 0 }}>
        <RecipeBookChips
          chips={book.chips}
          active={book.active}
          onChoose={interactive ? book.choose : null}
          P={chipP}
          maxRows={1}
          sheetHost={null}
          onMore={() => setSheet('book')}
          minHeight={interactive ? WALL_TOUCH_MIN_PX : 0}
        />
      </div>
      <WallScroller
        enabled={interactive}
        testId="recipe-list-scroll"
        homeKey={`${book.query}|${book.active.kind}|${book.refreshed}`}
        backLabel={t('wallScroll.backToTop')}
        backStyle={{ background: config.accentColor || DEFAULT_ACCENT_COLOR, fontSize: '0.75em' }}
        thumbColor={ink(0.35)}
        thumbWidth={4}
        onNearEnd={book.hasMore ? book.loadMore : undefined}
        frameStyle={{ marginTop: '0.6em' }}
      >
        {list}
      </WallScroller>
      {/* The column and the sheet share one book. Closing the sheet drops its words, so the
          column goes back to its chip and the next search starts empty. */}
      {sheet && <RecipeBookSheet book={book} mode={sheet} onClose={() => { setSheet(null); book.setQuery(''); }} />}
      {open && (
        <Suspense fallback={null}>
          <RecipeCard meal={open} onClose={() => setOpen(null)} />
        </Suspense>
      )}
    </div>
  );
}

function Message({ title, hint, testId }: { title: string; hint?: string; testId: string }) {
  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.3em', padding: '1.5em 0.5em' }}>
      <span style={{ fontSize: '0.9em', fontWeight: 500, opacity: 0.8 }}>{title}</span>
      {hint && <span style={{ fontSize: '0.7em', opacity: 0.5 }}>{hint}</span>}
    </div>
  );
}
