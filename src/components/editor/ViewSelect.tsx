'use client';

import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import { useTranslate } from '@/i18n';

interface ViewSelectProps<T extends string> {
  label?: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  className?: string;
}

export default function ViewSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  className = INPUT_CLASS,
}: ViewSelectProps<T>) {
  const t = useTranslate('editor');
  const effectiveLabel = label ?? t('viewSelect.defaultLabel');
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-hs-text-muted">{effectiveLabel}</span>
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
