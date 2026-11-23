'use client';

import { useState } from 'react';
import { Ban } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { NO_ACCENT_COLOR } from '@/lib/constants';
import { parseCssColorToRgb, parseEditableColor, withCssColorAlpha } from '@/lib/hex-color';
import Slider from './Slider';
import { FOCUS_RING_CLASS } from './input-classes';

/**
 * The accent colours offered as one-click swatches under a module's accent
 * picker, in the order they are drawn. Names come from the editor dictionary.
 */
const ACCENT_SWATCHES = [
  { key: 'purple', value: '#a78bfa' },
  { key: 'blue', value: '#3b82f6' },
  { key: 'cyan', value: '#22d3ee' },
  { key: 'green', value: '#22c55e' },
  { key: 'amber', value: '#fbbf24' },
  { key: 'orange', value: '#f97316' },
  { key: 'red', value: '#ef4444' },
  { key: 'pink', value: '#ec4899' },
] as const;

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * A row of accent swatches under the picker, for a module's accent colour.
   * `accent-or-none` adds a "None" swatch first, for the modules that draw
   * no accent at all when the value is `NO_ACCENT_COLOR`; while it is chosen,
   * the text box reads "None" instead of a black hex.
   */
  swatches?: 'accent' | 'accent-or-none';
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

interface Swatch {
  value: string;
  label: string;
  /** The "no accent" choice, drawn as a crossed-out circle. */
  none?: boolean;
}

/**
 * A colour row: the label, a colour well and a text box that takes a hex or
 * rgb()/rgba() value, with an optional see-through slider and, for a
 * module's accent, a row of one-click swatches.
 */
export default function ColorPicker(props: ColorPickerProps) {
  // The swatch names come from the dictionary; a picker without swatches
  // stays free of it, so it also renders outside the editor's i18n provider.
  return props.swatches ? <ColorPickerWithSwatches {...props} swatches={props.swatches} /> : <ColorPickerRow {...props} />;
}

function ColorPickerWithSwatches(props: ColorPickerProps & { swatches: 'accent' | 'accent-or-none' }) {
  const t = useTranslate('editor');
  const swatchList: Swatch[] = [
    ...(props.swatches === 'accent-or-none'
      ? [{ value: NO_ACCENT_COLOR, label: t('accentColorPicker.presets.none'), none: true }]
      : []),
    ...ACCENT_SWATCHES.map((s) => ({ value: s.value, label: t(`accentColorPicker.presets.${s.key}`) })),
  ];
  return <ColorPickerRow {...props} swatchList={swatchList} />;
}

function ColorPickerRow({
  label, value, onChange, defaultValue, resetLabel, showAlpha, alphaLabel, swatchList,
}: ColorPickerProps & { swatchList?: Swatch[] }) {
  const none = swatchList?.find((s) => s.none);
  // "No accent" is stored as black, which would read as a black accent in
  // the text box, so the box stays empty and says "None" instead.
  const shown = (v: string) => (none !== undefined && v.toLowerCase() === none.value ? '' : v);
  const [draft, setDraftRaw] = useState(shown(value));
  const setDraft = (v: string) => setDraftRaw(shown(v));
  // Keep draft in sync when parent value changes (e.g. undo/redo)
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setDraft(value);
    setPrevValue(value);
  }
  const pick = (next: string) => {
    onChange(next);
    setDraft(next);
  };

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
    // Picking a colour keeps however see-through the card already was, unless
    // it was fully see-through: `transparent` (the Icon, Text and QR Code
    // background default) would otherwise turn every pick into an invisible
    // colour, so the first pick from there lands solid.
    const updated = alpha > 0 ? (withCssColorAlpha(hex, alpha) ?? hex) : hex;
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
        {/* The swatch and text box leave the label under 100px, less with the
            reset arrow or a classic scrollbar, and a one-word label longer
            than that (German "Verzierungsfarbe", Dutch "Opsommingskleur")
            cannot wrap, so it pushed the text box past the panel edge. It
            hyphenates in the page's language, and breaks anywhere as a last
            resort. */}
        <span className="text-xs text-hs-text-muted hyphens-auto wrap-anywhere">{label}</span>
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
            onChange={(e) => setDraftRaw(e.target.value)}
            placeholder={none?.label}
            onBlur={() => {
              const trimmed = draft.trim();
              if (none && trimmed === '') {
                pick(none.value);
              } else if (HEX_RE.test(trimmed)) {
                // Store every hex in its 6-digit form, the shape the swatch
                // emits and the reset button compares against the default.
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
            className="w-28 px-2 py-1 text-xs bg-hs-input border border-hs-border-strong rounded text-hs-text-body placeholder:text-hs-text-faint focus:outline-none focus:border-hs-accent"
          />
        </div>
      </label>
      {swatchList && (
        // Outside the <label>, whose clicks all open the OS colour picker.
        <div role="group" aria-label={label} className="flex flex-wrap justify-end gap-1.5">
          {swatchList.map((s) => {
            const chosen = value.toLowerCase() === s.value;
            return (
              <button
                key={s.value}
                type="button"
                aria-label={s.label}
                aria-pressed={chosen}
                title={s.label}
                onClick={() => pick(s.value)}
                className={`flex size-5 items-center justify-center rounded-full border transition-shadow ${FOCUS_RING_CLASS} ${
                  chosen ? 'border-hs-text-primary ring-2 ring-hs-accent-ring' : 'border-hs-border-strong hover:border-hs-text-muted'
                }`}
                style={s.none ? undefined : { backgroundColor: s.value }}
              >
                {s.none && <Ban aria-hidden className="size-3.5 text-hs-text-faint" />}
              </button>
            );
          })}
        </div>
      )}
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
