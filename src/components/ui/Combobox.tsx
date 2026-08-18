'use client';

import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { filterComboboxOptions, type ComboboxOption } from '@/lib/combobox-filter';

interface ComboboxProps {
  /** Committed value. */
  value: string;
  /** Fires only on a deliberate pick (Enter or click) — never on typing. */
  onChange: (value: string) => void;
  options: ComboboxOption[];
  /** Accessible name for the input; also labels the listbox. */
  ariaLabel: string;
  /** Input placeholder while the query is empty. */
  placeholder?: string;
  /** Empty-result row text. Consumers pass a translated string. */
  noMatchText?: string;
}

/**
 * Generic searchable combobox: type to filter, arrows to move, Enter to pick.
 * Queries are space-separated AND-combined terms (see lib/combobox-filter).
 *
 * Interaction idioms mirror the condition-key picker (ConditionTreeEditor):
 * opens on focus, option mousedown preventDefault keeps the input focused
 * mid-pick, blur/Escape without a pick reverts to the committed value.
 * (Native <datalist> was ruled out there — there is no API to open it.)
 *
 * Closed state shows `label (description)`; while open the input holds the
 * live query. On close while still focused the text is selected, so the next
 * keystroke starts a fresh query instead of appending to the label.
 */
export default function Combobox({
  value, onChange, options, ariaLabel, placeholder, noMatchText,
}: ComboboxProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(-1);

  const shown = useMemo(() => filterComboboxOptions(options, query), [options, query]);
  const safeHighlight = Math.min(highlight, shown.length - 1);
  const selected = options.find((o) => o.value === value);
  const closedText = selected
    ? `${selected.label}${selected.description && selected.description !== selected.label ? ` (${selected.description})` : ''}`
    : value;
  const pinnedCount = shown.filter((o) => o.pinned).length;

  // Keep the keyboard-highlighted row visible. Re-runs on query so a shrunken
  // list re-scrolls; getElementById (not children indexing) skips divider rows.
  useEffect(() => {
    if (!open || highlight < 0) return;
    document.getElementById(`${listboxId}-opt-${highlight}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight, query, listboxId]);

  // Clamp the highlight when filtering shrinks the list under it.
  useEffect(() => {
    if (highlight >= shown.length) setHighlight(shown.length - 1);
  }, [shown.length, highlight]);

  // On close while still focused, select the committed text so typing
  // replaces it (the DOM input holds the label, not a query).
  useEffect(() => {
    if (!open && document.activeElement === inputRef.current) inputRef.current?.select();
  }, [open]);

  const close = () => {
    setOpen(false);
    setHighlight(-1);
    setQuery('');
  };
  const pick = (option: ComboboxOption) => {
    if (option.value !== value) onChange(option.value);
    setQuery('');
    close();
  };
  const openFresh = () => {
    setQuery('');
    setHighlight(-1);
    setOpen(true);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && safeHighlight >= 0 ? `${listboxId}-opt-${safeHighlight}` : undefined}
        aria-label={ariaLabel}
        autoComplete="off"
        className={INPUT_CLASS}
        value={open ? query : closedText}
        placeholder={placeholder}
        onFocus={openFresh}
        onClick={() => { if (!open) openFresh(); }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(-1);
          setOpen(true);
        }}
        onBlur={close}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && shown.length > 0) {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => (h + 1) % shown.length);
            return;
          }
          if (e.key === 'ArrowUp' && shown.length > 0) {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => (h <= 0 ? shown.length - 1 : h - 1));
            return;
          }
          if (e.key === 'Escape') {
            close();
            return;
          }
          if (e.key === 'Enter' && open) {
            e.preventDefault();
            if (highlight >= 0 && shown[highlight]) {
              pick(shown[highlight]);
              return;
            }
            // No keyboard highlight: commit an exact typed match (value or
            // label, case-insensitive) so type-and-Enter works like a native
            // select. Anything else commits nothing.
            const q = query.trim().toLowerCase();
            const exact = shown.find(
              (o) => o.value.trim().toLowerCase() === q || o.label.trim().toLowerCase() === q,
            );
            if (exact) pick(exact);
          }
        }}
      />
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-hs-text-faint" />
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded border border-hs-border-strong bg-hs-card py-1 shadow-lg"
        >
          {shown.length === 0 && (
            <li role="presentation" className="px-2 py-1 text-xs text-hs-text-faint">
              {noMatchText}
            </li>
          )}
          {shown.map((o, i) => (
            <Fragment key={o.value}>
              <li
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === highlight}
                // mousedown (not click): preventDefault keeps the input
                // focused so blur never reverts mid-pick.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`flex cursor-pointer items-center justify-between gap-2 overflow-hidden px-2 py-1 text-xs whitespace-nowrap text-ellipsis ${
                  o.pinned ? 'text-hs-text-muted' : 'text-hs-text-body'
                } ${i === highlight ? 'bg-hs-accent-soft' : ''}`}
              >
                <span className="truncate">{o.label}</span>
                {o.description && (
                  <span className="shrink-0 text-[11px] text-hs-text-faint">{o.description}</span>
                )}
              </li>
              {o.pinned && i === pinnedCount - 1 && i < shown.length - 1 && (
                <li role="presentation" className="mx-2 my-1 border-t border-hs-border-strong" />
              )}
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}
