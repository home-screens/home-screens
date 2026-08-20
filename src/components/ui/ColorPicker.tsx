'use client';

import { useState } from 'react';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Pairs with `resetLabel`: when both are set and `value` differs from
   *  `defaultValue`, a reset button appears. Passing one without the other
   *  renders no button — the label is what names it for screen readers, and
   *  this component stays free of built-in English strings. */
  defaultValue?: string;
  /** Tooltip/screen-reader text for the reset button. Pairs with `defaultValue`. */
  resetLabel?: string;
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isValidCssColor(input: string): boolean {
  if (typeof window === 'undefined') return HEX_RE.test(input);
  const probe = document.createElement('div');
  probe.style.color = '';
  probe.style.color = input;
  return probe.style.color !== '';
}

export default function ColorPicker({ label, value, onChange, defaultValue, resetLabel }: ColorPickerProps) {
  const [draft, setDraft] = useState(value);
  // Keep draft in sync when parent value changes (e.g. undo/redo)
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setDraft(value);
    setPrevValue(value);
  }

  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs text-hs-text-muted">{label}</span>
      <div className="flex items-center gap-2">
        {defaultValue !== undefined && resetLabel !== undefined && value !== defaultValue && (
          <button
            type="button"
            title={resetLabel}
            aria-label={resetLabel}
            // The button sits inside the <label>, so without preventDefault the
            // label's activation forwards the click to the color input and pops
            // the OS color picker on top of the reset.
            onClick={(e) => { e.preventDefault(); onChange(defaultValue); setDraft(defaultValue); }}
            className="text-xs text-hs-text-muted hover:text-hs-text-body cursor-pointer"
          >
            ↺
          </button>
        )}
        <input
          type="color"
          value={value.startsWith('#') ? value : '#ffffff'}
          onChange={(e) => { onChange(e.target.value); setDraft(e.target.value); }}
          className="w-8 h-8 rounded border border-hs-border-strong bg-transparent cursor-pointer"
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const trimmed = draft.trim();
            if (HEX_RE.test(trimmed)) {
              // Normalize 3-digit hex to 6-digit so ${color}XX opacity suffixes work
              const normalized = trimmed.length === 4
                ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
                : trimmed;
              onChange(normalized);
              setDraft(normalized);
            } else if (isValidCssColor(trimmed)) {
              onChange(trimmed);
              setDraft(trimmed);
            } else {
              setDraft(value);
            }
          }}
          className="w-28 px-2 py-1 text-xs bg-hs-input border border-hs-border-strong rounded text-hs-text-body"
        />
      </div>
    </label>
  );
}
