'use client';

import { wallPressProps } from '../wallPress';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useElementBox } from '@/hooks/useElementBox';
import type { SavedMeal } from '@/types/config';
import { useTranslate } from '@/i18n';
import { useInteractionHold } from '@/lib/interaction-hold';
import type { MealieClientProblem } from '@/lib/meal-client';
import { deleteKey, typeKey } from '@/lib/wall-keyboard';
import { recipeBookChipId, recipeBookHeading } from '@/lib/meal-recipe-book';
import { WallScroller } from '../WallScroller';
import { WallKeyboard } from '../WallKeyboard';
import { mealieWords } from '../mealie-problem';
import { WallRecipeHeart } from '../WallRecipeHeart';
import type { WallRecipeBook } from './useWallRecipeBook';
import { BookMessage, RecipeBookChips, RecipeSearchField, RecipeTile, RecipeTileSkeletons, SECTION_LABEL, useChipLabel, type Px } from './RecipeBookParts';

const RecipeCard = lazy(() => import('../RecipeCard').then((m) => ({ default: m.RecipeCard })));

interface RecipeBookPanelProps {
  book: WallRecipeBook;
  /** Authored pixels (at 1080 wide, Medium text) to this surface's pixels. */
  P: Px;
  landscape: boolean;
  /** A touch wall with taps on: search, chips, scrolling and tiles that open the recipe. */
  interactive: boolean;
  headerFont: string;
  /**
   * `book`: the full-screen view, with its title, search, chips and tiles.
   * `search`: the small module's search sheet, search and tiles only, with
   * the keyboard up from the start.
   */
  mode: 'book' | 'search';
  /** The search sheet closes (a minute without a key, nothing typed). */
  onClose?: () => void;
  /** A recipe card opened or closed over the book. */
  onCardChange?: (open: boolean) => void;
}

/**
 * What an empty book says, as keys under `meal-planner.recipeBook` and their
 * values. Empty Favorites on a touch wall points at the hearts on its own
 * tiles; without touch, at Mealie's.
 */
function emptyMessage(
  book: WallRecipeBook,
  typed: string,
  chipLabel: (chip: WallRecipeBook['active']) => string,
  interactive: boolean,
): [string, string, Record<string, string>] {
  const chip = book.active;
  // A saved meal with no recipe is not in the book; say so rather than "check the spelling".
  if (typed && book.withoutRecipe) return ['noRecipeTitle', 'noRecipeHint', { name: book.withoutRecipe.name }];
  if (typed) return ['noneTitle', 'noneHint', { query: typed }];
  if (book.source === 'local' && chip.kind === 'local' && chip.filter === 'all') return ['emptyTitle', 'emptyHint', {}];
  if (chip.kind === 'local' && chip.filter === 'favorites') return ['noFavoritesTitle', 'noFavoritesHintTouch', {}];
  if (chip.kind === 'mealie' && chip.filter === 'favorites') return ['noFavoritesTitle', interactive ? 'noFavoritesHintTouch' : 'noFavoritesHint', {}];
  if (chip.kind === 'mealie' && chip.filter === 'recent') return ['noRecentTitle', 'noRecentHint', {}];
  if (chip.kind === 'mealie') return ['mealieEmptyTitle', 'mealieEmptyHint', {}];
  return ['noneInGroupTitle', 'noneInGroupHint', { group: chipLabel(chip) }];
}

/** The interaction hold, as a component, for a lazily loaded overlay's loading gap. */
function HoldDisplay(): null {
  useInteractionHold();
  return null;
}

function problemWords(problem: MealieClientProblem): ReturnType<typeof mealieWords> {
  return problem === 'connection' ? 'mealieUnreachable' : mealieWords(problem);
}

/**
 * The recipe book drawn on the full-screen theme (`--fmp-*`): browse by chip
 * or search with the wall's keyboard, and tap a recipe to cook from it on the
 * recipe card. Shared by the full-screen Recipe book view and the small
 * Recipes view's search sheet. Sizes are authored at 1080 wide and go through
 * `P`, so the same layout serves a wall and a sheet.
 */
export function RecipeBookPanel({ book, P, landscape, interactive, headerFont, mode, onClose, onCardChange }: RecipeBookPanelProps) {
  const t = useTranslate('modules');
  const chipLabel = useChipLabel();
  const [typing, setTyping] = useState(mode === 'search' && interactive);
  const [open, setOpen] = useState<SavedMeal | null>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [measureRef, box] = useElementBox('content');
  const attachRoot = useCallback((el: HTMLDivElement | null) => { setHost(el); measureRef(el); }, [measureRef]);
  const { query, setQuery, problem, retry } = book;
  const words = query;
  const typed = words.trim() !== '';
  // Two quick taps can land before the words re-render; each key builds on the last one typed.
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const edit = useCallback((change: (current: string) => string) => {
    const next = change(wordsRef.current);
    wordsRef.current = next;
    setQuery(next);
  }, [setQuery]);

  const cardOpen = open !== null;
  useEffect(() => { onCardChange?.(cardOpen); }, [cardOpen, onCardChange]);

  const closeKeyboard = useCallback(() => {
    setTyping(false);
    if (mode === 'search' && !words.trim()) onClose?.();
  }, [mode, words, onClose]);

  const side = P(56);
  // Three tiles across in portrait and six in landscape at Medium text; larger
  // text keeps each tile at least about 280 authored pixels wide, so the
  // names stay readable rather than the columns.
  const gapX = P(landscape ? 24 : 28);
  const fits = box.width ? Math.floor((box.width - 2 * side + gapX) / (P(280) + gapX)) : 99;
  const cols = Math.max(1, Math.min(landscape ? 6 : 3, fits));
  // The heading under the chips already counts the book; the field does not repeat it.
  const placeholder = t('meal-planner.recipeBook.searchPlaceholder');
  const searchField = (
    <RecipeSearchField
      P={P}
      words={words}
      placeholder={placeholder}
      typing={typing}
      disabled={!interactive}
      onOpen={() => setTyping(true)}
      onClear={() => setQuery('')}
      height={landscape ? 96 : 108}
      font={landscape ? 32 : 36}
    />
  );
  // The size of the whole book, beside the title. Not while the heading under
  // the chips already says the same number ("12 recipes, A to Z" on the All
  // chip of a book kept here): the page would count itself twice.
  const headingCountsBook = mode === 'book' && !typed && book.active.kind === 'local' && book.active.filter === 'all';
  // On a chip that narrows the book the number is the whole book's, and says so.
  const narrowed = mode === 'book' && !(book.active.kind === 'mealie' && book.active.filter === 'all') && !headingCountsBook;
  const count = book.recipeCount !== null && !headingCountsBook && (
    <span data-testid="recipe-book-count" style={{ ...SECTION_LABEL, fontSize: P(landscape ? 22 : 24), flexShrink: 0 }}>
      {t(narrowed ? 'meal-planner.recipeBook.countInBook' : 'meal-planner.recipeBook.count', { count: book.recipeCount })}
    </span>
  );
  const title = <span style={{ fontFamily: headerFont, fontSize: P(landscape ? 72 : 78), lineHeight: 1, color: 'var(--fmp-text)', flexShrink: 0 }}>{t('meal-planner.recipeBook.title')}</span>;
  // A book with almost nothing in it while the planner is full of meals
  // looks broken: say what gets a meal into the book. Gone once the book
  // has a few recipes, and never for Mealie's book.
  const fewRecipes = mode === 'book' && book.source === 'local' && book.withoutRecipeCount > 0 && book.recipeCount !== null && book.recipeCount < 3 && (
    <p data-testid="recipe-book-few-hint" style={{ margin: `${P(14)}px 0 0`, fontSize: P(landscape ? 24 : 26), lineHeight: 1.3, color: 'var(--fmp-text-3)' }}>
      {t('meal-planner.recipeBook.fewRecipesHint')}
    </p>
  );
  const showChips = mode === 'book' && !typing && !typed;
  const chips = showChips && (
    <div style={{ marginTop: P(landscape ? 24 : 28) }}>
      <RecipeBookChips
        chips={book.chips}
        active={book.active}
        onChoose={interactive ? book.choose : null}
        P={P}
        size={landscape ? 27 : 30}
        sheetHost={host}
      />
    </div>
  );

  let header;
  if (mode === 'search') header = searchField;
  else if (landscape) {
    header = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: P(40) }}>
          {title}
          <div style={{ flex: 1, minWidth: 0 }}>{searchField}</div>
          {count}
        </div>
        {fewRecipes}
        {chips}
      </>
    );
  } else {
    header = (
      <>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: P(24) }}>{title}{count}</div>
        {fewRecipes}
        <div style={{ marginTop: P(30) }}>{searchField}</div>
        {chips}
      </>
    );
  }

  // ── What goes where the tiles are ──
  const heading = recipeBookHeading(words, book.active, book.total, book.active.kind === 'local' ? chipLabel(book.active) : '', book.widenedTo);
  let body;
  if (problem && book.items.length === 0) {
    const word = problemWords(problem);
    body = (
      <BookMessage
        testId="recipe-book-problem"
        P={P}
        icon="cloudOff"
        title={t(`meal-planner.${word}`)}
        hint={t(`meal-planner.recipeBook.problemHint.${word}`)}
        action={interactive && (
          <button
            type="button"
            {...wallPressProps}
            onClick={retry}
            style={{
              marginTop: P(10), border: 0, borderRadius: 999, padding: `${P(20)}px ${P(44)}px`, background: 'var(--fmp-accent)',
              color: 'var(--fmp-on-accent, #fff)', font: 'inherit', fontSize: P(30), fontWeight: 700, cursor: 'pointer',
            }}
          >
            {t('meal-planner.recipeBook.tryAgain')}
          </button>
        )}
      />
    );
  } else if (book.loading && book.items.length === 0) {
    body = (
      <div data-testid="recipe-book-loading" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: gapX, rowGap: P(34) }}>
        <RecipeTileSkeletons count={cols * 2} P={P} />
      </div>
    );
  } else if (book.items.length === 0) {
    const [titleKey, hintKey, values] = emptyMessage(book, typed ? words.trim() : '', chipLabel, interactive);
    body = (
      <BookMessage
        testId="recipe-book-empty"
        P={P}
        icon={typed ? 'search' : undefined}
        glyph={typed ? undefined : '\u{1F4D6}'}
        title={t(`meal-planner.recipeBook.${titleKey}`, values)}
        hint={t(`meal-planner.recipeBook.${hintKey}`, values)}
      />
    );
  } else {
    body = (
      <div data-testid="recipe-book-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: gapX, rowGap: P(landscape ? 30 : 34) }}>
        {book.items.map((meal) => (
          <RecipeTile
            key={meal.id}
            meal={meal}
            P={P}
            nameSize={landscape ? 28 : 31}
            metaSize={landscape ? 23 : 25}
            onOpen={interactive ? setOpen : undefined}
            heart={<WallRecipeHeart meal={meal} P={P} place="tile" interactive={interactive} />}
          />
        ))}
      </div>
    );
  }

  const showHeading = book.items.length > 0 || (book.loading && !problem);
  const backStyle: CSSProperties = {
    background: 'var(--fmp-accent)', color: 'var(--fmp-on-accent, #fff)', fontSize: P(28), padding: `${P(16)}px ${P(34)}px`,
    boxShadow: '0 8px 24px color-mix(in srgb, var(--fmp-accent) 35%, transparent)',
  };

  return (
    <div
      ref={attachRoot}
      data-testid="recipe-book"
      data-source={book.source}
      style={{ position: 'relative', flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ padding: `${P(mode === 'search' ? 26 : landscape ? 44 : 56)}px ${side}px 0`, flexShrink: 0 }}>{header}</div>
      {showHeading && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: P(20), padding: `${P(30)}px ${side}px ${P(22)}px`, flexShrink: 0 }}>
          {/* The shorter-spelling line is a sentence and may take two lines; the others stay on one. */}
          <span data-testid="recipe-book-heading" data-heading={heading.key} style={{ ...SECTION_LABEL, fontSize: P(23), minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: heading.key === 'widened' ? 'normal' : 'nowrap' }}>
            {t(`meal-planner.recipeBook.heading.${heading.key}`, heading.values)}
          </span>
          {heading.sideKey && (
            <span style={{ fontSize: P(23), fontWeight: 600, color: 'var(--fmp-text-3)', flexShrink: 0 }}>{t(`meal-planner.recipeBook.heading.${heading.sideKey}`)}</span>
          )}
        </div>
      )}
      <WallScroller
        enabled={interactive}
        testId="recipe-book-scroll"
        homeKey={`${words.trim()}|${recipeBookChipId(book.active)}`}
        backLabel={t('wallScroll.backToTop')}
        backStyle={backStyle}
        thumbColor="color-mix(in srgb, var(--fmp-text) 28%, transparent)"
        thumbWidth={P(8)}
        onNearEnd={book.hasMore ? book.loadMore : undefined}
        style={{ padding: `0 ${side}px ${P(40)}px` }}
      >
        {body}
      </WallScroller>
      {typing && interactive && (
        <div style={{ flexShrink: 0 }}>
          <WallKeyboard
            P={P}
            maxWidth={landscape ? P(1240) : undefined}
            keyHeight={landscape ? 78 : 104}
            onKey={(key) => edit((current) => typeKey(current, key))}
            onDelete={() => edit(deleteKey)}
            onDone={closeKeyboard}
            onIdle={closeKeyboard}
            // An empty search sheet closes with its keyboard, and would take
            // a recipe opened from it (before typing anything) along with it.
            paused={cardOpen}
          />
        </div>
      )}
      {open && (
        <>
          {/* Holds the display from the tap, not from when the lazily loaded
              card mounts: a flick in that gap read as "go back". */}
          <HoldDisplay />
          <Suspense fallback={null}>
            <RecipeCard meal={open} onClose={() => setOpen(null)} />
          </Suspense>
        </>
      )}
    </div>
  );
}
