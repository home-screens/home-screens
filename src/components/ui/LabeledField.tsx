'use client';

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import FieldHint from './FieldHint';

interface LabeledFieldProps {
  label: string;
  children: ReactNode;
  className?: string;
  /**
   * 'div' for blocks whose control must NOT be label-wrapped — e.g. the
   * Combobox: a wrapping label forwards clicks anywhere in the block to the
   * input, which pops the dropdown (and reopens it right after a mouse pick).
   * The caption is still a real <label>: it targets an id injected into the
   * (single-element) child via htmlFor, so caption clicks focus the control
   * and screen readers keep the association.
   */
  as?: 'label' | 'div';
  /**
   * The help line under the control, drawn as a `FieldHint`. A single-element
   * child is pointed at it with `aria-describedby`, so it is read out with
   * the control.
   */
  hint?: ReactNode;
  /** Forwarded to the help line, for tests that read it. */
  hintTestId?: string;
}

export default function LabeledField({ label, children, className, as: Tag = 'label', hint, hintTestId }: LabeledFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const hasHint = hint !== undefined && hint !== null && hint !== false;
  const describedBy = hasHint ? { 'aria-describedby': hintId } : {};
  const hintLine = hasHint ? <FieldHint id={hintId} data-testid={hintTestId}>{hint}</FieldHint> : null;
  const classes = `flex flex-col gap-0.5${className ? ` ${className}` : ''}`;

  if (Tag === 'div') {
    return (
      <div className={classes}>
        <label htmlFor={id} className="text-xs text-hs-text-muted">{label}</label>
        {isValidElement(children)
          ? cloneElement(children as ReactElement<{ id?: string }>, { id, ...describedBy })
          : children}
        {hintLine}
      </div>
    );
  }
  const control = hasHint && isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, describedBy)
    : children;
  if (!hintLine) {
    return (
      <label className={classes}>
        <span className="text-xs text-hs-text-muted">{label}</span>
        {control}
      </label>
    );
  }
  // The hint sits outside the <label> so it is not read as part of the name.
  return (
    <div className={classes}>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">{label}</span>
        {control}
      </label>
      {hintLine}
    </div>
  );
}
