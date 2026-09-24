'use client';

/**
 * The two pickers the chore screens on the phone share: a two-way switch and
 * a list of choices with a line under each. The chore form uses both, the
 * chore settings sheet uses the list.
 */

/** Two-way switch, one thumb-sized half per choice, the picked half in amber. */
export function Segmented<T extends string>({ value, options, onChange, testId, label }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  testId: string;
  /** The group's name for a screen reader: the field label it sits under. */
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} data-testid={testId} style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 4, padding: 3, borderRadius: 12, background: 'var(--hs-bg-panel)', border: '1px solid var(--hs-border)' }}>
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(opt.value)}
            style={{
              minHeight: 40, borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              background: on ? 'color-mix(in srgb, #f59e0b 22%, var(--hs-bg-panel))' : 'transparent',
              color: on ? '#f59e0b' : 'var(--hs-text-faint)',
              transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** A list of choices with a line under each, one picked. */
export function ChoiceList<T extends string>({ value, options, onChange, testId, label }: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
  testId: string;
  /** The group's name for a screen reader: the field label it sits under. */
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} data-testid={testId} style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--hs-border)' }}>
      {options.map((opt, i) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(opt.value)}
            style={{
              width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', minHeight: 48,
              background: 'var(--hs-bg-panel)', border: 'none', color: 'inherit', textAlign: 'left' as const, cursor: 'pointer',
              borderBottom: i < options.length - 1 ? '1px solid var(--hs-border)' : 'none',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1, boxSizing: 'border-box',
                border: on ? '6px solid #f59e0b' : '2px solid var(--hs-border-strong)',
              }}
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--hs-text-body)' }}>{opt.label}</span>
              {opt.hint && <span style={{ display: 'block', fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 2 }}>{opt.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

