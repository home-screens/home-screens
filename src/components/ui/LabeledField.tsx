'use client';

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

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
}

export default function LabeledField({ label, children, className, as: Tag = 'label' }: LabeledFieldProps) {
  const id = useId();
  if (Tag === 'div') {
    return (
      <div className={`flex flex-col gap-0.5${className ? ` ${className}` : ''}`}>
        <label htmlFor={id} className="text-xs text-hs-text-muted">{label}</label>
        {isValidElement(children)
          ? cloneElement(children as ReactElement<{ id?: string }>, { id })
          : children}
      </div>
    );
  }
  return (
    <label className={`flex flex-col gap-0.5${className ? ` ${className}` : ''}`}>
      <span className="text-xs text-hs-text-muted">{label}</span>
      {children}
    </label>
  );
}
