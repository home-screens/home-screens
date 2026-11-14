'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, CloudOff, ExternalLink, Heart, Search } from 'lucide-react';
import { fetchMealieCategories, mealieClientProblem } from '@/lib/meal-client';
import type { SavedMeal } from '@/types/config';
import type { MealieCategory } from '@/lib/mealie';
import { FamilyMealSummary } from '@/components/meals/meal-votes';
import MealRateButton from './MealRatingSheet';
import { mealShownMinutes } from '@/lib/meal-dish-rules';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import { useMealieRecipeBrowser } from '@/components/meals/useMealieRecipeBrowser';
import { useMealieLink } from '@/components/meals/useMealieLink';
import { useMealFavorite } from '@/components/meals/useMealFavorite';
import { noteMealieRecipeCount, useMealieRecipeCount } from '../hooks/useMealieRecipeCount';
import type { WallNotices } from '../hooks/useShowRecipeOnWall';
import MealThumb from './MealThumb';
import RecipeWallButton from './RecipeWallButton';
import { mealieSaveFailedWords, mealieSearchFailedWords, RetryButton } from './MealsMealieStatus';
import { CenterMessage, FilterChip, RecipeSearchBox, RecipeShortcutChips, RecipeSkeletonRows } from './MealieRecipeParts';
import { CARD_STYLE, formatShownMinutes, openOutside } from './meals-shared';

/**
 * The Library while the plan lives in Mealie: a window onto Mealie's recipes,
 * searchable, opening on Favorites (hundreds of recipes A to Z is a lot to
 * scroll). Each card opens the recipe in Mealie; there is nothing to add or
 * edit here, because the recipes live there. The heart is the one change:
 * it saves to Mealie's favorites, the list the Favorites chip reads.
 */
export default function MealsMealieLibraryView({ baseUrl, wallNotices, onSaveFailed }: {
  baseUrl: string | undefined;
  wallNotices: WallNotices;
  /** Says a heart Mealie did not take, on the tab's red line. */
  onSaveFailed: (message: string) => void;
}) {
  const t = useTranslate('remote');
  const heartFailed = useCallback((err: unknown) => {
    const problem = mealieClientProblem(err);
    onSaveFailed(t(problem === 'connection' ? 'hubRequest.saveFailed' : mealieSaveFailedWords(problem) ?? 'mealsTab.saveFailed'));
  }, [onSaveFailed, t]);
  // Favorites, Recently made, All, or one of Mealie's own categories or
  // cookbooks, chosen from the chips after All.
  const { query, setQuery, shortcut, choose, cookbooks, search, refresh, refreshes } = useMealieRecipeBrowser(editorFetch);
  const typed = query.trim();
  const count = useMealieRecipeCount(true, search.recovered + refreshes);
  const mealieLink = useMealieLink();
  // All with nothing typed is the whole book, so its answer is the count in the box.
  const allAnswered = shortcut.kind === 'all' && !search.loading && !search.outdated && !search.problem;
  useEffect(() => {
    if (allAnswered) noteMealieRecipeCount(search.total);
  }, [allAnswered, search.total]);
  // A phone tab is opened again hours later: read what Mealie has now.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // The household's categories for the chips; without them the Library still
  // works from Favorites, Recently made and All. Asked again once Mealie
  // answers after failing, or the chips stay missing after "Try again".
  const [categories, setCategories] = useState<MealieCategory[]>([]);
  const { recovered } = search;
  useEffect(() => {
    const controller = new AbortController();
    fetchMealieCategories(editorFetch, controller.signal).then(setCategories, () => {});
    return () => controller.abort();
  }, [recovered, refreshes]);

  // More cards as the list nears its end; the page itself scrolls here.
  const endRef = useRef<HTMLDivElement>(null);
  const { hasMore, loadMore } = search;
  useEffect(() => {
    const el = endRef.current;
    if (!el || !hasMore) return;
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '300px' });
    seen.observe(el);
    return () => seen.disconnect();
  }, [hasMore, loadMore]);

  const failed = mealieSearchFailedWords(search.problem);
  let body;
  if (search.loading) {
    body = <RecipeSkeletonRows count={4} square={64} radius={10} card />;
  } else if (search.error) {
    body = (
      <CenterMessage icon={<CloudOff size={24} strokeWidth={2} />} title={t(failed.title)} description={t(failed.description)} padding="48px 16px">
        <RetryButton onRetry={search.retry} style={{ padding: '0 18px' }} />
      </CenterMessage>
    );
  } else if (search.items.length === 0) {
    const [title, description] = shortcut.kind === 'search'
      ? [t('mealie.search.noneTitle', { query: typed }), t('mealie.library.noneDescription')]
      : shortcut.kind === 'favorites'
        ? [t('mealie.search.noFavoritesTitle'), t('mealie.library.noFavoritesDescription')]
        : shortcut.kind === 'recent'
          ? [t('mealie.search.noRecentTitle'), t('mealie.search.noRecentDescription')]
          : [t('mealie.library.emptyTitle'), t('mealie.library.emptyDescription')];
    body = <CenterMessage icon={<Search size={24} strokeWidth={2} />} title={title} description={description} padding="48px 16px" />;
  } else {
    body = search.items.map((meal) => {
      const shown = mealShownMinutes(meal);
      const [first, ...rest] = meal.tags ?? [];
      return (
        <div
          key={meal.id}
          data-testid="mealie-library-card"
          style={{
            ...CARD_STYLE,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 8,
          }}
        >
          <MealThumb meal={meal} size={64} radius={10} emojiSize={34} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--hs-text-body)', marginBottom: 2, lineHeight: '21px' }}>
              {meal.name}
            </span>
            <FamilyMealSummary meal={meal} short style={{ display: 'block', fontSize: 12, color: 'var(--hs-text-muted)', marginBottom: 2 }} />
            {(shown || first) && (
              <span style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--hs-text-faint)' }}>
                {shown && <span>{formatShownMinutes(shown, t)}</span>}
                {first && <span>{first}</span>}
              </span>
            )}
            {rest.length > 0 && (
              <span style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {rest.slice(0, 3).map((tag) => (
                  <span key={tag} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'var(--hs-bg-panel)', color: 'var(--hs-text-muted)' }}>
                    {tag}
                  </span>
                ))}
              </span>
            )}
          </span>
          {/* The whole card opens the recipe in Mealie. A button laid over it
              rather than around it, so the wall button and the heart beside
              it are buttons of their own, not ones inside another. */}
          <button
            type="button"
            onClick={() => openOutside(meal.recipeUrl && mealieLink(meal.recipeUrl))}
            aria-label={t('mealie.library.openRecipeAriaLabel', { meal: meal.name })}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', padding: 0, margin: 0, border: 'none', borderRadius: 'inherit', background: 'transparent', cursor: 'pointer' }}
          />
          <MealRateButton meal={meal} style={{ position: 'relative' }} />
          <RecipeWallButton meal={meal} notices={wallNotices} style={{ position: 'relative' }} />
          <LibraryHeart meal={meal} onFailed={heartFailed} />
        </div>
      );
    });
  }

  return (
    <div style={{ paddingBottom: 80 }} data-testid="mealie-library">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12, color: 'var(--hs-text-faint)', margin: '-4px 0 10px', lineHeight: '17px' }}>
        <span>{t('mealie.library.info')}</span>
        {baseUrl && (
          <button
            type="button"
            onClick={() => openOutside(mealieLink(baseUrl))}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', minHeight: 32, padding: 0,
              border: 'none', background: 'transparent', color: 'var(--hs-accent-hover, var(--hs-accent))',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flex: 'none',
            }}
          >
            {t('mealie.openMealie')}
            <ExternalLink size={12} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
      <RecipeSearchBox
        value={query}
        onChange={setQuery}
        placeholder={count ? t('mealie.library.placeholderCount', { count }) : t('mealie.library.placeholder')}
        ariaLabel={t('mealie.search.ariaLabel')}
      />
      <RecipeShortcutChips
        filter={shortcut.kind === 'favorites' || shortcut.kind === 'recent' ? shortcut.kind : 'all'}
        searching={!!typed}
        onFilter={choose}
        style={{ paddingBottom: 12 }}
      >
        <FilterChip active={shortcut.kind === 'all'} onClick={() => choose('all')}>
          {t('mealsTab.library.filters.all')}
        </FilterChip>
        {categories.map((c) => (
          <FilterChip key={c.slug} active={shortcut.kind === 'category' && shortcut.slug === c.slug} onClick={() => choose({ category: c.slug })}>
            {c.name}
          </FilterChip>
        ))}
        {cookbooks.map((c) => (
          <FilterChip
            key={`cookbook-${c.slug}`}
            active={shortcut.kind === 'cookbook' && shortcut.slug === c.slug}
            onClick={() => choose({ cookbook: c.slug })}
            icon={<BookOpen size={13} strokeWidth={2} aria-hidden />}
          >
            {c.name}
          </FilterChip>
        ))}
      </RecipeShortcutChips>
      {body}
      {/* The end of a page is not the end of the book. */}
      {!search.loading && search.hasMore && search.loadingMore && <RecipeSkeletonRows count={2} square={64} radius={10} card />}
      {!search.loading && search.hasMore && search.moreFailed && (
        <div data-testid="mealie-library-more-failed" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 16px 4px', textAlign: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--hs-text-muted)' }}>{t('mealie.library.moreFailed')}</span>
          <RetryButton onRetry={search.retryMore} style={{ padding: '0 18px' }} />
        </div>
      )}
      <div ref={endRef} aria-hidden style={{ height: 1 }} />
    </div>
  );
}

/** A recipe's heart on its card: red when it is one of Mealie's favorites. */
function LibraryHeart({ meal, onFailed }: { meal: SavedMeal; onFailed: (err: unknown) => void }) {
  const t = useTranslate('remote');
  const { isFavorite, toggle } = useMealFavorite(meal, editorFetch, onFailed);
  if (isFavorite === null) return null;
  return (
    <button
      type="button"
      data-testid="mealie-library-heart"
      onClick={toggle}
      aria-pressed={isFavorite}
      aria-label={t(isFavorite ? 'mealsTab.library.favoriteRemoveAriaLabel' : 'mealsTab.library.favoriteAddAriaLabel')}
      style={{
        // Above the card's own button, which covers the whole card.
        position: 'relative', flex: 'none', width: 44, height: 44, margin: '0 -6px', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer',
        color: isFavorite ? 'var(--hs-danger)' : 'var(--hs-text-faint)',
      }}
    >
      <Heart size={22} strokeWidth={2} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden />
    </button>
  );
}
