'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, CloudOff, Pencil, Search } from 'lucide-react';
import type { SavedMeal } from '@/types/config';
import type { MealieRecipeFilter } from '@/lib/meal-client';
import { DEFAULT_MEAL_EMOJI } from '@/lib/meal-constants';
import { mealShownMinutes, mealsForCourse } from '@/lib/meal-dish-rules';
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
import { formatShownMinutes, mealTagLabel, type MealPickTarget } from './meals-shared';
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
 * otherwise it lists the family's own meals, those saved as the kind being
 * added first, with the box for a meal typed in for one day on top.
 */
export default function MealPickerSheet(props: MealPickerSheetProps) {
  const { fromMealie, onClose, subtitle, target } = props;
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
          // Mealie's list fills in as it answers: a fixed height keeps the
          // sheet from jumping while it does.
          ...(fromMealie ? { height: '85vh' } : { maxHeight: '60vh' }),
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
        // Pinned, never mixed into the results, so it never scrolls away; lit
        // when Mealie found nothing and it is the way forward. Not offered
        // while Mealie is not answering: the note could not be saved there.
        <div style={{ padding: '12px 16px 24px', borderTop: '1px solid var(--hs-border)', flex: 'none', background: 'var(--hs-bg-body)' }}>
          <button
            type="button"
            onClick={() => onPickText(typed)}
            data-testid="mealie-type-instead"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', minHeight: 56,
              borderRadius: 12, border: `1px dashed ${nothingFound ? '#f59e0b' : 'var(--hs-border-strong)'}`,
              background: nothingFound ? 'rgba(245,158,11,0.08)' : 'transparent',
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
                {t('mealie.search.typeInstead', { query: typed })}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--hs-text-muted)', marginTop: 1, lineHeight: '17px' }}>
                {t('mealie.search.typeInsteadNote')}
              </span>
            </span>
            <ChevronRight size={18} strokeWidth={2} aria-hidden style={{ color: 'var(--hs-text-faint)', flex: 'none' }} />
          </button>
        </div>
      )}
    </>
  );
}

/** The family's own meals, with the box for a meal typed in for one day. */
function LocalBody({ target, library, chosenIds, initialText, onPickMeal, onPickText, onClose, onOpenLibrary }: MealPickerSheetProps) {
  const t = useTranslate('remote');
  // A meal typed for one day only. Tonight is often not a library entry, and
  // without this every dinner had to be saved to the library first, which is
  // also what left the picker a dead end on a household that had saved none.
  const [typedMeal, setTypedMeal] = useState(initialText);
  const submit = () => {
    if (typedMeal.trim()) onPickText(typedMeal);
  };
  // Adding a side leads with the meals saved as sides; the main dish lists
  // the library as it is.
  const groups = target.pick === 'main' ? null : mealsForCourse(library, target.kind);
  const kind = target.pick === 'main' ? null : target.kind;

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
        <span style={{ fontSize: 24, lineHeight: 1 }}><Glyph value={meal.emoji ?? DEFAULT_MEAL_EMOJI} fallback={DEFAULT_MEAL_EMOJI} /></span>
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
      {/* Type tonight's dinner without saving it to the library first.
          Sits above the list because it is the quickest way out of the
          sheet, and it is the only way out when the library is empty. */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--hs-border)', flex: 'none' }}>
        <input
          type="text"
          value={typedMeal}
          onChange={(e) => setTypedMeal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder={target.pick === 'main' ? t('mealsPlan.picker.typePlaceholder') : t(`mealPicker.typePlaceholder.${target.kind}`)}
          aria-label={t('mealsPlan.picker.typeLabel')}
          maxLength={80}
          style={{
            flex: 1, minWidth: 0, minHeight: 44, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--hs-border)',
            background: 'var(--hs-bg-card)', color: 'var(--hs-text-primary)', fontSize: 14, fontFamily: 'inherit',
          }}
        />
        <button
          onClick={submit}
          disabled={!typedMeal.trim()}
          style={{
            padding: '10px 18px', minHeight: 44, borderRadius: 10, border: 'none',
            cursor: typedMeal.trim() ? 'pointer' : 'default',
            background: typedMeal.trim() ? '#f59e0b' : 'var(--hs-bg-card)',
            color: typedMeal.trim() ? '#000' : 'var(--hs-text-faint)',
            fontSize: 14, fontWeight: 600, fontFamily: 'inherit', flexShrink: 0,
          }}
        >
          {t('mealsPlan.picker.typeAdd')}
        </button>
      </div>
      <div style={{ overflow: 'auto', padding: '0 16px 16px', flex: 1, minHeight: 0, scrollbarWidth: 'none' as const }}>
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
        ) : groups && kind && groups.matching.length > 0 ? (
          <>
            {groupHeading(t(`mealPicker.savedAs.${kind}`))}
            {groups.matching.map(row)}
            {groups.others.length > 0 && groupHeading(t('mealPicker.everythingElse'))}
            {groups.others.map(row)}
          </>
        ) : (
          <div style={{ paddingTop: 8 }}>{library.map(row)}</div>
        )}
      </div>
    </>
  );
}
