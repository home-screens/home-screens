'use client';

import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import { useTranslate } from '@/i18n';

interface ViewSelectProps<T extends string> {
  label?: string;
  value: T;
  onChange: (value: T) => void;
  /** `group` puts options under an `<optgroup>`; groups appear in first-seen order, ungrouped options first. */
  options: ReadonlyArray<{ value: T; label: string; group?: string }>;
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
        {options.filter((v) => !v.group).map((v) => (
          <option key={v.value} value={v.value}>{v.label}</option>
        ))}
        {[...new Set(options.map((v) => v.group).filter((g): g is string => !!g))].map((group) => (
          <optgroup key={group} label={group}>
            {options.filter((v) => v.group === group).map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
