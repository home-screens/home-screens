'use client';

import { INPUT_CLASS } from '@/components/editor/PropertyPanel';

interface ViewSelectProps<T extends string> {
  label?: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  className?: string;
}

export default function ViewSelect<T extends string>({
  label = 'View',
  value,
  onChange,
  options,
  className = INPUT_CLASS,
}: ViewSelectProps<T>) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-neutral-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={className}
      >
        {options.map((v) => (
          <option key={v.value} value={v.value}>{v.label}</option>
        ))}
      </select>
    </label>
  );
}
