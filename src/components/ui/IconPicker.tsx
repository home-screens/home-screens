'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslate } from '@/i18n';
import { buildIconClass, type FaIconKind } from '@/lib/font-awesome-icons';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import LabeledField from './LabeledField';
import { INPUT_CLASS } from './input-classes';
import {
  FaIconResults,
  FaKindFilterBar,
  useFaCatalog,
  useFilteredFaIcons,
  type FaKindFilter,
} from './fa-icon-browser';

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

/**
 * Font-Awesome-only picker for the Icon module, which stores the icon name
 * and its style in two separate config fields. Fields that store a single
 * free-form icon string (calendar rule icons, the text prefix) use
 * `IconField` instead, which offers emoji alongside this same catalog.
 */
export default function IconPicker({ label, value, currentKind, onPick }: IconPickerProps) {
  const t = useTranslate('editor');
  const resolvedLabel = label ?? t('fields.icon');
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

      {open && <IconPickerModal selectedName={value} onClose={close} onPick={handlePick} />}
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
  const tCore = useTranslate('core');
  const trapRef = useFocusTrap<HTMLDivElement>();
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<FaKindFilter>('all');
  const { catalog, loading } = useFaCatalog();
  const filtered = useFilteredFaIcons(query, catalog, kindFilter);

  // Autofocus the search input once on mount. Stable empty deps so we don't
  // refocus while the user types when the parent re-renders.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Escape-to-close. `onClose` is the parent's stable `useCallback` handle,
  // so this listener is bound once and not churned on parent renders.
  useEscapeKey(onClose);

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
              aria-label={tCore('actions.close')}
            >
              {tCore('actions.close')}
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
          <div className="mt-3">
            <FaKindFilterBar value={kindFilter} onChange={setKindFilter} count={filtered.length} loading={loading} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <FaIconResults
            filtered={filtered}
            selectedName={selectedName}
            catalog={catalog}
            query={query}
            onPick={onPick}
          />
        </div>
      </div>
    </div>
  );
}
