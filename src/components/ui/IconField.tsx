'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { ALL_EMOJI, EMOJI_GROUPS, findEmoji, searchEmoji, type EmojiEntry } from '@/lib/emoji-catalog';
import { faIconValue, parseIconValue } from '@/lib/icon-value';
import type { FaIconKind } from '@/lib/font-awesome-icons';
import Glyph from './Glyph';
import { INPUT_CLASS } from './input-classes';
import {
  FaIconResults,
  FaKindFilterBar,
  useFaCatalog,
  useFilteredFaIcons,
  type FaKindFilter,
} from './fa-icon-browser';

type Tab = 'emoji' | 'fa';

/**
 * What the trigger says next to the chip. The chip already shows the glyph,
 * so echoing it back would just print the emoji twice; a catalog name reads
 * as a label. Font Awesome names are English in every locale, matching the
 * names the Icon module's grid has always shown on its tiles.
 */
function triggerLabel(value: string | undefined): string {
  const parsed = parseIconValue(value);
  if (!parsed) return '';
  if (parsed.type === 'fa') return parsed.name;
  // Falls back to the raw value for short custom text ("PE") and for an emoji
  // from an older config that isn't in the curated set.
  return findEmoji(parsed.text)?.n ?? parsed.text;
}

interface IconFieldProps {
  label: string;
  /** The stored value: an emoji, or a `fa:<style>:<name>` token. */
  value: string | undefined;
  /** Called with the new value, or `undefined` when the icon is cleared. */
  onChange: (value: string | undefined) => void;
}

/**
 * Picker for the config fields that hold a single free-form icon string —
 * calendar event and day-badge icons, the text module's prefix. Offers a
 * curated emoji set and the full Font Awesome catalog in one dialog; the
 * Icon module keeps its own `IconPicker`, which stores name and style
 * separately and so has no use for the emoji half.
 *
 * Opens on Emoji because that is what every one of these fields stored
 * before the picker existed.
 */
export default function IconField({ label, value, onChange }: IconFieldProps) {
  const t = useTranslate('editor');
  const id = useId();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const handlePick = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <>
      {/* Not LabeledField: that clones the id onto its single child, which
          here is the bordered wrapper. The caption has to point at the button
          so clicking it opens the picker and screen readers name the control. */}
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-xs text-hs-text-muted">{label}</label>
        <div className="flex items-center w-full bg-hs-input border border-hs-border-strong rounded hover:border-hs-accent focus-within:border-hs-accent transition-colors">
          <button
            id={id}
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 flex-1 min-w-0 px-2 py-1 text-left"
          >
            <span
              className="inline-flex items-center justify-center w-[22px] h-[22px] rounded bg-hs-card border border-hs-border-strong text-hs-text-body shrink-0 text-[13px] leading-none"
              aria-hidden="true"
            >
              {value ? <Glyph value={value} /> : <span className="text-hs-text-faint">+</span>}
            </span>
            <span className={`truncate text-[11px] flex-1 ${value ? 'text-hs-text-body' : 'text-hs-text-faint'}`}>
              {value ? triggerLabel(value) : t('iconPicker.chooseIconPlaceholder')}
            </span>
            {!value && <span className="text-[10px] text-hs-text-faint shrink-0">{t('iconPicker.browse')}</span>}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              aria-label={t('iconPicker.removeIcon')}
              className="px-1.5 py-1 text-hs-text-faint hover:text-hs-text-body transition-colors shrink-0"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {open && <IconFieldModal value={value} onClose={close} onPick={handlePick} onClear={() => { onChange(undefined); setOpen(false); }} />}
    </>
  );
}

interface IconFieldModalProps {
  value: string | undefined;
  onClose: () => void;
  onPick: (value: string) => void;
  onClear: () => void;
}

function IconFieldModal({ value, onClose, onPick, onClear }: IconFieldModalProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const trapRef = useFocusTrap<HTMLDivElement>();
  const searchRef = useRef<HTMLInputElement>(null);

  const parsed = parseIconValue(value);
  const [tab, setTab] = useState<Tab>(parsed?.type === 'fa' ? 'fa' : 'emoji');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<FaKindFilter>('all');

  const { catalog, loading } = useFaCatalog();
  const faFiltered = useFilteredFaIcons(query, catalog, kindFilter);
  const emojiResults = useMemo(() => (query.trim() ? searchEmoji(query) : null), [query]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  useEscapeKey(onClose);

  const selectedEmoji = parsed?.type === 'text' ? parsed.text : '';
  const selectedFaName = parsed?.type === 'fa' ? parsed.name : '';

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
        <div className="px-5 pt-4 border-b border-hs-border-strong">
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
            placeholder={t('iconPicker.searchAllPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${INPUT_CLASS} w-full text-sm`}
          />
          {/* One search box drives both tabs, so a query typed on Emoji still
              has results waiting when the user flips to Font Awesome. */}
          <div className="flex gap-5 mt-3" role="tablist">
            <TabButton active={tab === 'emoji'} onClick={() => setTab('emoji')} count={ALL_EMOJI.length}>
              {t('iconPicker.tabEmoji')}
            </TabButton>
            <TabButton active={tab === 'fa'} onClick={() => setTab('fa')} count={catalog.length}>
              {t('iconPicker.tabFontAwesome')}
            </TabButton>
          </div>
          {tab === 'fa' && (
            <div className="my-3">
              <FaKindFilterBar value={kindFilter} onChange={setKindFilter} count={faFiltered.length} loading={loading} />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'emoji' ? (
            emojiResults ? (
              emojiResults.length === 0 ? (
                <p className="text-center text-xs text-hs-text-faint py-12">{t('iconPicker.noMatch', { query })}</p>
              ) : (
                <EmojiGrid icons={emojiResults} selected={selectedEmoji} onPick={onPick} />
              )
            ) : (
              EMOJI_GROUPS.map((group) => (
                <div key={group.id} className="mb-4 last:mb-0">
                  <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-1.5">
                    {t(`iconPicker.emojiGroups.${group.id}`)}
                  </div>
                  <EmojiGrid icons={group.icons} selected={selectedEmoji} onPick={onPick} />
                </div>
              ))
            )
          ) : (
            <FaIconResults
              filtered={faFiltered}
              selectedName={selectedFaName}
              catalog={catalog}
              query={query}
              onPick={(name: string, kind: FaIconKind) => onPick(faIconValue(name, kind))}
            />
          )}
        </div>

        {/* Only drawn once something is picked — with nothing to remove or
            preview, the bordered bar was an empty strip under the grid. */}
        {value && (
          <div className="border-t border-hs-border-strong px-5 py-2.5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClear}
              className="text-[11.5px] text-hs-text-muted hover:text-hs-danger transition-colors"
            >
              {t('iconPicker.removeIcon')}
            </button>
            <span className="flex items-center gap-2 text-[11.5px] text-hs-text-faint">
              {t('iconPicker.previewLabel')}
              <span
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded bg-hs-card border border-hs-border-strong text-hs-text-body text-[15px] leading-none"
                aria-hidden="true"
              >
                <Glyph value={value} />
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 pb-2 text-[12.5px] border-b-2 transition-colors ${
        active
          ? 'text-hs-text-primary border-hs-accent'
          : 'text-hs-text-muted border-transparent hover:text-hs-text-body'
      }`}
    >
      {children}
      <span className="text-[10px] text-hs-text-faint bg-hs-card rounded-full px-1.5 py-px">
        {count.toLocaleString()}
      </span>
    </button>
  );
}

function EmojiGrid({
  icons,
  selected,
  onPick,
}: {
  icons: readonly EmojiEntry[];
  selected: string;
  onPick: (value: string) => void;
}) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}>
      {icons.map((entry) => (
        <button
          key={entry.e}
          type="button"
          onClick={() => onPick(entry.e)}
          title={entry.n}
          aria-label={entry.n}
          className={`h-11 flex items-center justify-center text-[21px] leading-none rounded-lg border transition-colors ${
            entry.e === selected
              ? 'border-hs-accent bg-hs-accent/10'
              : 'border-transparent hover:border-hs-border-strong hover:bg-hs-card'
          }`}
        >
          {entry.e}
        </button>
      ))}
    </div>
  );
}
