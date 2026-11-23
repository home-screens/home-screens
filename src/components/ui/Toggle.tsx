'use client';

import { useId, type ReactNode } from 'react';
import FieldHint from './FieldHint';
import { FOCUS_RING_CLASS } from './input-classes';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /**
   * The help line under the label, saying what turning it on does. Drawn as a
   * `FieldHint` and read out with the switch through `aria-describedby`.
   */
  description?: ReactNode;
  /** Forwarded to the help line, for tests that read it. */
  descriptionTestId?: string;
  /** Forwarded to the switch. */
  id?: string;
}

/** An on/off setting: its label, the switch on the right and an optional help line underneath. */
export default function Toggle({ label, checked, onChange, disabled = false, description, descriptionTestId, id }: ToggleProps) {
  const hintId = useId();
  const row = (
    <label
      className={`flex items-center justify-between gap-2 ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <span className={`text-xs text-hs-text-muted${disabled ? ' opacity-60' : ''}`}>{label}</span>
      <Switch
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        describedBy={description ? hintId : undefined}
      />
    </label>
  );
  if (!description) return row;
  return (
    <div className="flex flex-col gap-0.5">
      {row}
      {/* Not dimmed with a switched-off row: the line often says why it is off. */}
      <FieldHint id={hintId} data-testid={descriptionTestId}>
        {description}
      </FieldHint>
    </div>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** The accessible name, for a switch whose label is not the wrapping element. */
  ariaLabel?: string;
  /** Id of the help line that describes the switch. */
  describedBy?: string;
  /** Forwarded as `data-testid`. */
  testId?: string;
  /** For a separate `<label htmlFor>` that names the switch. */
  id?: string;
}

/** The switch on its own, for a row that lays out its own label (a sortable list row). */
export function Switch({ checked, onChange, disabled = false, ariaLabel, describedBy, testId, id }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${FOCUS_RING_CLASS} ${
        checked ? 'bg-hs-accent' : 'bg-hs-border-strong'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );
}
