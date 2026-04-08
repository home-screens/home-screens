'use client';

import { type ReactNode } from 'react';

/**
 * Headless wrapper for a per-display settings control that may be either
 * **inherited** (reading from the global value) or **forked** (the display
 * has its own override that the user can edit).
 *
 * The wrapper renders the label with an inline pill/link:
 *   - Inherited: a grey "inherited" pill. Clicking it forks with the
 *     current inherited value as the seed. The child control is also
 *     fully interactive — a click or change on the child forks with the
 *     user's new value in one action (no two-click dance).
 *   - Forked: a blue "Reset to inherited" link. Clicking it clears the
 *     override and falls back to the global value.
 *
 * The wrapper is headless w.r.t. the actual control — it just supplies
 * `(value, onChange, isInherited)` to the render prop, and styles the
 * wrapper with `opacity-60` while inherited as a visual cue. The child
 * decides whether to respect `isInherited` by e.g. disabling drag
 * gestures; click-to-set children can stay enabled and let their first
 * click fork+set in a single user action.
 */
interface InheritedFieldProps<T> {
  /** Field label rendered to the left of the pill / reset link. Optional —
   *  omit when the child control renders its own label (e.g. `Slider`) and
   *  the wrapper should only contribute the fork/reset affordance. */
  label?: string;
  /** Value from the global settings, used when inherited. */
  inherited: T;
  /** Value from the per-display override, or `undefined` when inheriting. */
  override: T | undefined;
  /** Called when the user forks the field. The current inherited value
   *  is passed so the control's first edit starts from the same number
   *  the user was just looking at. */
  onFork: (seed: T) => void;
  /** Called when the user resets a forked field back to inherited. */
  onReset: () => void;
  /** Optional help text rendered below the control. */
  help?: ReactNode;
  /** Render the actual form control. `isInherited` is true when the user
   *  has not yet forked; respect it by disabling the control in that state. */
  children: (args: {
    value: T;
    onChange: (next: T) => void;
    isInherited: boolean;
  }) => ReactNode;
}

export default function InheritedField<T>({
  label,
  inherited,
  override,
  onFork,
  onReset,
  help,
  children,
}: InheritedFieldProps<T>) {
  const isInherited = override === undefined;
  const value = isInherited ? inherited : override;

  const handleChange = (next: T) => {
    // Unconditional fork-on-change: works for both forked-and-editing
    // (updates the override with the new value) AND for inherited
    // click-to-fork children like theme buttons / checkboxes that stay
    // interactive while inherited and want their first click to both
    // fork AND set in one user action. Slider-style children opt out of
    // the click-to-fork path by respecting `isInherited` and passing
    // `disabled={isInherited}`, because an accidental drag on an
    // inherited slider shouldn't silently create an override.
    onFork(next);
  };

  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        {label ? (
          <span className="text-xs text-neutral-400">{label}</span>
        ) : (
          <span />
        )}
        {isInherited ? (
          <button
            type="button"
            onClick={() => onFork(inherited)}
            aria-label={label ? `Override ${label} for this display` : 'Override this field for this display'}
            className="text-[10px] uppercase tracking-wider text-neutral-500 hover:text-neutral-300 transition-colors px-1.5 py-0.5 rounded bg-neutral-800/60 border border-neutral-700/60"
          >
            inherited
          </button>
        ) : (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-blue-400 hover:underline"
          >
            Reset to inherited
          </button>
        )}
      </div>
      {/* While inherited, the wrapper dims the child as a visual cue but
          leaves native events alone — a click on a theme button or a
          toggle on a checkbox forks AND sets in a single action via the
          child's own onChange path. The only reason to layer `disabled`
          onto a child is to suppress drag gestures the user didn't
          explicitly initiate (e.g. dragging a Slider track). */}
      <div className={isInherited ? 'opacity-60' : undefined}>
        {children({ value, onChange: handleChange, isInherited })}
      </div>
      {help && <p className="text-xs text-neutral-500 mt-1">{help}</p>}
    </div>
  );
}
