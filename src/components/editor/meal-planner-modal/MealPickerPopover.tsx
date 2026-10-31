'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, History, Pencil, Search, Tag, X } from 'lucide-react';
import type { MealCourseKind, MealSlotType, SavedMeal } from '@/types/config';
import { dateToDayIndex, getLocalizedDayNames, getMealSlotLabelKey } from '@/lib/meal-constants';
import { mealsForCourse, searchSavedMeals } from '@/lib/meal-dish-rules';
import { editorFetch } from '@/lib/editor-fetch';
import type { MealieRecipeFilter } from '@/lib/meal-client';
import { useMealieRecipeSearch } from '@/components/meals/useMealieRecipeSearch';
import { useMealieCourseCategory } from '@/components/meals/useMealieCourseCategory';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { useDishTime } from './dish-time';
import DishPicture from './DishPicture';

/** What the picker is choosing: the main dish, a course to add, or a course to swap. */
export type PickerPurpose =
  | { kind: 'main' }
  | { kind: 'add'; course: MealCourseKind }
  | { kind: 'swap'; course: MealCourseKind; index: number };

interface MealPickerPopoverProps {
  target: { date: string; slot: MealSlotType };
  purpose: PickerPurpose;
  /** `mealie`: search Mealie's recipes live. `local`: the family's saved meals. */
  source: 'local' | 'mealie';
  /** The family's saved meals (not used in Mealie mode). */
  meals: SavedMeal[];
  onPickMeal: (meal: SavedMeal) => void;
  /** Typed text instead of a meal: a note in Mealie, a typed meal here. */
  onPickText: (text: string) => void;
  onClose: () => void;
}

type Row = { type: 'text' } | { type: 'meal'; meal: SavedMeal };

/** Loading placeholder rows, so the list keeps its height while Mealie answers. */
const PLACEHOLDER_ROWS = 4;

export default function MealPickerPopover({
  target,
  purpose,
  source,
  meals,
  onPickMeal,
  onPickText,
  onClose,
}: MealPickerPopoverProps) {
  const t = useTranslate('editor');
  const tModules = useTranslate('modules');
  const formattingLocale = useFormattingLocale();
  const dishTime = useDishTime();
  const dayNamesFull = useMemo(() => getLocalizedDayNames(formattingLocale, 'full'), [formattingLocale]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Exclude<MealieRecipeFilter, 'all'>>('favorites');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const query = search.trim();
  const onMealie = source === 'mealie';

  // "Add a side" opens on the household's own Side category when it has one.
  const courseKind = onMealie && purpose.kind !== 'main' ? purpose.course : null;
  const { category: courseCategory, ready: categoryReady } = useMealieCourseCategory(editorFetch, courseKind);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [categoryApplied, setCategoryApplied] = useState(false);
  useEffect(() => {
    if (!categoryReady || categoryApplied) return;
    setCategoryApplied(true);
    if (courseCategory) setCategory(courseCategory.slug);
  }, [categoryReady, categoryApplied, courseCategory]);
  const inCategory = !query && !!category && !!courseCategory;

  const mealie = useMealieRecipeSearch(editorFetch, {
    search,
    filter: inCategory ? 'all' : filter,
    category: inCategory ? category : undefined,
    enabled: onMealie && categoryReady,
  });

  // The family's own meals: when adding a side, the meals saved as a side
  // come first under their own heading, then everything else.
  const localGroups = useMemo(() => {
    if (onMealie) return null;
    const found = searchSavedMeals(meals, query);
    if (purpose.kind === 'main') return { matching: [], rest: found };
    const { matching, others } = mealsForCourse(found, purpose.course);
    return { matching, rest: others };
  }, [onMealie, meals, query, purpose]);

  const mealRows: SavedMeal[] = useMemo(
    () => (onMealie ? mealie.items : [...(localGroups?.matching ?? []), ...(localGroups?.rest ?? [])]),
    [onMealie, mealie.items, localGroups],
  );
  // Typing it in is not offered while Mealie is not answering: the note
  // could not be saved there.
  const offerText = !!query && !(onMealie && mealie.error);
  const rows: Row[] = useMemo(
    () => [...(offerText ? [{ type: 'text' as const }] : []), ...mealRows.map((meal) => ({ type: 'meal' as const, meal }))],
    [offerText, mealRows],
  );
  const textOffset = offerText ? 1 : 0;

  // The highlighted row for the arrow keys and Enter: the first meal when
  // there is one, otherwise "Type it instead".
  const [active, setActive] = useState(-1);
  const firstMealId = mealRows[0]?.id;
  useEffect(() => {
    setActive(firstMealId ? textOffset : query ? 0 : -1);
  }, [firstMealId, textOffset, query, filter, category]);

  // Typing goes to the search at once; once a meal is picked (or the picker
  // is closed), the keyboard is back on the cell or button that opened it.
  useReturnFocus();
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Escape closes the picker only, not the window or the meal popover under
  // it (capture phase, so it fires before their handlers).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const pick = useCallback((row: Row | undefined) => {
    if (!row) return;
    if (row.type === 'text') onPickText(query);
    else onPickMeal(row.meal);
  }, [onPickMeal, onPickText, query]);

  useEffect(() => {
    if (active < 0) return;
    listRef.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(rows[active]);
    }
  }

  function onListScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!onMealie || !mealie.hasMore) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 120) mealie.loadMore();
  }

  const slotLabel = tModules(getMealSlotLabelKey(target.slot));
  const dayName = dayNamesFull[dateToDayIndex(target.date)] ?? '';
  const title = purpose.kind === 'main'
    ? t('mealPlannerModal.picker.title')
    : purpose.kind === 'add'
      ? t(`mealPlannerModal.picker.titleAdd.${purpose.course}`)
      : t(`mealPlannerModal.picker.titleSwap.${purpose.course}`);

  const loadingFirstPage = onMealie && (mealie.loading || !categoryReady);
  const nothingFound = query && !loadingFirstPage && !mealie.error && mealRows.length === 0;

  let countLine: string | null = null;
  if (onMealie) {
    if (loadingFirstPage) countLine = t('mealPlannerModal.picker.lookingInMealie');
    else if (mealie.error) countLine = null;
    else if (query) countLine = t('mealPlannerModal.picker.recipesInMealie', { count: mealie.total });
    else if (inCategory) countLine = t('mealPlannerModal.picker.categoryCount', { count: mealie.total, category: courseCategory.name });
    else if (filter === 'favorites') countLine = t('mealPlannerModal.picker.favoritesAtoZ', { count: mealie.total });
    else countLine = t('mealPlannerModal.picker.recentlyMadeFirst');
  }

  const rowClass = (i: number) =>
    `flex items-center gap-3 w-full px-2 py-[7px] rounded-md text-left transition ${active === i ? 'bg-hs-card' : ''}`;

  function mealRow(meal: SavedMeal, i: number) {
    const time = dishTime(meal);
    const kind = onMealie ? meal.tags?.[0] : undefined;
    return (
      <button
        key={meal.id}
        type="button"
        data-row={i}
        onClick={() => onPickMeal(meal)}
        onMouseEnter={() => setActive(i)}
        className={rowClass(i)}
      >
        <DishPicture meal={meal} size={32} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-hs-text-body truncate leading-[18px]">{meal.name}</span>
          {kind && <span className="block text-[11px] text-hs-text-faint truncate leading-[15px]">{kind}</span>}
        </span>
        {time && <span className="text-xs text-hs-text-faint shrink-0">{time}</span>}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" data-meal-picker>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div
        role="dialog"
        aria-label={title}
        className="relative bg-hs-panel border border-hs-border-strong rounded-xl w-[400px] max-h-[540px] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-hs-border-strong">
          <div className="text-sm font-bold text-hs-text-body">{title}</div>
          <div className="text-xs text-hs-text-faint">
            {dayName} &middot; {slotLabel}
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-hs-border-strong/50">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-hs-text-faint" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              className={`${MODAL_INPUT_CLASS} pl-8 pr-8`}
              placeholder={onMealie ? t('mealPlannerModal.picker.searchMealiePlaceholder') : t('mealPlannerModal.picker.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onInputKeyDown}
              aria-label={onMealie ? t('mealPlannerModal.picker.searchMealiePlaceholder') : t('mealPlannerModal.picker.searchPlaceholder')}
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); inputRef.current?.focus(); }}
                aria-label={t('mealPlannerModal.picker.clearSearch')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-hs-text-faint hover:text-hs-text-body"
              >
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            )}
          </div>
          {onMealie && (
            <div className="flex gap-1.5 mt-2">
              {(['favorites', 'recent'] as const).map((f) => {
                const on = !query && !inCategory && filter === f;
                const Icon = f === 'favorites' ? Heart : History;
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    onClick={() => { setFilter(f); setCategory(undefined); setSearch(''); inputRef.current?.focus(); }}
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
              {courseCategory && (
                <button
                  type="button"
                  aria-pressed={inCategory}
                  onClick={() => { setCategory(courseCategory.slug); setSearch(''); inputRef.current?.focus(); }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[11.5px] border transition ${
                    inCategory
                      ? 'border-amber-500/60 text-amber-500 bg-amber-500/8'
                      : 'border-hs-border-strong text-hs-text-faint hover:text-hs-text-muted'
                  }`}
                >
                  <Tag className="w-3 h-3" aria-hidden />
                  {courseCategory.name}
                </button>
              )}
            </div>
          )}
        </div>

        {/* List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2" onScroll={onListScroll}>
          {onMealie && (countLine || rows.length > 0) && (
            <div className="flex justify-between px-2 pt-0.5 pb-1 text-[11px] text-hs-text-faint">
              <span>{countLine}</span>
              {rows.length > 0 && <span>{t('mealPlannerModal.picker.keysHint')}</span>}
            </div>
          )}

          {offerText && (
            <button
              type="button"
              data-row={0}
              onClick={() => onPickText(query)}
              onMouseEnter={() => setActive(0)}
              className={`${rowClass(0)} border border-dashed mb-1.5 ${
                nothingFound ? 'border-amber-500/60 bg-amber-500/8' : 'border-hs-border-strong'
              }`}
            >
              <span className="w-8 h-8 rounded-md border border-dashed border-hs-border-strong text-hs-text-faint flex items-center justify-center shrink-0">
                <Pencil className="w-3.5 h-3.5" aria-hidden />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-hs-text-body truncate leading-[18px]">
                  {t('mealPlannerModal.picker.typeInstead', { text: query })}
                </span>
                <span className="block text-[11px] text-hs-text-faint leading-[15px]">
                  {onMealie ? t('mealPlannerModal.picker.typeInsteadMealie') : t('mealPlannerModal.picker.typeInsteadLocal')}
                </span>
              </span>
            </button>
          )}

          {nothingFound && (
            <div className="px-3 py-5 text-center">
              <p className="text-sm font-semibold text-hs-text-body">
                {onMealie
                  ? t('mealPlannerModal.picker.noRecipesCalled', { text: query })
                  : t('mealPlannerModal.picker.noMealsFound')}
              </p>
              {onMealie && (
                <p className="mt-1 text-xs text-hs-text-faint leading-relaxed">{t('mealPlannerModal.picker.noRecipesHint')}</p>
              )}
            </div>
          )}

          {onMealie && loadingFirstPage && (
            <div aria-hidden>
              {Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-[7px]">
                  <span className="w-8 h-8 rounded-md bg-hs-card shrink-0" />
                  <span className="flex-1 space-y-1.5">
                    <span className="block h-3 w-2/3 rounded bg-hs-card" />
                    <span className="block h-2.5 w-1/3 rounded bg-hs-card/70" />
                  </span>
                </div>
              ))}
            </div>
          )}

          {onMealie && mealie.error && !loadingFirstPage && (
            <div className="px-3 py-5 text-center">
              <p className="text-sm font-semibold text-hs-text-body">{t(mealie.problem === 'not-connected' ? 'mealPlannerModal.mealie.notConnectedTitle' : mealie.problem === 'token' ? 'mealPlannerModal.mealie.tokenRefusedTitle' : 'mealPlannerModal.picker.mealieError')}</p>
              {mealie.problem === 'token' && <p className="mt-1 text-xs text-hs-text-faint leading-relaxed">{t('mealPlannerModal.mealie.tokenFix')}</p>}
              <button
                type="button"
                onClick={mealie.retry}
                className="mt-2 px-3 py-1 text-xs font-medium rounded-md border border-hs-border-strong text-hs-text-muted hover:text-hs-text-body hover:bg-hs-card"
              >
                {t('mealPlannerModal.picker.tryAgain')}
              </button>
            </div>
          )}

          {onMealie && !loadingFirstPage && !mealie.error && !query && mealRows.length === 0 && (
            <div className="px-3 py-5 text-center text-xs text-hs-text-faint leading-relaxed">
              {inCategory
                ? t('mealPlannerModal.picker.noneInCategory', { category: courseCategory.name })
                : filter === 'favorites' ? t('mealPlannerModal.picker.noFavorites') : t('mealPlannerModal.picker.noRecentlyMade')}
            </div>
          )}

          {onMealie && !loadingFirstPage && mealRows.map((meal, i) => mealRow(meal, i + textOffset))}

          {!onMealie && localGroups && (
            <>
              {localGroups.matching.length > 0 && purpose.kind !== 'main' && (
                <div className="px-2 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-hs-text-faint">
                  {t(`mealPlannerModal.picker.groupHeading.${purpose.course}`)}
                </div>
              )}
              {localGroups.matching.map((meal, i) => mealRow(meal, i + textOffset))}
              {localGroups.matching.length > 0 && localGroups.rest.length > 0 && (
                <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-hs-text-faint">
                  {t('mealPlannerModal.picker.everythingElse')}
                </div>
              )}
              {localGroups.rest.map((meal, i) => mealRow(meal, i + textOffset + localGroups.matching.length))}
              {!query && meals.length === 0 && (
                <div className="flex items-center justify-center py-8 text-xs text-hs-text-faint">
                  {t('mealPlannerModal.picker.noMealsFound')}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
