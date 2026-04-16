import type { ReactNode } from 'react';

interface LabeledFieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export default function LabeledField({ label, children, className }: LabeledFieldProps) {
  return (
    <label className={`flex flex-col gap-0.5${className ? ` ${className}` : ''}`}>
      <span className="text-xs text-hs-text-muted">{label}</span>
      {children}
    </label>
  );
}
