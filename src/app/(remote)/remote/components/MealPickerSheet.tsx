'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, CloudOff, Pencil, Search } from 'lucide-react';
import type { SavedMeal } from '@/types/config';
import type { MealieRecipeFilter } from '@/lib/meal-client';
import { DEFAULT_MEAL_EMOJI, LIBRARY_FILTERS, getMealSlotLabelKey, type LibraryFilter } from '@/lib/meal-constants';
import {
  filterLibraryMeals,
  mealShownMinutes,
  mealsForCourse,
  mealsForSlot,
  mealTagLabel,
  savedMealNamed,
  searchSavedMeals,
} from '@/lib/meal-dish-rules';
import { editorFetch } from '@/lib/editor-fetch';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useTranslate } from '@/i18n';
import { useMealieRecipeSearch } from '@/components/meals/useMealieRecipeSearch';
import { useMealieCourseCategory } from '@/components/meals/useMealieCourseCategory';
import Glyph from '@/components/ui/Glyph';
import { useMealieRecipeCount } from '../hooks/useMealieRecipeCount';
import MealThumb from './MealThumb';
import { RetryButton } from './MealsMealieStatus';
import { CenterMessage, FilterChip, RecipeSearchBox, RecipeShortcutChips, RecipeSkeletonRows } from './MealieRecipeParts';
import { formatShownMinutes, type MealPickTarget } from './meals-shared';
import { mealieProblemWords } from './MealsMealieStatus';

interface MealPickerSheetProps {
  target: MealPickTarget;
  /** "Dinner · Thursday" */
  subtitle: string;
  /** Search Mealie's recipes (the plan lives there), or list the family's own meals. */
  fromMealie: boolean;
  /** The family's own meals (local mode). */
  library: SavedMeal[];
  /** Meals already in this place, marked with a tick: the current dish, or the same kind already added. */
  chosenIds: ReadonlySet<string>;
  /** What the typed-meal box starts with (local mode): the words a typed dish already holds. */
  initialText: string;
  onPickMeal: (meal: SavedMeal) => void;
  onPickText: (text: string) => void;
  onClose: () => void;
  /** Local mode with no saved meals: go and add some. */
  onOpenLibrary: () => void;
}

/** What the sheet's title says it is choosing. */
function useTitle(target: MealPickTarget): string {
  const t = useTranslate('remote');
  if (target.pick === 'main') return t('mealsPlan.picker.title');
  if (target.pick === 'add') return t(`mealSheet.add.${target.kind}`);
  return t(`mealPicker.swap.${target.kind}`);
}

/**
 * The recipe picker: what goes in a slot, a new course, or a swap for one.
 * With the plan in Mealie it searches Mealie's recipes live, with Favorites
 * and Recently made before anything is typed, and typed words become a note;
 * otherwise it searches the family's own meals as words are typed, with the
 * Library's chips, and the same words can go on the plan as typed instead.
 */
export default function MealPickerSheet(props: MealPickerSheetProps) {
  const { fromMealie, library, onClose, subtitle, target } = props;
  const t = useTranslate('remote');
  const title = useTitle(target);
  const dialogRef = useFocusTrap<HTMLDivElement>({ focus: 'container' });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid="meal-picker"
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          onClose();
        }}
        style={{
          outline: 'none',
          position: 'relative',
          background: 'var(--hs-bg-body)',
          borderRadius: '16px 16px 0 0',
          // Mealie's list fills in as it answers, and the family's meals
          // narrow as words are typed: a fixed height keeps the sheet (and
          // the box under the finger) from jumping while they do.
          ...(fromMealie || library.length > 0 ? { height: '85vh' } : { maxHeight: '60vh' }),
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0', flex: 'none' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--hs-text-faint)' }} />
        </div>
        {fromMealie ? (
          <>
            <div style={{ padding: '4px 16px 12px', borderBottom: '1px solid var(--hs-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flex: 'none' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--hs-text-primary)', lineHeight: '24px' }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 2, lineHeight: '18px' }}>{subtitle}</div>
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{
                  minWidth: 44, minHeight: 44, padding: '4px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                  border: '1px solid var(--hs-border)', background: 'transparent', color: 'var(--hs-text-muted)',
                  cursor: 'pointer', fontFamily: 'inherit', flex: 'none',
                }}
              >
                {t('mealPicker.cancel')}
              </button>
            </div>
            <MealieBody {...props} />
          </>
        ) : (
          <>
            <div style={{ padding: '8px 16px 10px', borderBottom: '1px solid var(--hs-border)', flex: 'none' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--hs-text-primary)' }}>{title}</div>
              <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 2 }}>{subtitle}</div>
            </div>
            <LocalBody {...props} />
          </>
        )}
      </div>
    </div>
  );
}

function Tick() {
  return <span aria-hidden="true" style={{ fontSize: 15, color: '#f59e0b', fontWeight: 700, flex: 'none' }}>&#10003;</span>;
}

/** Mealie's recipes, searched live through the hub. */
function MealieBody({ target, chosenIds, onPickMeal, onPickText }: MealPickerSheetProps) {
  const t = useTranslate('remote');
  // Starts on the shortcuts, not on a search for the note the slot holds.
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MealieRecipeFilter>('favorites');
  // "Add a side" opens on the household's own Side category when it has one.
  const courseKind = target.pick === 'main' ? null : target.kind;
  const { category: courseCategory, ready: categoryReady } = useMealieCourseCategory(editorFetch, courseKind);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [categoryApplied, setCategoryApplied] = useState(false);
  useEffect(() => {
    if (!categoryReady || categoryApplied) return;
    setCategoryApplied(true);
    if (courseCategory) {
      setFilter('all');
      setCategory(courseCategory.slug);
    }
  }, [categoryReady, categoryApplied, courseCategory]);
  const typed = query.trim();
  const search = useMealieRecipeSearch(editorFetch, { search: query, filter, category: typed ? undefined : category, enabled: categoryReady });
  const count = useMealieRecipeCount(true);
  const listRef = useRef<HTMLDivElement>(null);

  // A new search starts at the top of its list.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [typed, filter]);

  const nothingFound = !search.loading && !search.error && search.items.length === 0;
  let heading: string | null = null;
  if (!search.loading && !search.error && search.items.length > 0) {
    if (typed) heading = t('mealie.search.recipeCount', { count: search.total });
    else if (filter === 'favorites') heading = t('mealie.search.favoritesCount', { count: search.total });
    else if (category && courseCategory) heading = t('mealie.search.categoryCount', { count: search.total, category: courseCategory.name });
    else heading = t('mealie.search.recentHeading');
  }

  let empty: ReactNode = null;
  if (nothingFound) {
    empty = typed ? (
      <CenterMessage icon={<Search size={24} strokeWidth={2} />} title={t('mealie.search.noneTitle', { query: typed })} description={t('mealie.search.noneDescription')} />
    ) : category && courseCategory ? (
      <CenterMessage icon={<Search size={24} strokeWidth={2} />} title={t('mealie.search.noneInCategoryTitle', { category: courseCategory.name })} description={t('mealie.search.noneInCategoryDescription')} />
    ) : filter === 'favorites' ? (
      <CenterMessage icon={<Search size={24} strokeWidth={2} />} title={t('mealie.search.noFavoritesTitle')} description={t('mealie.search.noFavoritesDescription')} />
    ) : (
      <CenterMessage icon={<Search size={24} strokeWidth={2} />} title={t('mealie.search.noRecentTitle')} description={t('mealie.search.noRecentDescription')} />
    );
  }

  return (
    <>
      <div style={{ padding: '12px 16px 0', flex: 'none' }}>
        <RecipeSearchBox
          value={query}
          onChange={setQuery}
          placeholder={count ? t('mealie.search.placeholderCount', { count }) : t('mealie.search.placeholder')}
          ariaLabel={t('mealie.search.ariaLabel')}
        />
      </div>
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (search.hasMore && el.scrollTop + el.clientHeight > el.scrollHeight - 240) search.loadMore();
        }}
        style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 16px 16px', flex: 1, minHeight: 0 }}
      >
        <RecipeShortcutChips
          filter={category ? 'all' : filter}
          searching={!!typed}
          onFilter={(next) => {
            setQuery('');
            setFilter(next);
            setCategory(undefined);
          }}
        >
          {courseCategory && (
            <FilterChip
              active={!typed && category === courseCategory.slug}
              onClick={() => {
                setQuery('');
                setFilter('all');
                setCategory(courseCategory.slug);
              }}
            >
              {courseCategory.name}
            </FilterChip>
          )}
        </RecipeShortcutChips>
        {heading && <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', padding: '10px 0 2px' }}>{heading}</div>}
        {search.loading ? (
          <RecipeSkeletonRows />
        ) : search.error ? (
          <CenterMessage icon={<CloudOff size={24} strokeWidth={2} />} title={t(`${mealieProblemWords(search.problem)}.title`)} description={search.problem === 'unreachable' || !search.problem ? t('mealie.search.errorDescription') : t(`${mealieProblemWords(search.problem)}.description`)}>
            <RetryButton onRetry={search.retry} style={{ padding: '0 18px' }} />
          </CenterMessage>
        ) : (
          empty ?? search.items.map((meal) => {
            const chosen = chosenIds.has(meal.id);
            const shown = mealShownMinutes(meal);
            const tag = meal.tags?.[0];
            const meta = [shown ? formatShownMinutes(shown, t) : null, tag ? mealTagLabel(meal, tag) : null].filter(Boolean).join(' · ');
            return (
              <button
                key={meal.id}
                type="button"
                onClick={() => onPickMeal(meal)}
                aria-pressed={chosen}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', minHeight: 66,
                  border: 'none', borderBottom: '1px solid var(--hs-border)', background: 'transparent',
                  textAlign: 'left', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <MealThumb meal={meal} size={48} radius={8} emojiSize={26} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      fontSize: 15, fontWeight: 600, lineHeight: '20px', color: chosen ? '#f59e0b' : 'var(--hs-text-primary)',
                    }}
                  >
                    {meal.name}
                  </span>
                  {meta && <span style={{ display: 'block', fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 1, lineHeight: '17px' }}>{meta}</span>}
                </span>
                {chosen && <Tick />}
              </button>
            );
          })
        )}
      </div>
      {typed && !search.error && (
        // Lit when Mealie found nothing and it is the way forward. Not
        // offered while Mealie is not answering: the note could not be
        // saved there.
        <TypeInsteadRow
          title={t('mealie.search.typeInstead', { query: typed })}
          note={t('mealie.search.typeInsteadNote')}
          lit={nothingFound}
          onClick={() => onPickText(typed)}
          testId="mealie-type-instead"
        />
      )}
    </>
  );
}

/**
 * Put the typed words on the plan instead of a recipe. Pinned under the
 * list, never mixed into the results, so it never scrolls away and every
 * match stays above it.
 */
function TypeInsteadRow({ title, note, lit, onClick, testId }: {
  title: string;
  note: string;
  /** Nothing matched the words, so this is the way forward. */
  lit: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <div style={{ padding: '12px 16px 24px', borderTop: '1px solid var(--hs-border)', flex: 'none', background: 'var(--hs-bg-body)' }}>
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', minHeight: 56,
          borderRadius: 12, border: `1px dashed ${lit ? '#f59e0b' : 'var(--hs-border-strong)'}`,
          background: lit ? 'rgba(245,158,11,0.08)' : 'transparent',
          textAlign: 'left', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 36, height: 36, borderRadius: 8, border: '1px dashed var(--hs-border-strong)', color: 'var(--hs-text-faint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
          }}
        >
          <Pencil size={15} strokeWidth={2} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--hs-text-primary)', lineHeight: '20px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--hs-text-muted)', marginTop: 1, lineHeight: '17px' }}>
            {note}
          </span>
        </span>
        <ChevronRight size={18} strokeWidth={2} aria-hidden style={{ color: 'var(--hs-text-faint)', flex: 'none' }} />
      </button>
    </div>
  );
}

/**
 * The family's own meals, searched as words are typed (names and tags, as on
 * the Library) and narrowed by the Library's chips, with the typed words
 * offered last as a meal typed in for one day.
 */
function LocalBody({ target, library, chosenIds, initialText, onPickMeal, onPickText, onClose, onOpenLibrary }: MealPickerSheetProps) {
  const t = useTranslate('remote');
  const tModules = useTranslate('modules');
  // One box for both: it narrows the meals as it is typed in, and the same
  // words can go on the plan as typed. Tonight is often not a library entry,
  // and a household that has saved none still needs a way out of the sheet.
  // Changing a typed-in dish starts with its words, so a saved meal of that
  // name shows first.
  const [query, setQuery] = useState(initialText);
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const typed = query.trim();
  const found = useMemo(() => filterLibraryMeals(library, typed, filter), [library, typed, filter]);
  // Whether the words match anything saved, whatever chip is on: typing
  // them in is the way forward only when they do not.
  const inLibrary = useMemo(() => !!typed && searchSavedMeals(library, typed).length > 0, [library, typed]);
  // The main dish leads with the meals tagged for this meal of the day, a
  // course with the meals saved as its kind.
  const groups = target.pick === 'main' ? mealsForSlot(found, target.slot) : mealsForCourse(found, target.kind);
  const groupTitle = target.pick === 'main' ? tModules(getMealSlotLabelKey(target.slot)) : t(`mealPicker.savedAs.${target.kind}`);
  const listRef = useRef<HTMLDivElement>(null);

  // A new search starts at the top of its list.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [typed, filter]);

  // Enter takes the saved meal the words name, and types them in when they
  // match nothing saved. With only partial matches it puts the keyboard
  // away, so the list and the row under it are in view.
  const enter = (input: HTMLInputElement) => {
    if (!typed) return;
    const named = savedMealNamed(library, typed);
    if (named) onPickMeal(named);
    else if (!inLibrary) onPickText(typed);
    else input.blur();
  };

  const row = (meal: SavedMeal) => {
    const chosen = chosenIds.has(meal.id);
    const shown = mealShownMinutes(meal);
    return (
      <button
        key={meal.id}
        onClick={() => onPickMeal(meal)}
        aria-pressed={chosen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', border: 'none',
          borderBottom: '1px solid var(--hs-border)', background: 'transparent', cursor: 'pointer',
          textAlign: 'left' as const, color: 'inherit', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 24 }}><Glyph value={meal.emoji ?? DEFAULT_MEAL_EMOJI} fallback={DEFAULT_MEAL_EMOJI} /></span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: chosen ? '#f59e0b' : 'var(--hs-text-primary)' }}>
          {meal.name}
        </span>
        {chosen && <Tick />}
        {shown && <span style={{ fontSize: 11, color: 'var(--hs-text-faint)' }}>{formatShownMinutes(shown, t)}</span>}
      </button>
    );
  };
  const groupHeading = (text: string) => (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--hs-text-faint)', padding: '12px 0 2px' }}>
      {text}
    </div>
  );

  return (
    <>
      <div style={{ padding: '12px 16px 0', flex: 'none' }}>
        <RecipeSearchBox
          value={query}
          onChange={setQuery}
          onEnter={enter}
          placeholder={target.pick === 'main' ? t('mealsPlan.picker.typePlaceholder') : t(`mealPicker.typePlaceholder.${target.kind}`)}
          ariaLabel={t('mealsPlan.picker.searchLabel')}
        />
      </div>
      <div ref={listRef} style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 16px 16px', flex: 1, minHeight: 0, scrollbarWidth: 'none' as const }}>
        {library.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0 8px', color: 'var(--hs-text-faint)', fontSize: 13, lineHeight: 1.5 }}>
            <p style={{ margin: 0 }}>{t('mealsPlan.picker.emptyLibrary')}</p>
            <button
              onClick={() => { onClose(); onOpenLibrary(); }}
              style={{
                marginTop: 12, padding: '10px 20px', minHeight: 44, borderRadius: 10, border: '1px solid var(--hs-border)',
                background: 'var(--hs-bg-panel)', color: 'var(--hs-text-body)', fontSize: 13, fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {t('mealsPlan.empty.addMealsButton')}
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', padding: '10px 0 2px' }}>
              {LIBRARY_FILTERS.map((f) => (
                <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>
                  {t(`mealsTab.library.filters.${f}`)}
                </FilterChip>
              ))}
            </div>
            {found.length === 0 ? (
              typed && !inLibrary ? (
                <CenterMessage icon={<Search size={24} strokeWidth={2} />} title={t('mealPicker.noneTitle', { query: typed })} description={t('mealPicker.noneDescription')} padding="32px 8px" />
              ) : (
                <CenterMessage icon={<Search size={24} strokeWidth={2} />} title={t('mealsTab.library.empty.titleNoMatches')} description={t('mealsTab.library.empty.hintNoMatches')} padding="32px 8px" />
              )
            ) : groups.matching.length > 0 ? (
              <>
                {groupHeading(groupTitle)}
                {groups.matching.map(row)}
                {groups.others.length > 0 && groupHeading(t('mealPicker.everythingElse'))}
                {groups.others.map(row)}
              </>
            ) : (
              <div style={{ paddingTop: 8 }}>{found.map(row)}</div>
            )}
          </>
        )}
      </div>
      {typed && (
        <TypeInsteadRow
          title={t('mealPicker.typeInstead', { query: typed })}
          note={t('mealPicker.typeInsteadNote')}
          lit={!inLibrary}
          onClick={() => onPickText(typed)}
          testId="meal-type-instead"
        />
      )}
    </>
  );
}
