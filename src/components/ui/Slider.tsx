'use client';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  displayValue?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  onReset?: () => void;
  resetLabel?: string;
}

export default function Slider({ label, value, min, max, step = 1, displayValue, onChange, disabled, onReset, resetLabel }: SliderProps) {
  return (
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
          className="min-w-0 flex-1 accent-hs-accent disabled:cursor-not-allowed"
        />
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            aria-label={resetLabel ?? `Reset ${label}`}
            title={resetLabel ?? `Reset ${label}`}
            className="shrink-0 rounded border border-hs-border-strong px-2 py-0.5 text-[10px] text-hs-text-faint hover:bg-hs-hover hover:text-hs-text-body disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
        )}
      </span>
    </label>
  );
}
