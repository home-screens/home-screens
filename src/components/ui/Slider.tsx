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
}

export default function Slider({ label, value, min, max, step = 1, displayValue, onChange, disabled }: SliderProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-hs-text-muted flex justify-between">
        <span>{label}</span>
        <span className="text-hs-text-faint">{displayValue ?? value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full accent-hs-accent disabled:cursor-not-allowed"
      />
    </label>
  );
}
