'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslate } from '@/i18n';
import {
  FA_ICONS,
  buildIconClass,
  getFullFaCatalog,
  loadAllFaIcons,
  searchFullCatalog,
  type FaIconEntry,
  type FaIconKind,
} from '@/lib/font-awesome-icons';

/**
 * The Font Awesome catalog grid, shared by the Icon module's picker and the
 * two-tab `IconField`. Kept in one place so the catalog fetch, the
 * style-filter subtleties and the tile look can't drift apart between them.
 */

export type FaKindFilter = 'all' | 'solid' | 'regular' | 'brands';

export const FA_KIND_FILTERS: ReadonlyArray<{ value: FaKindFilter; labelKey: string }> = [
  { value: 'all', labelKey: 'iconPicker.kindAll' },
  { value: 'solid', labelKey: 'iconPicker.styleSolid' },
  { value: 'regular', labelKey: 'iconPicker.styleRegular' },
  { value: 'brands', labelKey: 'iconPicker.styleBrands' },
];

/** Past this many hits, render only the first chunk to keep the grid snappy. */
export const FA_VISIBLE_LIMIT = 600;

/**
 * Fetches the full ~2000-icon manifest once and swaps it in. Initializes from
 * the module-level cache so reopening the picker doesn't flash "loading" after
 * the first fetch.
 */
export function useFaCatalog(): { catalog: readonly FaIconEntry[]; loading: boolean } {
  const initial = getFullFaCatalog();
  const [catalog, setCatalog] = useState<readonly FaIconEntry[]>(initial);
  const [loading, setLoading] = useState(initial === FA_ICONS);

  useEffect(() => {
    let cancelled = false;
    loadAllFaIcons().then((full) => {
      if (cancelled) return;
      setCatalog(full);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { catalog, loading };
}

/**
 * Search + style filter over the catalog.
 *
 * The kind predicate matches the icon's full `styles[]` array rather than
 * `kind`, because the postinstall script tags every dual-style icon with
 * `kind='solid'` (priority: brands > solid > regular) — filtering on
 * `kind === 'regular'` would miss the ~170 icons that ship in the regular
 * woff2. Curated entries not yet merged with the manifest may have no
 * `styles` array, so this falls back to `[kind]` during the pre-fetch window.
 */
export function useFilteredFaIcons(
  query: string,
  catalog: readonly FaIconEntry[],
  kindFilter: FaKindFilter,
): readonly FaIconEntry[] {
  return useMemo(() => {
    const matchesKind = (i: FaIconEntry) => {
      if (kindFilter === 'all') return true;
      const styles = i.styles ?? [i.kind];
      return styles.includes(kindFilter);
    };
    const trimmed = query.trim();
    // No search: curated "Popular" first, so the empty-state grid isn't
    // dominated by digits and A-words from the alphabetical full catalog.
    if (!trimmed) {
      const curated = new Set(FA_ICONS.map((i) => i.name));
      return [
        ...FA_ICONS.filter(matchesKind),
        ...catalog.filter((i) => !curated.has(i.name) && matchesKind(i)),
      ];
    }
    return searchFullCatalog(trimmed, catalog).filter(matchesKind);
  }, [query, catalog, kindFilter]);
}

interface FaKindFilterBarProps {
  value: FaKindFilter;
  onChange: (v: FaKindFilter) => void;
  count: number;
  loading: boolean;
}

export function FaKindFilterBar({ value, onChange, count, loading }: FaKindFilterBarProps) {
  const t = useTranslate('editor');
  return (
    <div className="flex items-center gap-2">
      {FA_KIND_FILTERS.map((f) => (
        <button
          key={f.value}
          type="button"
          onClick={() => onChange(f.value)}
          className={`px-2.5 py-1 text-[11px] rounded border transition-colors ${
            value === f.value
              ? 'border-hs-accent bg-hs-accent/10 text-hs-text-body'
              : 'border-hs-border-strong text-hs-text-muted hover:text-hs-text-body'
          }`}
        >
          {t(f.labelKey)}
        </button>
      ))}
      <span className="text-[11px] text-hs-text-faint ml-auto">
        {loading ? t('iconPicker.loadingCatalog') : t('iconPicker.iconCount', { count })}
      </span>
    </div>
  );
}

interface FaIconGridProps {
  icons: readonly FaIconEntry[];
  selectedName: string;
  catalog: readonly FaIconEntry[];
  onPick: (name: string, kind: FaIconKind, styles: readonly FaIconKind[]) => void;
}

export function FaIconGrid({ icons, selectedName, catalog, onPick }: FaIconGridProps) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))' }}>
      {icons.map((icon) => {
        const isSelected = icon.name === selectedName;
        return (
          <button
            key={`${icon.kind}:${icon.name}`}
            type="button"
            onClick={() => {
              // Prefer the manifest-merged entry over the curated one at click
              // time — curated icons sometimes carry only `kind`, not the full
              // `styles` array. The `[kind]` fallback keeps this correct even
              // before the manifest lands.
              const live = catalog.find((c) => c.name === icon.name) ?? icon;
              onPick(live.name, live.kind, live.styles ?? [live.kind]);
            }}
            title={icon.name}
            className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded border transition-colors ${
              isSelected
                ? 'border-hs-accent bg-hs-accent/10'
                : 'border-transparent hover:border-hs-border-strong hover:bg-hs-card'
            }`}
          >
            <i className={buildIconClass(icon.name, icon.kind)} style={{ fontSize: '22px' }} aria-hidden="true" />
            <span className="text-[10px] text-hs-text-faint truncate w-full text-center leading-tight">
              {icon.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The scrollable results area shared by both pickers: the grid plus the
 * "refine your search" tail when the result set is over the render cap.
 */
export function FaIconResults({
  filtered,
  selectedName,
  catalog,
  query,
  onPick,
}: {
  filtered: readonly FaIconEntry[];
  selectedName: string;
  catalog: readonly FaIconEntry[];
  query: string;
  onPick: (name: string, kind: FaIconKind, styles: readonly FaIconKind[]) => void;
}) {
  const t = useTranslate('editor');
  if (filtered.length === 0) {
    return <p className="text-center text-xs text-hs-text-faint py-12">{t('iconPicker.noMatch', { query })}</p>;
  }
  const visible = filtered.slice(0, FA_VISIBLE_LIMIT);
  const truncated = filtered.length - visible.length;
  return (
    <>
      <FaIconGrid icons={visible} selectedName={selectedName} catalog={catalog} onPick={onPick} />
      {truncated > 0 && (
        <p className="text-center text-[11px] text-hs-text-faint mt-3">
          {t('iconPicker.moreResults', { count: truncated })}
        </p>
      )}
    </>
  );
}
