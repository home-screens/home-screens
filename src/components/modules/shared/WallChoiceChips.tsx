'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { wallPressProps } from './wallPress';

export interface WallChoice<T extends string> {
  value: T;
  label: ReactNode;
  /** A colour dot before the label, and the chosen chip's outline (a calendar's colour). */
  color?: string;
  /** Drawn dashed until chosen: a way out of the usual choices ("Other"). */
  other?: boolean;
}

/**
 * One-of-many big chips for a wall sheet: a calendar, a length, a minute.
 * Reads the colours a wall sheet sets with `wallTypingVars`, so it matches
 * any full-screen theme. `fill` spreads the chips across the row (the length
 * chips); when a longer language does not fit them on one row they wrap and
 * keep their own widths, so a chip alone on the second row is not a full-width
 * bar. Sizes are on the 1080-wide canvas, scaled by `P`.
 */
export function WallChoiceChips<T extends string>({ P, label, options, value, onChange, fill = false, testId }: {
  P: (n: number) => number;
  /** The group's name, for screen readers. */
  label: string;
  options: WallChoice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  fill?: boolean;
  testId?: string;
}) {
  const wrapped = useWrapped(fill);
  const spread = fill && !wrapped.value;
  return (
    <div ref={wrapped.ref} role="radiogroup" aria-label={label} data-testid={testId} style={{ display: 'flex', flexWrap: 'wrap', gap: P(fill ? 12 : 14) }}>
      {options.map((option) => {
        const on = option.value === value;
        const tinted = on && option.color;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            {...wallPressProps}
            data-choice={option.value}
            onClick={() => onChange(option.value)}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: P(14),
              minHeight: Math.max(44, P(76)), padding: `0 ${P(spread ? 10 : 30)}px`, flex: spread ? '1 1 auto' : undefined,
              borderRadius: P(38), whiteSpace: 'nowrap', font: 'inherit', fontSize: P(28), fontWeight: 600, cursor: 'pointer',
              background: tinted ? `color-mix(in srgb, ${option.color} 16%, var(--wt-surface))` : on ? 'var(--wt-accent)' : 'color-mix(in srgb, var(--wt-text) 4%, var(--wt-surface))',
              color: on && !tinted ? 'var(--wt-on-accent)' : 'var(--wt-text)',
              border: tinted ? `${P(3)}px solid ${option.color}` : on ? `${P(2)}px solid transparent` : `${P(2)}px ${option.other ? 'dashed' : 'solid'} var(--wt-border)`,
            }}
          >
            {option.color && <span aria-hidden="true" style={{ width: P(22), height: P(22), borderRadius: '50%', background: option.color, flexShrink: 0 }} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Whether a row of chips has wrapped onto a second line. Line breaks go by
 * each chip's own width before any stretching, so dropping the stretch once
 * wrapped never unwraps the row.
 */
function useWrapped(watch: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!watch || !el) return;
    const check = () => {
      const first = el.firstElementChild as HTMLElement | null;
      const last = el.lastElementChild as HTMLElement | null;
      setValue(Boolean(first && last && last.offsetTop > first.offsetTop));
    };
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [watch]);
  return { ref, value };
}

/**
 * One-of-many big rows with a radio mark, for a list of choices that read as
 * sentences ("Every week on Saturday"). Same colours and scale as
 * `WallChoiceChips`.
 */
export function WallRadioRows<T extends string>({ P, label, options, value, onChange, testId }: {
  P: (n: number) => number;
  label: string;
  options: { value: T; label: ReactNode; hint?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  testId?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: P(12) }}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            {...wallPressProps}
            data-choice={option.value}
            onClick={() => onChange(option.value)}
            style={{
              display: 'flex', alignItems: 'center', gap: P(22), minHeight: Math.max(44, P(88)), padding: `0 ${P(28)}px`,
              borderRadius: P(20), font: 'inherit', fontSize: P(30), fontWeight: 600, textAlign: 'left', cursor: 'pointer', color: 'var(--wt-text)',
              background: on ? 'color-mix(in srgb, var(--wt-accent) 9%, var(--wt-surface))' : 'color-mix(in srgb, var(--wt-text) 4%, var(--wt-surface))',
              border: `${P(2)}px solid ${on ? 'var(--wt-accent)' : 'var(--wt-border)'}`,
            }}
          >
            <span aria-hidden="true" style={{ width: P(36), height: P(36), borderRadius: '50%', flexShrink: 0, background: 'var(--wt-surface)', border: on ? `${P(11)}px solid var(--wt-accent)` : `${P(3)}px solid var(--wt-border)` }} />
            <span style={{ flex: 1 }}>{option.label}</span>
            {option.hint && <span style={{ fontSize: P(22), fontWeight: 500, color: 'var(--wt-text-3)' }}>{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
