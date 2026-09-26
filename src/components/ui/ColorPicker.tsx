'use client';

import { useState } from 'react';
import { parseCssColorToRgb, parseEditableColor, withCssColorAlpha } from '@/lib/hex-color';
import Slider from './Slider';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * Offer a see-through slider beside the swatch. Without it, the only way to
   * make a module's background semi-transparent was to hand-type
   * `rgba(0, 0, 0, 0.4)` into the text box, which is also the value every
   * module card ships with — so the control most likely to be touched first
   * asked for CSS. The OS colour input has no alpha of its own, hence a
   * separate slider rather than a richer swatch.
   */
  showAlpha?: boolean;
  /** Caption above the see-through slider. Required by `showAlpha`. */
  alphaLabel?: string;
  /** Pairs with `resetLabel`: when both are set and `value` differs from
   *  `defaultValue`, a reset button appears. Passing one without the other
   *  renders no button — the label is what names it for screen readers, and
   *  this component stays free of built-in English strings. */
  defaultValue?: string;
  /** Tooltip/screen-reader text for the reset button. Pairs with `defaultValue`. */
  resetLabel?: string;
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Hex and rgb()/rgba() only — the only forms the tint/contrast helpers
 * downstream can parse; parsing (not a DOM color probe) also avoids
 * SSR/client divergence.
 */
function isSupportedColor(input: string): boolean {
  return parseCssColorToRgb(input) !== null;
}

export default function ColorPicker({
  label, value, onChange, defaultValue, resetLabel, showAlpha, alphaLabel,
}: ColorPickerProps) {
  const [draft, setDraft] = useState(value);
  // Keep draft in sync when parent value changes (e.g. undo/redo)
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setDraft(value);
    setPrevValue(value);
  }

  // The swatch used to show white for every `rgba(...)` and for `transparent`
  // because it only read hex, so the two values modules actually ship with
  // were both drawn as the wrong colour. Feed it the parsed channels instead.
  const editable = parseEditableColor(value);
  const alpha = editable?.alpha ?? 1;
  const swatch = editable
    ? `#${editable.rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
    : '#ffffff';
  const setAlpha = (next: number) => {
    const updated = withCssColorAlpha(value, next);
    if (updated === null) return;
    onChange(updated);
    setDraft(updated);
  };
  const setSwatch = (hex: string) => {
    // Picking a colour keeps however see-through the card already was.
    const updated = withCssColorAlpha(hex, alpha) ?? hex;
    onChange(updated);
    setDraft(updated);
  };

  return (
    // The see-through slider gets its own full-width line, like every other
    // slider in the Style panel: beside the swatch and the text box it pushed
    // the row past the panel's edge. It sits outside the colour row's <label>,
    // whose clicks all open the OS colour picker.
    <div className="flex flex-col gap-1.5">
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
            value={swatch}
            onChange={(e) => setSwatch(e.target.value)}
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
              } else if (isSupportedColor(trimmed)) {
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
      {showAlpha && alphaLabel !== undefined && (
        <Slider
          label={alphaLabel}
          value={Math.round(alpha * 100)}
          min={0}
          max={100}
          displayValue={`${Math.round(alpha * 100)}%`}
          onChange={(v) => setAlpha(v / 100)}
        />
      )}
    </div>
  );
}
