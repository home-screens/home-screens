'use client';

import { useEffect, useRef, useState } from 'react';
import { CloudOff, ExternalLink, Search } from 'lucide-react';
import { fetchMealieCategories, type MealieCategory, type MealieRecipeFilter } from '@/lib/meal-client';
import { mealShownMinutes } from '@/lib/meal-dish-rules';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import { useMealieRecipeSearch } from '@/components/meals/useMealieRecipeSearch';
import { useMealieRecipeCount } from '../hooks/useMealieRecipeCount';
import MealThumb from './MealThumb';
import { RetryButton } from './MealsMealieStatus';
import { CenterMessage, FilterChip, RecipeSearchBox, RecipeShortcutChips, RecipeSkeletonRows } from './MealieRecipeParts';
import { CARD_STYLE, formatShownMinutes, openOutside } from './meals-shared';
import { mealieProblemWords } from './MealsMealieStatus';

/**
 * The Library while the plan lives in Mealie: a window onto Mealie's recipes,
 * searchable, opening on Favorites (hundreds of recipes A to Z is a lot to
 * scroll). Each card opens the recipe in Mealie; there is nothing to add,
 * edit or heart here, because the recipes live there.
 */
export default function MealsMealieLibraryView({ baseUrl }: { baseUrl: string | undefined }) {
  const t = useTranslate('remote');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MealieRecipeFilter>('favorites');
  // One of Mealie's own categories, chosen from the chips after All.
  const [category, setCategory] = useState<string | undefined>(undefined);
  const typed = query.trim();
  const search = useMealieRecipeSearch(editorFetch, { search: query, filter, category: typed ? undefined : category, enabled: true });
  const count = useMealieRecipeCount(true);

  // The household's categories for the chips; without them the Library still
  // works from Favorites, Recently made and All.
  const [categories, setCategories] = useState<MealieCategory[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetchMealieCategories(editorFetch, controller.signal).then(setCategories, () => {});
    return () => controller.abort();
  }, []);

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

  const pick = (next: MealieRecipeFilter, nextCategory?: string) => {
    setQuery('');
    setFilter(next);
    setCategory(nextCategory);
  };

  let body;
  if (search.loading) {
    body = <RecipeSkeletonRows count={4} square={64} radius={10} card />;
  } else if (search.error) {
    body = (
      <CenterMessage icon={<CloudOff size={24} strokeWidth={2} />} title={t(`${mealieProblemWords(search.problem)}.title`)} description={search.problem === 'unreachable' || !search.problem ? t('mealie.search.errorDescription') : t(`${mealieProblemWords(search.problem)}.description`)} padding="48px 16px">
        <RetryButton onRetry={search.retry} style={{ padding: '0 18px' }} />
      </CenterMessage>
    );
  } else if (search.items.length === 0) {
    const [title, description] = typed
      ? [t('mealie.search.noneTitle', { query: typed }), t('mealie.library.noneDescription')]
      : filter === 'favorites'
        ? [t('mealie.search.noFavoritesTitle'), t('mealie.search.noFavoritesDescription')]
        : filter === 'recent'
          ? [t('mealie.search.noRecentTitle'), t('mealie.search.noRecentDescription')]
          : [t('mealie.library.emptyTitle'), t('mealie.library.emptyDescription')];
    body = <CenterMessage icon={<Search size={24} strokeWidth={2} />} title={title} description={description} padding="48px 16px" />;
  } else {
    body = search.items.map((meal) => {
      const shown = mealShownMinutes(meal);
      const [first, ...rest] = meal.tags ?? [];
      return (
        <button
          key={meal.id}
          type="button"
          data-testid="mealie-library-card"
          onClick={() => openOutside(meal.recipeUrl)}
          aria-label={t('mealie.library.openRecipeAriaLabel', { meal: meal.name })}
          style={{
            ...CARD_STYLE,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 8,
            cursor: 'pointer',
            textAlign: 'left',
            color: 'inherit',
            fontFamily: 'inherit',
          }}
        >
          <MealThumb meal={meal} size={64} radius={10} emojiSize={34} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--hs-text-body)', marginBottom: 2, lineHeight: '21px' }}>
              {meal.name}
            </span>
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
          <span aria-hidden style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hs-text-faint)', flex: 'none' }}>
            <ExternalLink size={18} strokeWidth={2} />
          </span>
        </button>
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
            onClick={() => openOutside(baseUrl)}
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
      <RecipeShortcutChips filter={filter} searching={!!typed} onFilter={pick} style={{ paddingBottom: 12 }}>
        <FilterChip active={!typed && filter === 'all' && !category} onClick={() => pick('all')}>
          {t('mealsTab.library.filters.all')}
        </FilterChip>
        {categories.map((c) => (
          <FilterChip key={c.slug} active={!typed && filter === 'all' && category === c.slug} onClick={() => pick('all', c.slug)}>
            {c.name}
          </FilterChip>
        ))}
      </RecipeShortcutChips>
      {body}
      <div ref={endRef} aria-hidden style={{ height: 1 }} />
    </div>
  );
}
