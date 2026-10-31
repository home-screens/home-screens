'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { GROCERY_CATEGORY_ICONS } from '@/lib/grocery-utils';
import { pageRecipeSteps } from '@/lib/meal-recipe';
import type { WallGroceryItem } from '@/lib/grocery-wall';
import { formatDayRange, useFormattingLocale, useTranslate } from '@/i18n';
import { fromISODate } from '@/lib/meal-constants';
import { useFontsReady } from '@/hooks/useFontsReady';
import { usePagedRotation } from '@/hooks/usePagedRotation';
import type { MealPlannerViewProps } from './meal-planner-utils';
import { px } from './meal-planner-utils';
import { TapCheckbox } from '../shared/TapCheckbox';
import type { WallGrocery } from '../shared/useWallGrocery';
import { GroceryEmpty, GROCERY_PAGE_MS, GROCERY_TICK_PAUSE_MS, useGroceryHeading } from '../meal-planner/GroceryView';

interface FullscreenGroceryViewProps extends MealPlannerViewProps {
  grocery: WallGrocery;
  /** Tick boxes: a real display with taps switched on. */
  tappable: boolean;
  /** The module's accent as a color the tick box can tint (not a CSS variable). */
  accent: string;
}

/** A long list's type steps down to this share of its size before it pages instead. */
export const GROCERY_MIN_SCALE = 0.7;

const SECTION_LABEL: CSSProperties = {
  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--fmp-text-3)',
};

interface Row {
  item: WallGroceryItem;
  /** The group's heading, carried by its first item so a heading never ends a column. */
  heading: string | null;
  icon?: string;
  count: number;
}

/**
 * Everything still to get, in two columns (three on a landscape wall), group
 * by group: the family's Mealie labels, or this week's aisles with their
 * icons. A list too long for the screen first steps its type down (to
 * `GROCERY_MIN_SCALE`), then turns pages of whole columns, so it never runs
 * off the bottom and never gets too small to read. Rows are measured from a
 * hidden column laid out like a visible one; the module's own fit loop is
 * left out of it (this view never overflows the stack).
 */
export default function GroceryView({ grocery, tappable, accent, s, headerFont, bodyFont, showTitle, landscape, pad }: FullscreenGroceryViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const heading = useGroceryHeading();
  const fontsReady = useFontsReady();
  const { rows: list, listName, week } = grocery;
  const cols = landscape ? 3 : 2;

  const rows = useMemo<Row[]>(() => list.groups.flatMap((g) => {
    const h = heading(g);
    const icon = g.aisle ? GROCERY_CATEGORY_ICONS[g.aisle] : undefined;
    return g.items.map((item, i) => ({ item, heading: i === 0 ? h : null, ...(i === 0 && icon ? { icon } : {}), count: g.items.length }));
  }), [list.groups, heading]);

  // ── Fit: step the type down, then page ──
  const areaRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  // The list area only mounts once there is a list (after "loading" or an
  // empty list), so this runs again when it appears.
  const shown = grocery.state === 'ready' && list.groups.length > 0;
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const read = () => setBox((prev) => (prev && prev.w === el.clientWidth && prev.h === el.clientHeight ? prev : { w: el.clientWidth, h: el.clientHeight }));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shown]);
  const contentKey = rows.map((r) => `${r.item.id}|${r.item.text}|${r.item.note ?? ''}|${r.item.amount ?? ''}|${r.heading ?? ''}`).join('\u0001');
  const fitKey = `${contentKey}|${box?.w}x${box?.h}|${s}|${cols}|${fontsReady}|${tappable}`;
  const [fit, setFit] = useState<{ key: string; scale: number; pages: number[][][] | null }>({ key: '', scale: 1, pages: null });
  const scale = fit.key === fitKey ? fit.scale : 1;
  const pages = fit.key === fitKey ? fit.pages : null;

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el || !box || rows.length === 0) return;
    if (fit.key === fitKey && fit.pages) return;
    if (fit.key !== fitKey) {
      setFit({ key: fitKey, scale: 1, pages: null });
      return;
    }
    const heights = Array.from(el.children).map((c) => (c as HTMLElement).offsetHeight);
    const columns = pageRecipeSteps(heights, box.h, box.h, 0);
    if (columns.length <= cols || fit.scale <= GROCERY_MIN_SCALE) {
      const grouped: number[][][] = [];
      for (let i = 0; i < columns.length; i += cols) grouped.push(columns.slice(i, i + cols));
      setFit({ key: fitKey, scale: fit.scale, pages: grouped });
      return;
    }
    // Too long for one page: aim straight at the size that would fit, then
    // creep down, since wrapping changes as the type shrinks.
    const total = heights.reduce((a, b) => a + b, 0);
    const aim = Math.min(fit.scale - 0.05, ((box.h * cols) / total) * fit.scale * 0.98);
    setFit({ key: fitKey, scale: Math.max(GROCERY_MIN_SCALE, Math.round(aim * 100) / 100), pages: null });
  }, [fit, fitKey, box, rows.length, cols]);

  const [lastTick, setLastTick] = useState(0);
  useEffect(() => {
    if (!lastTick) return;
    const timer = setTimeout(() => setLastTick(0), GROCERY_TICK_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [lastTick]);
  const pageCount = pages?.length ?? 1;
  const { index } = usePagedRotation(pageCount, lastTick ? GROCERY_TICK_PAUSE_MS : GROCERY_PAGE_MS);

  const P = (n: number) => px(s, n);
  const R = (n: number) => px(s, n) * scale;

  if (grocery.state !== 'ready' || rows.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: pad, fontFamily: bodyFont, color: 'var(--fmp-text)' }}>
        <GroceryEmpty grocery={grocery} fontSize={P(40)} />
      </div>
    );
  }

  const title = listName ?? t('meal-planner.grocery.thisWeek');
  const sub = [
    ...(week && !listName ? [formatDayRange(fromISODate(week.start), fromISODate(week.end), locale)] : []),
    t('meal-planner.grocery.toGet', { count: list.left }),
    ...(list.got > 0 ? [t('meal-planner.grocery.got', { count: list.got })] : []),
  ].join(' · ');

  const rowView = (r: Row, measuring: boolean) => {
    const { item } = r;
    const words = (
      <>
        <span style={{ color: 'var(--fmp-text)', textDecoration: item.checked ? 'line-through' : undefined, minWidth: 0 }}>
          {item.text}
          {item.note && <span style={{ color: 'var(--fmp-text-3)', fontSize: '0.85em' }}> &middot; {item.note}</span>}
        </span>
        {item.amount && <span style={{ color: 'var(--fmp-text-3)', marginLeft: 'auto', paddingLeft: R(12), whiteSpace: 'nowrap' }}>{item.amount}</span>}
      </>
    );
    const line: CSSProperties = {
      display: 'flex', alignItems: 'center', gap: R(18), minHeight: R(54), width: '100%',
      borderBottom: '1px solid var(--fmp-border-sub)', fontSize: R(27), lineHeight: 1.2, opacity: item.checked ? 0.45 : 1,
    };
    const head = r.heading && (
      <div style={{ display: 'flex', alignItems: 'center', gap: R(12), margin: `${R(20)}px 0 ${R(6)}px` }}>
        {r.icon && (
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--fmp-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: R(30), height: R(30), flexShrink: 0 }} aria-hidden="true">
            <path d={r.icon} />
          </svg>
        )}
        <span style={{ ...SECTION_LABEL, fontSize: R(22) }}>{r.heading}</span>
        <span style={{ fontSize: R(22), color: 'var(--fmp-text-3)', marginLeft: 'auto' }}>{r.count}</span>
      </div>
    );
    const body = !tappable || measuring
      ? (
        <div data-testid={measuring ? undefined : 'fmp-grocery-item'} style={line}>
          {tappable && <TapCheckbox checked={item.checked} color={accent} size={Math.round(R(38))} />}
          {words}
        </div>
      )
      : (
        <button
          type="button"
          data-testid="fmp-grocery-item"
          role="checkbox"
          aria-checked={item.checked}
          aria-label={t('meal-planner.grocery.tickAria', { item: item.text })}
          onClick={() => { setLastTick(Date.now()); grocery.tick(item); }}
          // `font` first: a shorthand after the row's size would reset it.
          style={{ font: 'inherit', background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', cursor: 'pointer', touchAction: 'pan-y', ...line }}
        >
          <TapCheckbox checked={item.checked} pressed={grocery.pressed === item.id} color={accent} size={Math.round(R(38))} />
          {words}
        </button>
      );
    return <div key={item.id}>{head}{body}</div>;
  };

  const page = pages?.[Math.min(index, pageCount - 1)] ?? null;

  return (
    <div
      data-testid="fmp-grocery"
      data-grocery-pages={pageCount}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
        padding: `${P(56)}px ${P(56)}px ${P(52)}px`, fontFamily: bodyFont,
        // The tick boxes draw in the module's ink; on a light theme that has to be the theme's text, not white.
        '--module-ink': 'var(--fmp-text)',
      } as CSSProperties}
    >
      <div style={{ marginBottom: P(14), flexShrink: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: P(20) }}>
        <div style={{ minWidth: 0 }}>
          {showTitle && <div style={{ fontFamily: headerFont, fontSize: P(64), lineHeight: 1, color: 'var(--fmp-text)' }}>{title}</div>}
          <div data-testid="fmp-grocery-counts" style={{ fontSize: P(27), color: 'var(--fmp-text-3)', marginTop: showTitle ? P(12) : 0 }}>{sub}</div>
        </div>
        {pageCount > 1 && (
          <span data-testid="fmp-grocery-page" style={{ fontSize: P(27), color: 'var(--fmp-text-3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {t('meal-planner.grocery.page', { page: index + 1, pages: pageCount })}
          </span>
        )}
      </div>
      <div ref={areaRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: P(44), height: '100%', visibility: page ? undefined : 'hidden' }}>
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              {(page?.[c] ?? []).map((i) => rowView(rows[i], false))}
            </div>
          ))}
        </div>
        {/* One column of every row, for the heights the pages are cut from. */}
        <div
          ref={measureRef}
          aria-hidden="true"
          inert
          style={{
            position: 'absolute', top: 0, left: 0, width: `calc((100% - ${P(44) * (cols - 1)}px) / ${cols})`,
            visibility: 'hidden', pointerEvents: 'none', display: 'flex', flexDirection: 'column',
          }}
        >
          {rows.map((r) => rowView(r, true))}
        </div>
      </div>
    </div>
  );
}
