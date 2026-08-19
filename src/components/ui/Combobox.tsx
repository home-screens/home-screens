'use client';

import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { filterComboboxOptions, type ComboboxOption } from '@/lib/combobox-filter';

interface ComboboxProps {
  /** Committed value. */
  value: string;
  /** Fires only on a deliberate pick (Enter, Tab, or click) — never on typing. */
  onChange: (value: string) => void;
  options: ComboboxOption[];
  /** Accessible name for the input; also labels the listbox. */
  ariaLabel: string;
  /** id for the input so an external `<label htmlFor>` can target it. */
  id?: string;
  /** id of an external help-text element, linked via aria-describedby. */
  ariaDescribedBy?: string;
  /** Input styling override; defaults to the compact property-panel tier. */
  inputClassName?: string;
  /** Input placeholder while the query is empty. */
  placeholder?: string;
  /** Empty-result row text. Consumers pass a translated string. */
  noMatchText?: string;
}

/** Dropdown max height (max-h-48 = 12rem) plus margin — drives flipping above. */
const LIST_SPACE = 200;

interface ListRect {
  left: number;
  width: number;
  /** Input's viewport top/bottom — the list anchors to one of them. */
  top: number;
  bottom: number;
  openUp: boolean;
}

/**
 * Generic searchable combobox: type to filter, arrows to move, Enter to pick.
 * Queries are space-separated AND-combined terms (see lib/combobox-filter).
 *
 * Interaction idioms mirror the condition-key picker (ConditionTreeEditor):
 * opens on focus, listbox mousedown preventDefault keeps the input focused
 * mid-pick, blur/Escape without a pick reverts to the committed value.
 * (Native <datalist> was ruled out there — there is no API to open it.)
 *
 * While open the input holds the live query and shows the committed value as
 * its placeholder; the committed option carries aria-selected plus a check
 * mark and is scrolled into view on open. On close while still focused the
 * text is selected, so the next keystroke starts a fresh query instead of
 * appending to the label.
 *
 * The list renders in a body portal with fixed positioning so ancestor
 * overflow containers (property panel, settings page) can't clip it; it flips
 * above the input when the viewport bottom is too close.
 */
export default function Combobox({
  value, onChange, options, ariaLabel, id, ariaDescribedBy, inputClassName, placeholder, noMatchText,
}: ComboboxProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const revealCommitted = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(-1);
  const [rect, setRect] = useState<ListRect | null>(null);

  const shown = useMemo(() => filterComboboxOptions(options, query), [options, query]);
  const safeHighlight = Math.min(highlight, shown.length - 1);
  const selected = options.find((o) => o.value === value);
  const closedText = selected
    ? `${selected.label}${selected.description && selected.description !== selected.label ? ` (${selected.description})` : ''}`
    : value;
  const pinnedCount = shown.filter((o) => o.pinned).length;

  // Anchor the portaled list to the input; recompute on any ancestor scroll
  // (capture phase) or resize. The equality guard keeps the list's own
  // scroll events (which bubble to window in capture) from re-rendering.
  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    const update = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (!r) return;
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceBelow < LIST_SPACE && r.top > spaceBelow;
      setRect((prev) => (
        prev && prev.left === r.left && prev.width === r.width
          && prev.top === r.top && prev.bottom === r.bottom && prev.openUp === openUp
          ? prev
          : { left: r.left, width: r.width, top: r.top, bottom: r.bottom, openUp }
      ));
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // Keep the keyboard-highlighted row visible. Re-runs on query so a shrunken
  // list re-scrolls; getElementById (not children indexing) skips divider rows.
  useEffect(() => {
    if (!open || !rect || highlight < 0) return;
    document.getElementById(`${listboxId}-opt-${highlight}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, rect, highlight, query, listboxId]);

  // On a fresh open, reveal the committed option (the list mounts once `rect`
  // lands, hence the flag instead of keying on `open`). The highlight stays
  // -1 so ArrowDown still starts from the top (pinned) row.
  useEffect(() => {
    if (!open || !rect || !revealCommitted.current) return;
    revealCommitted.current = false;
    const idx = shown.findIndex((o) => o.value === value);
    if (idx >= 0) document.getElementById(`${listboxId}-opt-${idx}`)?.scrollIntoView({ block: 'center' });
  }, [open, rect, shown, value, listboxId]);

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
    close();
  };
  const openFresh = () => {
    setQuery('');
    setHighlight(-1);
    revealCommitted.current = true;
    setOpen(true);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && safeHighlight >= 0 ? `${listboxId}-opt-${safeHighlight}` : undefined}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        autoComplete="off"
        className={inputClassName ?? INPUT_CLASS}
        value={open ? query : closedText}
        placeholder={open ? closedText || placeholder : placeholder}
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
          if (e.key === 'Tab') {
            // Commit an arrow-highlighted row before focus moves on — the
            // native select this replaces committed on every arrow move, so
            // Tab-away must not silently discard the navigated-to option.
            if (open && safeHighlight >= 0 && shown[safeHighlight]) pick(shown[safeHighlight]);
            return;
          }
          if (e.key === 'Enter' && open) {
            e.preventDefault();
            if (safeHighlight >= 0 && shown[safeHighlight]) {
              pick(shown[safeHighlight]);
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
      {open && rect && createPortal(
        <ul
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          // mousedown (not click) preventDefault, on the whole list: a press
          // on an option, the divider, the padding, or the scrollbar must not
          // blur the input and unmount the list mid-interaction.
          onMouseDown={(e) => e.preventDefault()}
          className="fixed z-50 max-h-48 overflow-y-auto rounded border border-hs-border-strong bg-hs-card py-1 shadow-lg"
          style={rect.openUp
            ? { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 4 }
            : { left: rect.left, width: rect.width, top: rect.bottom + 4 }}
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
                aria-selected={o.value === value}
                onMouseDown={() => pick(o)}
                // mousemove with a coordinate guard, not mouseenter:
                // scrollIntoView slides rows under a stationary cursor and the
                // re-dispatched hover event must not steal the keyboard highlight.
                onMouseMove={(e) => {
                  const p = lastPointer.current;
                  if (p && p.x === e.clientX && p.y === e.clientY) return;
                  lastPointer.current = { x: e.clientX, y: e.clientY };
                  if (highlight !== i) setHighlight(i);
                }}
                className={`flex cursor-pointer items-center justify-between gap-2 overflow-hidden px-2 py-1 text-xs whitespace-nowrap text-ellipsis ${
                  o.pinned ? 'text-hs-text-muted' : 'text-hs-text-body'
                } ${i === safeHighlight ? 'bg-hs-accent-soft' : ''}`}
              >
                <span className="truncate">{o.label}</span>
                {o.description && (
                  <span className="shrink-0 text-[11px] text-hs-text-faint">{o.description}</span>
                )}
                {o.value === value && <Check className="w-3 h-3 shrink-0 text-hs-accent" />}
              </li>
              {o.pinned && i === pinnedCount - 1 && i < shown.length - 1 && (
                <li role="presentation" className="mx-2 my-1 border-t border-hs-border-strong" />
              )}
            </Fragment>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
