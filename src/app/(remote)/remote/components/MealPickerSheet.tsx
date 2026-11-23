'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Check, ChevronRight, CloudOff, Pencil, Search, UtensilsCrossed } from 'lucide-react';
import type { SavedMeal } from '@/types/config';
import { DEFAULT_MEAL_EMOJI, LIBRARY_FILTERS, getMealSlotLabelKey, type LibraryFilter } from '@/lib/meal-constants';
import type { MealPickTarget } from '@/lib/meal-courses';
import {
  filterLibraryMeals,
  mealShownMinutes,
  mealTagLabel,
  pickerEnterChoice,
  pickerMealGroups,
} from '@/lib/meal-dish-rules';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import { useMealieRecipeBrowser } from '@/components/meals/useMealieRecipeBrowser';
import Glyph from '@/components/ui/Glyph';
import { useMealieRecipeCount } from '../hooks/useMealieRecipeCount';
import MealThumb from './MealThumb';
import TallSheet from './TallSheet';
import { mealieSearchFailedWords } from './MealsMealieStatus';
import { RecipeSearchBox, RecipeShortcutChips, RecipeSkeletonRows } from './MealieRecipeParts';
import { RetryButton } from './RetryButton';
import EmptyState from './EmptyState';
import ChipButton from './ChipButton';
import { formatShownMinutes } from './meals-shared';
import { REMOTE_ACCENT, REMOTE_ACCENT_INK, SECTION_HEADING } from './remote-styles';
import { withAlpha } from '@/lib/hex-color';
import { mealiePlaces } from '@/components/meals/mealie-places';

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
  const title = useTitle(target);

  return (
    <TallSheet
      label={title}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      // Over the meal sheet when opened from its Change and Add buttons.
      layer="sheetOverSheet"
      testId="meal-picker"
      // Mealie's list fills in as it answers, and the family's meals narrow
      // as words are typed: a fixed height keeps the sheet (and the box
      // under the finger) from jumping while they do.
      size={fromMealie || library.length > 0 ? { height: '85vh' } : { maxHeight: '60vh' }}
      // The tap that picks a dish closes the picker: a second tap of a
      // double tap must not land on the meal sheet under it ("Change the drink").
      guardTaps
    >
      {fromMealie ? <MealieBody {...props} /> : <LocalBody {...props} />}
    </TallSheet>
  );
}

/** An empty or failed search inside the sheet, which has less room than a tab. */
const SHEET_EMPTY = { padding: '56px 8px 0' };

function Tick() {
  return <Check size={16} strokeWidth={3} aria-hidden="true" style={{ color: REMOTE_ACCENT_INK, flex: 'none' }} />;
}

/** Mealie's recipes, searched live through the hub. */
function MealieBody({ target, chosenIds, onPickMeal, onPickText }: MealPickerSheetProps) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  // Starts on the shortcuts, not on a search for the note the slot holds;
  // "Add a side" opens on the household's own Side category when it has one.
  const { query, setQuery, shortcut, choose, courseCategory, cookbooks, search } = useMealieRecipeBrowser(editorFetch, {
    courseKind: target.pick === 'main' ? null : target.kind,
  });
  const typed = query.trim();
  const count = useMealieRecipeCount(true, search.recovered);
  const listRef = useRef<HTMLDivElement>(null);
  const failed = mealieSearchFailedWords(search.problem);

  // A new search starts at the top of its list.
  const shown = shortcut.kind === 'category' || shortcut.kind === 'cookbook' ? `${shortcut.kind}:${shortcut.slug}` : shortcut.kind;
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [typed, shown]);

  const nothingFound = !search.loading && !search.error && search.items.length === 0;
  let heading: string | null = null;
  if (!search.loading && !search.error && search.items.length > 0) {
    if (shortcut.kind === 'search') heading = t('mealie.search.recipeCount', { count: search.total });
    else if (shortcut.kind === 'cookbook' || shortcut.kind === 'category') heading = tCore('mealie.search.categoryCount', { count: search.total, category: shortcut.name ?? '' });
    else if (shortcut.kind === 'favorites') heading = t('mealie.search.favoritesCount', { count: search.total });
    else heading = t('mealie.search.recentHeading');
  }

  let empty: ReactNode = null;
  if (nothingFound) {
    empty = shortcut.kind === 'search' ? (
      <EmptyState icon={Search} title={t('mealie.search.noneTitle', { query: typed })} body={tCore('mealie.search.noneDescription')} style={SHEET_EMPTY} />
    ) : shortcut.kind === 'cookbook' || shortcut.kind === 'category' ? (
      <EmptyState icon={Search} title={t('mealie.search.noneInCategoryTitle', { category: shortcut.name ?? '' })} body={t('mealie.search.noneInCategoryDescription')} style={SHEET_EMPTY} />
    ) : shortcut.kind === 'favorites' ? (
      <EmptyState icon={Search} title={t('mealie.search.noFavoritesTitle')} body={t('mealie.search.noFavoritesDescription')} style={SHEET_EMPTY} />
    ) : (
      <EmptyState icon={Search} title={t('mealie.search.noRecentTitle')} body={t('mealie.search.noRecentDescription')} style={SHEET_EMPTY} />
    );
  }

  return (
    <>
      <div style={{ padding: '12px 16px 0', flex: 'none' }}>
        <RecipeSearchBox
          value={query}
          onChange={setQuery}
          placeholder={count ? t('mealie.search.placeholderCount', { count }) : tCore('mealie.search.placeholder')}
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
          filter={shortcut.kind === 'favorites' || shortcut.kind === 'recent' ? shortcut.kind : 'all'}
          searching={!!typed}
          onFilter={choose}
        >
          {courseCategory && (
            <ChipButton
              selected={shortcut.kind === 'category' && shortcut.slug === courseCategory.slug}
              onClick={() => choose({ category: courseCategory.slug })}
            >
              {courseCategory.name}
            </ChipButton>
          )}
          {cookbooks.map((c) => (
            <ChipButton
              key={c.slug}
              selected={shortcut.kind === 'cookbook' && shortcut.slug === c.slug}
              onClick={() => choose({ cookbook: c.slug })}
              icon={<BookOpen size={13} strokeWidth={2} aria-hidden />}
            >
              {c.name}
            </ChipButton>
          ))}
        </RecipeShortcutChips>
        {heading && <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', padding: '10px 0 2px' }}>{heading}</div>}
        {search.loading ? (
          <RecipeSkeletonRows />
        ) : search.error ? (
          <EmptyState icon={CloudOff} title={tCore(failed.title)} body={t(failed.description, mealiePlaces(tCore))} action={<RetryButton onRetry={search.retry} />} style={SHEET_EMPTY} />
        ) : (
          empty ?? search.items.map((meal) => {
            const chosen = chosenIds.has(meal.id);
            const shown = mealShownMinutes(meal);
            const tag = meal.tags?.[0];
            const meta = [shown ? formatShownMinutes(shown, t) : null, tag ? mealTagLabel(meal, tag, tCore) : null].filter(Boolean).join(' · ');
            return (
              <button
                key={meal.id}
                type="button"
                onClick={() => onPickMeal(meal)}
                aria-pressed={chosen}
                className="press-scale"
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
                      fontSize: 15, fontWeight: 600, lineHeight: '20px', color: chosen ? REMOTE_ACCENT_INK : 'var(--hs-text-primary)',
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
          note={tCore('mealie.search.typeInsteadNote')}
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
        className="press-scale"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', minHeight: 56,
          borderRadius: 12, border: `1px dashed ${lit ? REMOTE_ACCENT_INK : 'var(--hs-border-strong)'}`,
          background: lit ? withAlpha(REMOTE_ACCENT, 0.08) : 'transparent',
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
  // What Enter takes, whatever chip is on: the saved meal the words name,
  // or the words typed in when they match nothing saved, which is the only
  // time typing them in is the way forward.
  const enterChoice = useMemo(() => pickerEnterChoice(library, typed), [library, typed]);
  const inLibrary = !!typed && !(enterChoice && 'text' in enterChoice);
  // The main dish leads with the meals tagged for this meal of the day, a
  // course with the meals saved as its kind.
  const groups = pickerMealGroups(found, target);
  const groupTitle = target.pick === 'main' ? tModules(getMealSlotLabelKey(target.slot)) : t(`mealPicker.savedAs.${target.kind}`);
  const listRef = useRef<HTMLDivElement>(null);

  // A new search starts at the top of its list.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [typed, filter]);

  // With only partial matches Enter puts the keyboard away, so the list and
  // the row under it are in view.
  const enter = (input: HTMLInputElement) => {
    if (!enterChoice) {
      if (typed) input.blur();
    } else if ('meal' in enterChoice) onPickMeal(enterChoice.meal);
    else onPickText(enterChoice.text);
  };

  const row = (meal: SavedMeal) => {
    const chosen = chosenIds.has(meal.id);
    const shown = mealShownMinutes(meal);
    return (
      <button
        key={meal.id}
        type="button"
        onClick={() => onPickMeal(meal)}
        aria-pressed={chosen}
        className="press-scale"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', border: 'none',
          borderBottom: '1px solid var(--hs-border)', background: 'transparent', cursor: 'pointer',
          textAlign: 'left' as const, color: 'inherit', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 24 }}><Glyph value={meal.emoji ?? DEFAULT_MEAL_EMOJI} fallback={DEFAULT_MEAL_EMOJI} /></span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: chosen ? REMOTE_ACCENT_INK : 'var(--hs-text-primary)' }}>
          {meal.name}
        </span>
        {chosen && <Tick />}
        {shown && <span style={{ fontSize: 11, color: 'var(--hs-text-faint)' }}>{formatShownMinutes(shown, t)}</span>}
      </button>
    );
  };
  const groupHeading = (text: string) => (
    <div style={{ ...SECTION_HEADING, margin: 0, padding: '12px 0 2px' }}>
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
          <EmptyState
            icon={UtensilsCrossed}
            title={t('mealsPlan.picker.emptyLibraryTitle')}
            body={t('mealsPlan.picker.emptyLibrary')}
            style={{ padding: '24px 8px 8px' }}
            action={(
              <button
                type="button"
                onClick={() => { onClose(); onOpenLibrary(); }}
                className="press-btn"
                style={{
                  padding: '10px 20px', minHeight: 44, borderRadius: 10, border: '1px solid var(--hs-border)',
                  background: 'var(--hs-bg-panel)', color: 'var(--hs-text-body)', fontSize: 13, fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                {t('mealsPlan.empty.addMealsButton')}
              </button>
            )}
          />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', padding: '6px 0 0' }}>
              {LIBRARY_FILTERS.map((f) => (
                <ChipButton key={f} selected={filter === f} onClick={() => setFilter(f)}>
                  {t(`mealsTab.library.filters.${f}`)}
                </ChipButton>
              ))}
            </div>
            {found.length === 0 ? (
              typed && !inLibrary ? (
                <EmptyState icon={Search} title={t('mealPicker.noneTitle', { query: typed })} body={t('mealPicker.noneDescription')} style={{ padding: '32px 8px 0' }} />
              ) : (
                <EmptyState icon={Search} title={t('mealsTab.library.empty.titleNoMatches')} body={t('mealsTab.library.empty.hintNoMatches')} style={{ padding: '32px 8px 0' }} />
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
