'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { MealPlannerConfig } from '@/types/config';
import { DIVIDER, TEXT_OPACITY, hasAccentColor, ink } from '@/lib/constants';
import type { WallGroceryGroup, WallGroceryItem } from '@/lib/grocery-wall';
import { useTranslate } from '@/i18n';
import { usePagedRotation } from '@/hooks/usePagedRotation';
import FamilyEmptyState from '../FamilyEmptyState';
import { TapCheckbox, TAP_CHECKBOX_ACCENT } from '../shared/TapCheckbox';
import { usePagedFit } from '../shared/usePagedFit';
import type { WallGrocery } from '../shared/useWallGrocery';

/** Pages of a long list turn this often. */
export const GROCERY_PAGE_MS = 15_000;
/** After a tick the page holds still this long, so the next tick is on the same page. */
export const GROCERY_TICK_PAUSE_MS = 60_000;

interface GroceryViewProps {
  config: MealPlannerConfig;
  grocery: WallGrocery;
  /** Tick boxes: a real display with taps switched on. */
  tappable: boolean;
}

/** The heading a group starts with, or null for Mealie's unlabelled items and a one-aisle list. */
export function useGroceryHeading(): (group: WallGroceryGroup) => string | null {
  const tCore = useTranslate('core');
  return (group) => group.label ?? (group.aisle ? tCore(`meal.grocery.categoryLabels.${group.aisle}`) : null);
}

/**
 * The family's grocery list on a card: only what is still to get, in the
 * list's own order, pages turning on their own when it does not fit. On a
 * touch screen each row ticks the item off where the phone would.
 */
export function GroceryView({ config, grocery, tappable }: GroceryViewProps) {
  const t = useTranslate('modules');
  const heading = useGroceryHeading();
  const accent = hasAccentColor(config.accentColor) ? config.accentColor : TAP_CHECKBOX_ACCENT;
  const { rows, listName } = grocery;

  // One row per item; the first item of a group carries the group's heading,
  // so a heading never ends a page without its items.
  const flat: { item: WallGroceryItem; heading: string | null }[] = [];
  for (const group of rows.groups) {
    group.items.forEach((item, i) => flat.push({ item, heading: i === 0 ? heading(group) : null }));
  }
  const measureKey = flat.map(({ item, heading: h }) => `${item.id}|${item.text}|${item.note ?? ''}|${item.amount ?? ''}|${h ?? ''}`).join('\u0001') + `|${tappable}`;
  const { ref, pages } = usePagedFit('[data-grocery-row]', measureKey);
  const pageCount = pages?.length ?? 1;

  const [lastTick, setLastTick] = useState(0);
  const pausedNow = lastTick > 0;
  useEffect(() => {
    if (!lastTick) return;
    const timer = setTimeout(() => setLastTick(0), GROCERY_TICK_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [lastTick]);
  const { index } = usePagedRotation(pageCount, pausedNow ? GROCERY_TICK_PAUSE_MS : GROCERY_PAGE_MS);
  const visible = pages ? new Set(pages[index] ?? []) : null;

  if (grocery.state !== 'ready' || flat.length === 0) {
    return <GroceryEmpty grocery={grocery} />;
  }

  const title = listName ?? t('meal-planner.grocery.thisWeek');
  return (
    <div data-testid="meal-grocery" className="flex flex-col h-full min-h-0">
      <div className="flex items-baseline justify-between gap-2 shrink-0">
        <span className="font-semibold truncate" style={{ fontSize: '0.98em' }}>{title}</span>
        <span
          data-testid="meal-grocery-left"
          className="rounded-full font-semibold tabular-nums whitespace-nowrap shrink-0"
          style={{ fontSize: '0.66em', padding: '0.1em 0.6em', background: `${accent}33`, color: ink(0.9) }}
        >
          {t('meal-planner.grocery.toGet', { count: rows.left })}
        </span>
      </div>
      <div ref={ref} data-grocery-pages={pages?.length ?? 0} className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ marginTop: '0.2em' }}>
        {flat.map(({ item, heading: h }, i) => (
          <div key={item.id} data-grocery-row style={{ display: visible !== null && !visible.has(i) ? 'none' : undefined }}>
            {h && (
              <div style={{ fontSize: '0.56em', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: ink(TEXT_OPACITY.dim), margin: '0.75em 0 0.15em' }}>
                {h}
              </div>
            )}
            <GroceryRow
              item={item}
              accent={accent}
              tappable={tappable}
              pressed={grocery.pressed === item.id}
              onTick={() => { setLastTick(Date.now()); grocery.tick(item); }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between shrink-0 tabular-nums" style={{ fontSize: '0.6em', color: ink(TEXT_OPACITY.dim), paddingTop: '0.5em' }}>
        <span>{rows.got > 0 ? t('meal-planner.grocery.got', { count: rows.got }) : ''}</span>
        {pageCount > 1 && <span data-testid="meal-grocery-page">{t('meal-planner.grocery.page', { page: index + 1, pages: pageCount })}</span>}
      </div>
    </div>
  );
}

function GroceryRow({ item, accent, tappable, pressed, onTick }: {
  item: WallGroceryItem;
  accent: string;
  tappable: boolean;
  pressed: boolean;
  onTick: () => void;
}) {
  const t = useTranslate('modules');
  const words: ReactNode = (
    <>
      <span
        className="flex-1 min-w-0 truncate"
        style={{ textDecoration: item.checked ? 'line-through' : undefined, textDecorationColor: item.checked ? accent : undefined }}
      >
        {item.text}
        {item.note && <span style={{ color: ink(TEXT_OPACITY.dim), fontSize: '0.88em' }}> &middot; {item.note}</span>}
      </span>
      {item.amount && <span className="whitespace-nowrap shrink-0" style={{ color: ink(TEXT_OPACITY.secondary), fontSize: '0.9em', paddingLeft: '0.6em' }}>{item.amount}</span>}
    </>
  );
  const style = {
    display: 'flex', alignItems: 'center', gap: '0.6em', minHeight: tappable ? 46 : '2.4em', width: '100%',
    borderBottom: `1px solid ${DIVIDER.default}`, fontSize: '0.84em', opacity: item.checked ? 0.5 : 1,
  } as const;
  if (!tappable) return <div data-testid="meal-grocery-item" style={style}>{words}</div>;
  return (
    <button
      type="button"
      data-testid="meal-grocery-item"
      role="checkbox"
      aria-checked={item.checked}
      aria-label={t('meal-planner.grocery.tickAria', { item: item.text })}
      onClick={onTick}
      className="text-left cursor-pointer select-none"
      // `font` first: a shorthand after the row's size would reset it.
      style={{ font: 'inherit', background: 'none', border: 0, padding: 0, color: 'inherit', touchAction: 'pan-y', ...style }}
    >
      <TapCheckbox checked={item.checked} pressed={pressed} color={accent} size={30} />
      {words}
    </button>
  );
}

/** Loading, Mealie out of reach, no list, or nothing left to get. */
export function GroceryEmpty({ grocery, fontSize }: { grocery: WallGrocery; fontSize?: number }) {
  const t = useTranslate('modules');
  if (grocery.state === 'loading') {
    return <FamilyEmptyState icon={<>&#129530;</>} title={t('meal-planner.loading')} hint="" fontSize={fontSize} />;
  }
  if (grocery.state === 'failed') {
    return <FamilyEmptyState icon={<>&#129530;</>} title={t('meal-planner.mealieUnreachable')} hint={t('meal-planner.mealieUnreachableHint')} fontSize={fontSize} />;
  }
  if (grocery.noMealieList) {
    return <FamilyEmptyState icon={<>&#129530;</>} title={t('meal-planner.grocery.noMealieList')} hint={t('meal-planner.grocery.noMealieListHint')} fontSize={fontSize} />;
  }
  const done = grocery.rows.got > 0;
  if (grocery.listName) {
    return (
      <FamilyEmptyState
        icon={done ? <>&#10003;</> : <>&#129530;</>}
        title={t(done ? 'meal-planner.grocery.mealieDone' : 'meal-planner.grocery.mealieEmpty', { list: grocery.listName })}
        hint={t('meal-planner.grocery.mealieEmptyHint')}
        fontSize={fontSize}
      />
    );
  }
  return (
    <FamilyEmptyState
      icon={done ? <>&#10003;</> : <>&#129530;</>}
      title={t(done ? 'meal-planner.grocery.localDone' : 'meal-planner.grocery.localEmpty')}
      hint={t(done ? 'meal-planner.grocery.localDoneHint' : 'meal-planner.grocery.localEmptyHint')}
      fontSize={fontSize}
    />
  );
}
