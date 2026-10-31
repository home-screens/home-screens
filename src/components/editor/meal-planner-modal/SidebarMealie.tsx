'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Heart, History, Pencil, Search, ShoppingCart, X } from 'lucide-react';
import type { SavedMeal } from '@/types/config';
import { editorFetch } from '@/lib/editor-fetch';
import { fetchMealieRecipeDetail, MealClientError, type MealieRecipeDetailWire, type MealieRecipeFilter } from '@/lib/meal-client';
import type { MealieProblem } from '@/lib/meal-sources';
import { parseMealieMealId } from '@/lib/mealie-map';
import { useMealieRecipeSearch } from '@/components/meals/useMealieRecipeSearch';
import { useMealieLink } from '@/components/meals/useMealieLink';
import MealPicture from '@/components/meals/MealPicture';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate } from '@/i18n';
import { useDishTime } from './dish-time';
import DishPicture from './DishPicture';

/**
 * The sidebar's three tabs while the plan lives in Mealie. Recipes are
 * Mealie's, so there is nothing to add, edit or delete here: the Library
 * browses them, Detail shows one read only with a way to open it in Mealie,
 * and Grocery points at Mealie's own shopping list.
 */

const linkButton =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-hs-border-strong bg-hs-card text-hs-text-body hover:bg-hs-hover transition-colors';

// ── Library ──────────────────────────────────

export function MealieLibrary({
  selectedMealId,
  onSelectMeal,
}: {
  selectedMealId: string | null;
  onSelectMeal: (meal: SavedMeal) => void;
}) {
  const t = useTranslate('editor');
  const dishTime = useDishTime();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Exclude<MealieRecipeFilter, 'all'>>('favorites');
  const query = search.trim();
  const results = useMealieRecipeSearch(editorFetch, { search, filter, enabled: true });

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (results.hasMore && el.scrollTop + el.clientHeight > el.scrollHeight - 160) results.loadMore();
  }

  const countLine = results.loading
    ? t('mealPlannerModal.picker.lookingInMealie')
    : results.error
      ? null
      : query
        ? t('mealPlannerModal.picker.recipesInMealie', { count: results.total })
        : filter === 'favorites'
          ? t('mealPlannerModal.picker.favoritesAtoZ', { count: results.total })
          : t('mealPlannerModal.picker.recentlyMadeFirst');

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 py-3 border-b border-hs-border-strong space-y-2">
        <p className="text-xs text-hs-text-faint leading-relaxed">{t('mealPlannerModal.mealie.libraryNote')}</p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-hs-text-faint" aria-hidden />
          <input
            type="text"
            className={`${MODAL_INPUT_CLASS} pl-8 pr-8`}
            placeholder={t('mealPlannerModal.picker.searchMealiePlaceholder')}
            aria-label={t('mealPlannerModal.picker.searchMealiePlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={t('mealPlannerModal.picker.clearSearch')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-hs-text-faint hover:text-hs-text-body"
            >
              <X className="w-3.5 h-3.5" aria-hidden />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {(['favorites', 'recent'] as const).map((f) => {
            const on = !query && filter === f;
            const Icon = f === 'favorites' ? Heart : History;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => { setFilter(f); setSearch(''); }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[11.5px] border transition ${
                  on
                    ? 'border-amber-500/60 text-amber-500 bg-amber-500/8'
                    : 'border-hs-border-strong text-hs-text-faint hover:text-hs-text-muted'
                }`}
              >
                <Icon className="w-3 h-3" aria-hidden />
                {f === 'favorites' ? t('mealPlannerModal.picker.favorites') : t('mealPlannerModal.picker.recentlyMade')}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2" onScroll={onScroll}>
        {countLine && <div className="px-2 pb-1 text-[11px] text-hs-text-faint">{countLine}</div>}
        {results.error && !results.loading && (
          <div className="px-3 py-6 text-center">
            <p className="text-sm font-semibold text-hs-text-body">{t(results.problem === 'not-connected' ? 'mealPlannerModal.mealie.notConnectedTitle' : results.problem === 'token' ? 'mealPlannerModal.mealie.tokenRefusedTitle' : 'mealPlannerModal.picker.mealieError')}</p>
            {results.problem === 'token' && <p className="mt-1 text-xs text-hs-text-faint leading-relaxed">{t('mealPlannerModal.mealie.tokenFix')}</p>}
            <button
              type="button"
              onClick={results.retry}
              className="mt-2 px-3 py-1 text-xs font-medium rounded-md border border-hs-border-strong text-hs-text-muted hover:text-hs-text-body hover:bg-hs-card"
            >
              {t('mealPlannerModal.picker.tryAgain')}
            </button>
          </div>
        )}
        {!results.loading && !results.error && results.items.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-hs-text-faint leading-relaxed">
            {query
              ? t('mealPlannerModal.picker.noRecipesCalled', { text: query })
              : filter === 'favorites'
                ? t('mealPlannerModal.picker.noFavorites')
                : t('mealPlannerModal.picker.noRecentlyMade')}
          </div>
        )}
        {!results.loading && results.items.map((meal) => {
          const time = dishTime(meal);
          const selected = selectedMealId === meal.id;
          return (
            <button
              key={meal.id}
              type="button"
              onClick={() => onSelectMeal(meal)}
              className={`flex items-center gap-3 w-full px-2 py-[7px] rounded-md text-left transition ${
                selected ? 'bg-amber-500/8 ring-1 ring-amber-500/30' : 'hover:bg-hs-card'
              }`}
            >
              <DishPicture meal={meal} size={36} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-hs-text-body truncate leading-[18px]">{meal.name}</span>
                {meal.tags?.length ? (
                  <span className="block text-[11px] text-hs-text-faint truncate leading-[15px]">{meal.tags.slice(0, 2).join(' · ')}</span>
                ) : null}
              </span>
              {time && <span className="text-xs text-hs-text-faint shrink-0">{time}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail ───────────────────────────────────

export function MealieDetail({ meal }: { meal: SavedMeal | null }) {
  const t = useTranslate('editor');
  const dishTime = useDishTime();
  const mealieLink = useMealieLink();

  if (!meal) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-hs-text-faint gap-3">
        <span className="text-3xl opacity-15">&#9998;</span>
        <p className="text-sm leading-relaxed">{t('mealPlannerModal.mealie.detailEmpty')}</p>
      </div>
    );
  }

  const meta = [
    dishTime(meal),
    meal.servings ? t('mealPlannerModal.mealie.serves', { count: meal.servings }) : null,
    ...(meal.tags ?? []),
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {meal.photoUrl ? (
        <MealPicture meal={meal} photoSize="100%" size="min" style={{ width: '100%', height: 180, borderRadius: 10 }} />
      ) : (
        <div className="w-full h-[180px] rounded-[10px] bg-hs-card flex items-center justify-center">
          <DishPicture meal={meal} size={72} />
        </div>
      )}
      <div className="mt-3 text-lg font-bold text-hs-text-body leading-snug">{meal.name}</div>
      {meta && <div className="mt-0.5 text-xs text-hs-text-faint">{meta}</div>}
      {meal.recipeUrl && (
        <div className="mt-3">
          <a href={mealieLink(meal.recipeUrl)} target="_blank" rel="noopener noreferrer" className={linkButton}>
            {t('mealPlannerModal.openInMealie')}
            <ExternalLink className="w-3.5 h-3.5" aria-hidden />
          </a>
        </div>
      )}
      <MealieIngredients recipeId={parseMealieMealId(meal.id)} />
      <p className="mt-4 flex items-start gap-1.5 text-[11.5px] leading-4 text-hs-text-faint">
        <Pencil className="w-3 h-3 mt-0.5 shrink-0" aria-hidden />
        <span>{t('mealPlannerModal.mealie.readOnlyNote')}</span>
      </p>
    </div>
  );
}

/** The recipe's ingredients from Mealie, two to a row, read only. */
function MealieIngredients({ recipeId }: { recipeId: string | null }) {
  const t = useTranslate('editor');
  const [state, setState] = useState<{ id: string; detail: MealieRecipeDetailWire | null; failed: boolean; problem?: MealieProblem } | null>(null);
  useEffect(() => {
    if (!recipeId) return;
    const controller = new AbortController();
    fetchMealieRecipeDetail(editorFetch, recipeId, controller.signal).then(
      (detail) => setState({ id: recipeId, detail, failed: false }),
      (err) => {
        if (controller.signal.aborted) return;
        setState({ id: recipeId, detail: null, failed: true, problem: err instanceof MealClientError ? err.problem : undefined });
      },
    );
    return () => controller.abort();
  }, [recipeId]);
  if (!recipeId) return null;
  const current = state?.id === recipeId ? state : null;
  if (current?.detail && current.detail.ingredients.length === 0) return null;
  return (
    <section className="mt-4" aria-label={t('mealPlannerModal.detail.ingredientsLabel')}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-hs-text-faint mb-1.5">
        {t('mealPlannerModal.detail.ingredientsLabel')}
      </div>
      {!current ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-3 rounded bg-hs-card" />)}
        </div>
      ) : current.failed || !current.detail ? (
        // Mealie refusing the token is not Mealie losing the ingredients.
        current.problem === 'token' ? (
          <p className="text-xs text-hs-text-faint">
            <span className="block font-semibold text-hs-text-muted">{t('mealPlannerModal.mealie.tokenRefusedTitle')}</span>
            {t('mealPlannerModal.mealie.tokenFix')}
          </p>
        ) : current.problem === 'not-connected' ? (
          <p className="text-xs text-hs-text-faint">{t('mealPlannerModal.mealie.notConnectedTitle')}</p>
        ) : (
          <p className="text-xs text-hs-text-faint">{t('mealPlannerModal.mealie.ingredientsFailed')}</p>
        )
      ) : (
        <ul className="grid grid-cols-2 gap-x-3">
          {current.detail.ingredients.map((ing, i) => (
            ing.heading ? (
              <li key={i} className="col-span-2 pt-2 pb-0.5 text-[11px] font-semibold text-hs-text-muted">
                {ing.heading}{ing.text ? <span className="block font-normal text-xs text-hs-text-body">{ing.text}</span> : null}
              </li>
            ) : (
              <li key={i} className="py-1 text-xs text-hs-text-body border-b border-hs-border/60 leading-snug">{ing.text}</li>
            )
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Grocery ──────────────────────────────────

export function MealieGrocery({ shoppingUrl }: { shoppingUrl: string | null }) {
  const t = useTranslate('editor');
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
      <span className="w-11 h-11 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
        <ShoppingCart className="w-5 h-5" aria-hidden />
      </span>
      <p className="text-sm font-semibold text-hs-text-body">{t('mealPlannerModal.mealie.groceryTitle')}</p>
      <p className="text-xs text-hs-text-faint leading-relaxed max-w-[280px]">{t('mealPlannerModal.mealie.groceryBody')}</p>
      {shoppingUrl && (
        <a href={shoppingUrl} target="_blank" rel="noopener noreferrer" className={linkButton}>
          {t('mealPlannerModal.mealie.openMealie')}
          <ExternalLink className="w-3.5 h-3.5" aria-hidden />
        </a>
      )}
    </div>
  );
}
