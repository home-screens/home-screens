'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Drawn before the label, such as a small lucide icon. Hidden from screen readers by the caller. */
  icon?: ReactNode;
  /** This one option cannot be chosen right now; the others still can. */
  disabled?: boolean;
  /** Forwarded as `data-testid` on the option's button. */
  testId?: string;
}

interface SegmentedControlProps<T extends string> {
  /** The option that is currently chosen. */
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  /**
   * Spoken name of the group. A caption drawn by `LabeledField` is a real
   * `<label>`, which names form controls only, so a group of radios has to
   * repeat the wording here or it is announced with no name at all.
   */
  label?: string;
  /**
   * Forwarded to the outer element. `LabeledField as="div"` clones an id onto
   * its single child and points the caption's `htmlFor` at it, so without this
   * the caption would target nothing.
   */
  id?: string;
  disabled?: boolean;
  /**
   * `equal` (the default) fills the row and shares it evenly. `content` makes
   * the track only as wide as its options, for a short choice inside a wider
   * row (a length, a kind).
   */
  fit?: 'equal' | 'content';
  /** Extra classes for the track. */
  className?: string;
}

/**
 * One value out of a handful, drawn as the app's grey pill.
 *
 * It picks a value rather than turning one thing on, so the options carry
 * `aria-checked` radio semantics instead of `aria-pressed`, and arrow keys
 * move between them the way they do in any radio group, stepping over an
 * option that is switched off. Segments wrap instead of truncating, so the
 * longest translation still reads in a narrow column.
 */
export default function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  id,
  disabled = false,
  fit = 'equal',
  className,
}: SegmentedControlProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const current = options.findIndex((option) => option.value === value);
  const pickable = (index: number) => !options[index]?.disabled;

  const selectAt = (index: number) => {
    const option = options[index];
    if (!option || disabled || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    // Keyboard movement selects and focuses in one step. The buttons keep
    // their positions across the re-render, so index is a safe handle.
    trackRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
  };

  /** The next option that can be chosen, walking `step` at a time and wrapping. */
  const nextPickable = (from: number, step: 1 | -1) => {
    for (let i = 1; i <= options.length; i++) {
      const at = (from + step * i + options.length) % options.length;
      if (pickable(at)) return at;
    }
    return from;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || options.length === 0) return;
    const from = current < 0 ? 0 : current;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        selectAt(nextPickable(from, 1));
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        selectAt(nextPickable(from, -1));
        break;
      case 'Home':
        event.preventDefault();
        selectAt(nextPickable(options.length - 1, 1));
        break;
      case 'End':
        event.preventDefault();
        selectAt(nextPickable(0, -1));
        break;
      default:
        break;
    }
  };

  // Arrow keys move inside a radio group, Tab moves past it, so only one
  // option is a tab stop: the chosen one, else the first that can be chosen.
  const tabStop = current >= 0 && pickable(current) ? current : options.findIndex((_, i) => pickable(i));

  return (
    <div
      ref={trackRef}
      id={id}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      className={clsx(
        'rounded-md border border-hs-border bg-hs-card p-0.5',
        fit === 'content' ? 'inline-flex w-fit max-w-full flex-wrap' : 'flex w-full',
        disabled && 'opacity-50',
        className,
      )}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={disabled || option.disabled}
            data-testid={option.testId}
            onClick={() => selectAt(index)}
            className={clsx(
              'rounded py-1 text-xs leading-tight transition-colors',
              fit === 'content' ? 'px-3' : 'flex-1 px-2',
              option.icon !== undefined && 'inline-flex items-center justify-center gap-1.5',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-hs-accent',
              'disabled:cursor-not-allowed',
              option.disabled && 'opacity-40',
              checked
                ? 'bg-hs-hover text-hs-text-primary'
                : 'text-hs-text-faint hover:text-hs-text-secondary',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
