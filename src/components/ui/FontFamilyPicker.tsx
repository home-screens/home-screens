'use client';

import {
  FONT_REGISTRY,
  FONT_CATEGORY_LABELS,
  fontsByCategory,
  getFontDefinition,
  getFontDefinitionByStack,
  type FontCategory,
} from '@/lib/font-registry';
import { INPUT_CLASS } from './input-classes';

const LABEL_TO_ID = new Map<string, string>(FONT_REGISTRY.map((f) => [f.label.toLowerCase(), f.id]));

/**
 * Maps a stored fontFamily value to a registry id when possible.
 * Handles legacy values that stored raw CSS stacks (e.g. "Inter, system-ui, sans-serif").
 */
function fontValueToId(stored: string | undefined): string {
  if (!stored) return 'inter';
  const trimmed = stored.trim();
  if (getFontDefinition(trimmed)) return trimmed;
  const byStack = getFontDefinitionByStack(trimmed);
  if (byStack) return byStack.id;
  const firstFamily = trimmed.split(',')[0].trim().replace(/['"]/g, '').toLowerCase();
  return LABEL_TO_ID.get(firstFamily) ?? getFontDefinition(firstFamily)?.id ?? 'inter';
}

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
  label = 'Font Family',
  allowInherit = false,
  inheritLabel = 'Inherit from module',
}: FontFamilyPickerProps) {
  const grouped = fontsByCategory();
  const selected = allowInherit && !value ? '' : fontValueToId(value);
  const selectedDef = selected ? FONT_REGISTRY.find((f) => f.id === selected) : undefined;
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-hs-text-muted">{label}</span>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
        style={{ fontFamily: selectedDef?.cssStack }}
      >
        {allowInherit && <option value="">{inheritLabel}</option>}
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
