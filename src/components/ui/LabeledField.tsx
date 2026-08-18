import type { ReactNode } from 'react';

interface LabeledFieldProps {
  label: string;
  children: ReactNode;
  className?: string;
  /**
   * 'div' for blocks whose control must NOT be label-wrapped — e.g. the
   * Combobox: a wrapping label forwards clicks anywhere in the block to the
   * input, which pops the dropdown (and reopens it right after a mouse pick).
   * The control then names itself via its own aria-label.
   */
  as?: 'label' | 'div';
}

export default function LabeledField({ label, children, className, as: Tag = 'label' }: LabeledFieldProps) {
  return (
    <Tag className={`flex flex-col gap-0.5${className ? ` ${className}` : ''}`}>
      <span className="text-xs text-hs-text-muted">{label}</span>
      {children}
    </Tag>
  );
}
