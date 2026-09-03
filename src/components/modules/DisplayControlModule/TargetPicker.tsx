'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslate } from '@/i18n';
import type { ControlMetrics } from './metrics';

export interface TargetPickerProps {
  /** Current dispatch target: a display id, 'all', or undefined (this display, id unknown). */
  value: string | undefined;
  onChange: (v: string) => void;
  /** Registered displays, in registry order. */
  options: Array<{ id: string; name: string }>;
  /** The display this module renders on; marked "this display" in the list. */
  selfId?: string;
  /** Lets the layout dim its buttons while the list is open. */
  onOpenChange?: (open: boolean) => void;
  /** Sizing model, so the row shrinks with the widget. */
  m: ControlMetrics;
}

export const ALL_TARGET = 'all';

/** The open list floats over the widget, so it is legible at a fixed size
 *  rather than shrinking with a small picker row. */
const LIST_FONT = 18;

/** A display's friendly name, or its id when it was never given one. */
export function displayLabel(d: { id: string; name: string }): string {
  return d.name.trim() || d.id;
}

/**
 * "Controls [Kitchen ⌄]" with a popover list of friendly display names, this
 * display marked, and "All displays" last. A custom list rather than a native
 * select so it renders at wall size and can be styled like the buttons.
 */
export function TargetPicker({ value, onChange, options, selfId, onOpenChange, m }: TargetPickerProps) {
  const t = useTranslate('modules');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selectedLabel = value === ALL_TARGET
    ? t('display-control.allDisplays')
    : (() => {
        const match = options.find((o) => o.id === value);
        return match ? displayLabel(match) : t('display-control.thisDisplay');
      })();

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    // data-swipe-ignore: a drag inside the list must never turn into screen navigation.
    <div
      ref={ref}
      className="relative flex min-w-0 items-center text-hs-text-muted"
      style={{ gap: m.gap * 0.6, height: m.pickerH || undefined, fontSize: m.picker }}
      data-swipe-ignore
    >
      {m.showPickerPrefix && <span className="shrink-0">{t('display-control.controls')}</span>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-full min-w-0 items-center border border-hs-border-strong bg-hs-card font-medium text-hs-text-primary transition-transform active:scale-[0.98]"
        style={{ gap: m.gap * 0.5, borderRadius: m.radius * 0.7, paddingInline: m.pad * 0.6, fontSize: m.picker * 1.05 }}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg aria-hidden="true" className="shrink-0 text-hs-text-faint" style={{ height: m.picker * 0.9, width: m.picker * 0.9 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-2 max-h-[360px] min-w-[240px] overflow-y-auto rounded-2xl border border-hs-border-strong bg-hs-card p-2 shadow-2xl"
          style={{ fontSize: LIST_FONT }}
        >
          {options.map((opt) => {
            const active = opt.id === value || (value === undefined && opt.id === selfId);
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitem"
                onClick={() => choose(opt.id)}
                className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-2.5 text-left ${
                  active ? 'bg-hs-accent-soft text-hs-accent-hover' : 'text-hs-text-primary hover:bg-hs-hover'
                }`}
              >
                <span>{displayLabel(opt)}</span>
                {opt.id === selfId && (
                  <span className="text-hs-text-muted" style={{ fontSize: LIST_FONT * 0.85 }}>{t('display-control.thisDisplayTag')}</span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            role="menuitem"
            onClick={() => choose(ALL_TARGET)}
            className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left ${
              value === ALL_TARGET ? 'bg-hs-accent-soft text-hs-accent-hover' : 'text-hs-text-primary hover:bg-hs-hover'
            }`}
          >
            {t('display-control.allDisplays')}
          </button>
        </div>
      )}
    </div>
  );
}
