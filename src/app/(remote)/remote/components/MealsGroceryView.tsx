'use client';

import { useState, useCallback, useMemo } from 'react';
import { ChevronRight, ShoppingCart } from 'lucide-react';
import type { SavedMeal } from '@/types/config';
import type { TodoList, TodoListItem } from '@/types/todos';
import { groceryExtrasItems } from '@/lib/grocery-wall';
import { useTodoLists } from '../hooks/useTodoLists';
import { GROCERY_CATEGORY_ICONS, groceryListNeedsHeadings, shortNameList, type GroceryList } from '@/lib/grocery-utils';
import { groceryShareText } from '@/lib/shopping-list';
import { useLocale, useTranslate } from '@/i18n';
import type { ShownWeek } from '@/lib/meal-plan-words';
import { shareOrCopyText } from './share-text';
import TickRow from './TickRow';
import EmptyState from './EmptyState';

interface MealsGroceryViewProps {
  groceryList: GroceryList;
  groceryStats: { total: number; checked: number };
  /** Planned meals with no ingredients yet (`plannedMealsWithoutIngredients`) */
  withoutIngredients: SavedMeal[];
  toggleGroceryItem: (itemName: string) => Promise<void>;
  /** The week the list is for: "this week's meals" only while it is this week. */
  week: ShownWeek;
  /**
   * The family's list for the other things to buy, shown last ("Also on
   * Shopping"): its id and the week's first day. Only on this week's list,
   * and only while the plan is kept here.
   */
  extras?: { listId: string; since: string } | null;
  /** Show that list on the Lists tab. */
  onOpenList?: (listId: string) => void;
}

/** One line of the grocery list: a meal's ingredient, or something on the family's other list. */
function GroceryRow({ name, amount, checked, onToggle }: { name: string; amount?: string; checked: boolean; onToggle: () => void }) {
  return (
    <TickRow
      label={name}
      checked={checked}
      onToggle={onToggle}
      trailing={amount ? <span style={{ fontSize: 12, color: 'var(--hs-text-faint)', flexShrink: 0 }}>{amount}</span> : undefined}
    />
  );
}

/** The family's list for the other things to buy, as this week's grocery list shows it. */
interface ExtrasGroup {
  list: TodoList;
  /** What is still on it and what was ticked this week (`groceryExtrasItems`). */
  items: TodoListItem[];
  toggle: (itemId: string) => void;
}

/** The list for other things to buy, last on the grocery list ("Also on Shopping"), with a way to its own tab. */
function GroceryExtrasGroup({ group, onOpenList }: { group: ExtrasGroup; onOpenList?: (listId: string) => void }) {
  const t = useTranslate('remote');
  const { list, items, toggle } = group;
  const done = items.filter((it) => it.completed).length;
  return (
    <div data-grocery-extras style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        {list.color && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: list.color, flexShrink: 0 }} />}
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--hs-text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {t('mealsGrocery.alsoOn', { list: list.name })}
        </span>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'var(--hs-bg-panel)', color: 'var(--hs-text-faint)', fontWeight: 500 }}>
          {done}/{items.length}
        </span>
        {onOpenList && (
          <button
            type="button"
            onClick={() => onOpenList(list.id)}
            className="press-scale-sm"
            style={{ marginLeft: 'auto', minHeight: 44, padding: '0 4px', border: 0, background: 'none', color: 'var(--hs-accent)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}
          >
            {t('mealsGrocery.openInLists')}
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {items.map((item) => (
        <GroceryRow key={item.id} name={item.text} checked={item.completed} onToggle={() => toggle(item.id)} />
      ))}
    </div>
  );
}

const KEEP_SELECTION = () => {};

/**
 * The week's grocery list on the phone. With a list picked for the other
 * things to buy, that list is read through the Lists tab's own hook (a tick
 * shows at once and the hub's answer settles it) and joins the list: its own
 * group at the end, the count at the top and what Share sends. Without one,
 * nothing reads the to-do lists at all.
 */
export default function MealsGroceryView(props: MealsGroceryViewProps) {
  return props.extras ? <GroceryWithExtras {...props} extras={props.extras} /> : <GroceryBody {...props} group={null} />;
}

function GroceryWithExtras(props: MealsGroceryViewProps & { extras: { listId: string; since: string } }) {
  const { listId, since } = props.extras;
  const { lists, toggleItem } = useTodoLists({ selectedListId: listId, onSelectList: KEEP_SELECTION });
  const list = lists.find((l) => l.id === listId) ?? null;
  const items = useMemo(() => (list ? groceryExtrasItems(list, since) : []), [list, since]);
  const group = list && items.length > 0 ? { list, items, toggle: (itemId: string) => toggleItem(listId, itemId) } : null;
  return <GroceryBody {...props} group={group} />;
}

function GroceryBody({
  groceryList,
  groceryStats: mealStats,
  withoutIngredients,
  toggleGroceryItem,
  week,
  onOpenList,
  group,
}: MealsGroceryViewProps & { group: ExtrasGroup | null }) {
  const t = useTranslate('remote');
  const locale = useLocale();
  const showHeadings = groceryListNeedsHeadings(groceryList);
  // Grocery category labels live in `core.meal.grocery.categoryLabels.*`
  // so /remote doesn't have to lazy-fetch the 113KB editor.json. Core is
  // already loaded by the remote layout.
  const tCore = useTranslate('core');

  // The other-things list counts and shares with the meals' ingredients, as on the wall.
  const groceryStats = group
    ? { total: mealStats.total + group.items.length, checked: mealStats.checked + group.items.filter((it) => it.completed).length }
    : mealStats;

  const buildShareText = useCallback((): string => groceryShareText(
    [
      ...[...groceryList].map(([catKey, { items }]) => ({
        // `t()` returns the raw key path on miss (and emits a once-per-key dev
        // warning), which is the right developer feedback for any future
        // GroceryCategory enum value added without a matching translation.
        label: tCore(`meal.grocery.categoryLabels.${catKey}`),
        items: items.filter((i) => !i.checked).map((i) => ({ text: i.name, detail: i.amount })),
      })),
      ...(group ? [{ label: group.list.name, items: group.items.filter((it) => !it.completed).map((it) => ({ text: it.text })) }] : []),
    ],
    { heading: t('mealsGrocery.shareHeading'), complete: t('mealsGrocery.shareCompleteMessage') },
  ), [groceryList, group, t, tCore]);

  const [shareLabel, setShareLabel] = useState<'idle' | 'copied'>('idle');

  const handleShare = useCallback(async () => {
    const outcome = await shareOrCopyText(buildShareText());
    if (outcome !== 'copied') return;
    setShareLabel('copied');
    setTimeout(() => setShareLabel('idle'), 2000);
  }, [buildShareText]);

  const itemsCountKey = groceryStats.total === 1
    ? 'mealsGrocery.itemsCountSingular'
    : 'mealsGrocery.itemsCountPlural';

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--hs-text-body)' }}>
            {t(itemsCountKey, { checked: groceryStats.checked, total: groceryStats.total })}
          </span>
          <button
            type="button"
            onClick={handleShare}
            className="press-btn"
            style={{
              padding: '6px 14px',
              minHeight: 44,
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: '1px solid var(--hs-border)',
              background: 'var(--hs-bg-panel)',
              color: shareLabel === 'copied' ? 'var(--hs-success)' : 'var(--hs-text-muted)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'color 0.15s',
            }}
          >
            {shareLabel === 'copied'
              ? tCore('status.copied')
              : t('mealsGrocery.shareButton')}
          </button>
        </div>
        <div style={{ height: 6, background: 'var(--hs-border)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
          <div
            style={{
              height: '100%',
              borderRadius: 3,
              width: groceryStats.total > 0 ? `${(groceryStats.checked / groceryStats.total) * 100}%` : '0%',
              backgroundColor: 'var(--hs-success)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--hs-text-faint)' }}>
          {week.thisWeek ? t('mealsGrocery.autoGeneratedHint') : t('mealsGrocery.autoGeneratedHintDates', { range: week.range })}
        </div>
        {withoutIngredients.length > 0 && (
          <p data-grocery-without-ingredients style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.4, color: 'var(--hs-text-muted)' }}>
            {t('mealsGrocery.withoutIngredients', {
              count: withoutIngredients.length,
              names: shortNameList(
                withoutIngredients.map((m) => m.name),
                locale,
                (count) => t('mealsGrocery.moreMeals', { count }),
              ),
            })}
          </p>
        )}
      </div>

      {groceryStats.total === 0 && (
        <EmptyState icon={ShoppingCart} title={t('mealsGrocery.empty.title')} body={t('mealsGrocery.empty.description')} style={{ paddingTop: 48 }} />
      )}

      {Array.from(groceryList.entries()).map(([catKey, { items }]) => {
        const catChecked = items.filter((i) => i.checked).length;
        const categoryLabel = tCore(`meal.grocery.categoryLabels.${catKey}`);
        return (
        <div key={catKey} style={{ marginBottom: 20 }}>
          {showHeadings && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            {GROCERY_CATEGORY_ICONS[catKey] && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--hs-text-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={GROCERY_CATEGORY_ICONS[catKey]} />
              </svg>
            )}
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--hs-text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {categoryLabel}
            </span>
            <span
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 8,
                background: 'var(--hs-bg-panel)',
                color: 'var(--hs-text-faint)',
                fontWeight: 500,
                marginLeft: 'auto',
              }}
            >
              {catChecked}/{items.length}
            </span>
          </div>
          )}

          {items.map((item) => (
            <GroceryRow key={item.name} name={item.name} amount={item.amount} checked={item.checked} onToggle={() => toggleGroceryItem(item.name)} />
          ))}
        </div>
        );
      })}

      {group && <GroceryExtrasGroup group={group} onOpenList={onOpenList} />}
    </div>
  );
}
