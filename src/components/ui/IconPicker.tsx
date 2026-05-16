'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useFocusTrap } from '@/hooks/useFocusTrap';
import LabeledField from './LabeledField';
import { INPUT_CLASS } from './input-classes';

interface IconPickerProps {
  label?: string;
  value: string;
  /** Current style — used so the trigger button preview matches the live module. */
  currentKind: FaIconKind;
  /**
   * Called when an icon is selected. The parent receives both the icon's
   * primary `kind` (used to auto-select a working style) and the full
   * `styles` array so it can preserve the user's current style only if
   * the picked icon actually supports it.
   */
  onPick: (name: string, kind: FaIconKind, styles: readonly FaIconKind[]) => void;
}

type KindFilter = 'all' | 'solid' | 'regular' | 'brands';

const KIND_FILTERS: ReadonlyArray<{ value: KindFilter; labelKey: string }> = [
  { value: 'all', labelKey: 'iconPicker.kindAll' },
  { value: 'solid', labelKey: 'iconPicker.styleSolid' },
  { value: 'regular', labelKey: 'iconPicker.styleRegular' },
  { value: 'brands', labelKey: 'iconPicker.styleBrands' },
];

/** When the search returns more than this many icons, only render the first chunk to keep the picker snappy. */
const VISIBLE_LIMIT = 600;

export default function IconPicker({ label, value, currentKind, onPick }: IconPickerProps) {
  const t = useTranslate('editor');
  const resolvedLabel = label ?? t('iconPicker.label');
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const handlePick = useCallback(
    (name: string, kind: FaIconKind, styles: readonly FaIconKind[]) => {
      onPick(name, kind, styles);
      setOpen(false);
    },
    [onPick],
  );

  // Use the same class-builder as IconModule so what the user previews on the
  // trigger is exactly what renders on the display. `currentKind` is the
  // user's configured style; that's what they'd want to see in the chip.
  const previewClass = value ? buildIconClass(value, currentKind) : '';

  return (
    <>
      <LabeledField label={resolvedLabel}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`${INPUT_CLASS} flex items-center gap-2 text-left hover:border-hs-accent transition-colors`}
        >
          <span
            className="inline-flex items-center justify-center w-6 h-6 rounded bg-hs-card border border-hs-border-strong text-hs-text-body shrink-0"
            aria-hidden="true"
          >
            {previewClass
              ? <i className={previewClass} style={{ fontSize: '14px' }} />
              : <span className="text-hs-text-faint text-xs">?</span>}
          </span>
          <span className="truncate text-xs text-hs-text-body flex-1">
            {value || t('iconPicker.chooseIconPlaceholder')}
          </span>
          <span className="text-[10px] text-hs-text-faint shrink-0">{t('iconPicker.browse')}</span>
        </button>
      </LabeledField>

      {open && (
        <IconPickerModal
          selectedName={value}
          onClose={close}
          onPick={handlePick}
        />
      )}
    </>
  );
}

interface IconPickerModalProps {
  selectedName: string;
  onClose: () => void;
  onPick: (name: string, kind: FaIconKind, styles: readonly FaIconKind[]) => void;
}

function IconPickerModal({ selectedName, onClose, onPick }: IconPickerModalProps) {
  const t = useTranslate('editor');
  const trapRef = useFocusTrap<HTMLDivElement>();
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  // Initialize from cached catalog if available — avoids a one-frame "loading"
  // flicker on subsequent opens after the manifest has already been fetched.
  const initialCatalog = getFullFaCatalog();
  const [catalog, setCatalog] = useState<readonly FaIconEntry[]>(initialCatalog);
  const [loading, setLoading] = useState(initialCatalog === FA_ICONS);

  // Kick off the full-catalog fetch on first mount; swap in when ready.
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

  // Autofocus the search input once on mount. Stable empty deps so we don't
  // refocus while the user types when the parent re-renders.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Escape-to-close. `onClose` is the parent's stable `useCallback` handle,
  // so this listener is bound once and not churned on parent renders.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    // The kind-filter predicate matches against the icon's full `styles[]`
    // array — not just `kind`. The postinstall script tags every dual-style
    // icon with `kind='solid'` (priority order: brands > solid > regular),
    // so filtering by `i.kind === 'regular'` would always be empty even
    // though ~170 icons ship in the regular woff2. Checking `styles` lets
    // those icons show up under the "Regular" pill.
    //
    // Curated entries that haven't been merged with the manifest yet may
    // lack a `styles` array — fall back to `[i.kind]` so they still match
    // the user's filter during the brief pre-fetch window.
    const matchesKind = (i: FaIconEntry) => {
      if (kindFilter === 'all') return true;
      const styles = i.styles ?? [i.kind];
      return styles.includes(kindFilter);
    };
    const trimmed = query.trim();
    // No search: show curated "Popular" first so users see hand-picked icons
    // before the alphabetical full-catalog tail. Without this, the empty-state
    // grid is dominated by digits and A-words from the alphabetical sort.
    if (!trimmed) {
      const curatedNames = new Set(FA_ICONS.map((i) => i.name));
      return [
        ...FA_ICONS.filter(matchesKind),
        ...catalog.filter((i) => !curatedNames.has(i.name) && matchesKind(i)),
      ];
    }
    return searchFullCatalog(trimmed, catalog).filter(matchesKind);
  }, [query, catalog, kindFilter]);

  const visible = filtered.slice(0, VISIBLE_LIMIT);
  const truncated = filtered.length - visible.length;

  return (
    <div
      className="fixed inset-0 z-confirm flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('iconPicker.chooseTitle')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={trapRef}
        className="bg-hs-panel border border-hs-border-strong rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col"
      >
        <div className="px-5 pt-4 pb-3 border-b border-hs-border-strong">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-semibold text-hs-text-primary">{t('iconPicker.chooseTitle')}</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-hs-text-muted hover:text-hs-text-body transition-colors"
              aria-label={t('common.close')}
            >
              {t('common.close')}
            </button>
          </div>
          <input
            ref={searchRef}
            type="search"
            placeholder={t('iconPicker.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${INPUT_CLASS} w-full text-sm`}
          />
          <div className="flex items-center gap-2 mt-3">
            {KIND_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setKindFilter(f.value)}
                className={`px-2.5 py-1 text-[11px] rounded border transition-colors ${
                  kindFilter === f.value
                    ? 'border-hs-accent bg-hs-accent/10 text-hs-text-body'
                    : 'border-hs-border-strong text-hs-text-muted hover:text-hs-text-body'
                }`}
              >
                {t(f.labelKey)}
              </button>
            ))}
            <span className="text-[11px] text-hs-text-faint ml-auto">
              {loading
                ? t('iconPicker.loadingCatalog')
                : t('iconPicker.iconCount', { count: filtered.length })}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-hs-text-faint py-12">
              {t('iconPicker.noMatch', { query })}
            </p>
          ) : (
            <>
              <IconGrid
                icons={visible}
                selectedName={selectedName}
                catalog={catalog}
                onPick={onPick}
              />
              {truncated > 0 && (
                <p className="text-center text-[11px] text-hs-text-faint mt-3">
                  {t('iconPicker.moreResults', { count: truncated })}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface IconGridProps {
  icons: readonly FaIconEntry[];
  selectedName: string;
  catalog: readonly FaIconEntry[];
  onPick: (name: string, kind: FaIconKind, styles: readonly FaIconKind[]) => void;
}

function IconGrid({ icons, selectedName, catalog, onPick }: IconGridProps) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))' }}>
      {icons.map((icon) => {
        const isSelected = icon.name === selectedName;
        return (
          <button
            key={`${icon.kind}:${icon.name}`}
            type="button"
            onClick={() => {
              // At click time, prefer the manifest-merged catalog entry over
              // the curated FA_ICONS entry — curated icons sometimes lack the
              // full `styles` array (we hand-typed only `kind`). Falling back
              // to `[icon.kind]` preserves correctness even when the manifest
              // hasn't loaded.
              const live = catalog.find((c) => c.name === icon.name) ?? icon;
              const styles = live.styles ?? [live.kind];
              onPick(live.name, live.kind, styles);
            }}
            title={icon.name}
            className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded border transition-colors ${
              isSelected
                ? 'border-hs-accent bg-hs-accent/10'
                : 'border-transparent hover:border-hs-border-strong hover:bg-hs-card'
            }`}
          >
            <i
              className={buildIconClass(icon.name, icon.kind)}
              style={{ fontSize: '22px' }}
              aria-hidden="true"
            />
            <span className="text-[10px] text-hs-text-faint truncate w-full text-center leading-tight">
              {icon.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
