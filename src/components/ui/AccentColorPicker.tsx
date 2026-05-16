'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import ColorPicker from './ColorPicker';

interface AccentColorPickerProps {
  value: string;
  onChange: (value: string) => void;
}

const PRESETS = [
  { label: 'None', value: '#000000' },
  { label: 'Purple', value: '#a78bfa' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Cyan', value: '#22d3ee' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Amber', value: '#fbbf24' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Pink', value: '#ec4899' },
  { label: 'Custom', value: '' },
];

export default function AccentColorPicker({ value, onChange }: AccentColorPickerProps) {
  const t = useTranslate('editor');
  const isPreset = PRESETS.some((p) => p.value === value);
  const [showCustom, setShowCustom] = useState(!isPreset && value !== '#000000');
  // Sync showCustom when value changes externally (e.g. undo/redo)
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setShowCustom(!PRESETS.some((p) => p.value === value) && value !== '#000000');
  }

  const selected = showCustom ? '' : value;

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center justify-between gap-2">
        <span className="text-xs text-hs-text-muted">{t('accentColorPicker.label')}</span>
        <div className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded border border-hs-border-strong shrink-0"
            style={{ backgroundColor: value }}
          />
          <select
            value={selected}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') {
                setShowCustom(true);
              } else {
                setShowCustom(false);
                onChange(v);
              }
            }}
            className="px-2 py-1 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-body"
          >
            {PRESETS.map((p) => (
              <option key={p.label} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </label>
      {showCustom && (
        <ColorPicker label={t('accentColorPicker.customColor')} value={value} onChange={onChange} />
      )}
    </div>
  );
}
