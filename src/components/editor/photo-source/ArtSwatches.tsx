'use client';

import LabeledField from '@/components/ui/LabeledField';

export interface ArtSwatch<T extends string> {
  value: T;
  label: string;
  /** A CSS background: a colour, or a gradient for "from the painting". */
  paint: string;
  /** Drawn as an empty, dashed square ("None"). */
  empty?: boolean;
}

/** A row of colour squares to choose one from: the wall, the mat or the frame a painting hangs in. */
export default function ArtSwatches<T extends string>({ label, options, value, onChange, testId }: {
  label: string;
  options: ReadonlyArray<ArtSwatch<T>>;
  value: T;
  onChange: (value: T) => void;
  testId: string;
}) {
  return (
    <LabeledField label={label} as="div">
      <div className="flex gap-2" role="radiogroup" aria-label={label} data-testid={testId}>
        {options.map((option) => {
          const chosen = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={chosen}
              data-value={option.value}
              onClick={() => onChange(option.value)}
              className="flex w-12 flex-col items-center gap-1 text-[10px] leading-tight text-hs-text-muted hover:text-hs-text-body"
            >
              <span
                className={`block h-[34px] w-[34px] rounded-md border ${option.empty ? 'border-dashed' : ''} border-hs-border-strong ${chosen ? 'outline outline-2 outline-offset-2 outline-hs-accent' : ''}`}
                style={{ background: option.paint }}
              />
              <span className={chosen ? 'text-hs-text-body' : undefined}>{option.label}</span>
            </button>
          );
        })}
      </div>
    </LabeledField>
  );
}
