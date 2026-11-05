'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useGroupOpen } from '@/components/editor/useGroupOpen';

/**
 * One source in a rotating background's Sources list: a checkbox that puts
 * the source in or out of the rotation, its name, and a chevron that opens
 * its settings. Collapsing only hides the settings and is remembered per
 * source; ticking a source opens it. A note under the header says what the
 * source still needs (a key, a link, some pictures) and shows whether open
 * or closed.
 */
export default function SourceRow({ id, label, checked, disabled, onCheck, note, extra, children }: {
  id: string;
  label: string;
  checked: boolean;
  /** The source cannot be ticked yet (its key is missing); the note says where to add it. */
  disabled?: boolean;
  onCheck: (checked: boolean) => void;
  note?: ReactNode;
  /** Something small beside the chevron (a count). */
  extra?: ReactNode;
  children?: ReactNode;
}) {
  const [open, setOpen] = useGroupOpen(`source-${id}`);
  const panelId = useId();
  const wasChecked = useRef(checked);
  useEffect(() => {
    if (checked && !wasChecked.current) setOpen(true);
    wasChecked.current = checked;
  }, [checked, setOpen]);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div data-testid={`source-row-${id}`} className="space-y-1">
      <div className="flex items-center gap-2">
        <label className={`flex min-w-0 flex-1 items-center gap-2 text-xs text-hs-text-body ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onCheck(e.target.checked)}
            className="rounded border-hs-border-strong"
          />
          <span className="truncate">{label}</span>
        </label>
        {extra}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={label}
          data-testid={`source-group-${id}`}
          className="flex items-center rounded px-1 text-[10px] text-hs-text-muted hover:bg-hs-hover"
        >
          <Chevron size={11} aria-hidden="true" />
        </button>
      </div>
      {note && <p className="ml-5 text-[10px] leading-relaxed text-hs-text-faint" data-testid={`source-note-${id}`}>{note}</p>}
      {open && children && <div id={panelId} className="ml-5 space-y-2 pt-1">{children}</div>}
    </div>
  );
}
