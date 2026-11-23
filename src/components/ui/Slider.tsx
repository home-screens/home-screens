'use client';

import { useId, type ReactNode } from 'react';
import FieldHint from './FieldHint';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  displayValue?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** The help line under the slider, drawn as a `FieldHint` and read out with it. */
  hint?: ReactNode;
  /** Forwarded to the help line, for tests that read it. */
  hintTestId?: string;
}

/** A reset button needs its own words: the visible text and an accessible name that says what it resets. */
type ResetProps =
  | { onReset?: undefined; resetLabel?: undefined; resetTitle?: undefined }
  | { onReset: () => void; resetLabel: string; resetTitle: string };

export default function Slider({ label, value, min, max, step = 1, displayValue, onChange, disabled, hint, hintTestId, onReset, resetLabel, resetTitle }: SliderProps & ResetProps) {
  const hintId = useId();
  const hasHint = hint !== undefined && hint !== null && hint !== false;
  const slider = (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-hs-text-muted flex justify-between">
        <span>{label}</span>
        <span className="text-hs-text-faint">{displayValue ?? value}</span>
      </span>
      <span className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          aria-describedby={hasHint ? hintId : undefined}
          className="min-w-0 flex-1 accent-hs-accent disabled:cursor-not-allowed"
        />
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            aria-label={resetTitle}
            title={resetTitle}
            className="shrink-0 rounded border border-hs-border-strong px-2 py-0.5 text-[10px] text-hs-text-faint hover:bg-hs-hover hover:text-hs-text-body disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resetLabel}
          </button>
        )}
      </span>
    </label>
  );
  if (!hasHint) return slider;
  return (
    <div className="flex flex-col gap-0.5">
      {slider}
      <FieldHint id={hintId} data-testid={hintTestId}>{hint}</FieldHint>
    </div>
  );
}
