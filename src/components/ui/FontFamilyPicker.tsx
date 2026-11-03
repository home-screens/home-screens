'use client';

import { useTranslate } from '@/i18n';
import {
  FONT_CATEGORY_LABELS,
  fontsByCategory,
  fontDefinitionFor,
  type FontCategory,
} from '@/lib/font-registry';
import { INPUT_CLASS } from './input-classes';

interface FontFamilyPickerProps {
  value: string | undefined;
  onChange: (id: string) => void;
  label?: string;
  allowInherit?: boolean;
  inheritLabel?: string;
}

export default function FontFamilyPicker({
  value,
  onChange,
  label,
  allowInherit = false,
  inheritLabel,
}: FontFamilyPickerProps) {
  const t = useTranslate('editor');
  const resolvedLabel = label ?? t('fontFamilyPicker.label');
  const resolvedInheritLabel = inheritLabel ?? t('fontFamilyPicker.inheritLabel');
  const grouped = fontsByCategory();
  // A raw stack the registry does not know shows as Inter, the Style default.
  const selectedDef = allowInherit && !value ? undefined : fontDefinitionFor(value) ?? fontDefinitionFor('inter');
  const selected = selectedDef?.id ?? '';
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-hs-text-muted">{resolvedLabel}</span>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
        style={{ fontFamily: selectedDef?.cssStack }}
      >
        {allowInherit && <option value="">{resolvedInheritLabel}</option>}
        {(Object.keys(grouped) as FontCategory[]).map((cat) => (
          <optgroup key={cat} label={FONT_CATEGORY_LABELS[cat]}>
            {grouped[cat].map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: f.cssStack }}>
                {f.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
