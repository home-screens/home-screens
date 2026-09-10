'use client';

import { Plus } from 'lucide-react';
import { MEMBER_COLORS } from '@/components/modules/chore-chart/types';
import { useTranslate } from '@/i18n';
import { LABEL_STYLE } from './chore-form-styles';

export default function MobileColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslate('remote');
  const isPreset = MEMBER_COLORS.some((color) => color === value);
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={LABEL_STYLE}>{t('mobileColorPicker.colorLabel')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {MEMBER_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`${t('mobileColorPicker.colorLabel')}: ${c}`}
            aria-pressed={value === c}
            className="press-scale-xs"
            onClick={() => onChange(c)}
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: c,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s',
              outline: value === c ? '3px solid var(--hs-text-primary)' : 'none',
              outlineOffset: 3,
            }}
          />
        ))}
        <label
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            border: !isPreset
              ? '3px solid var(--hs-text-primary)'
              : '2px dashed var(--hs-border-strong)',
            backgroundColor: !isPreset ? value : 'transparent',
            position: 'relative',
          }}
          title={t('mobileColorPicker.customColorTitle')}
        >
          {isPreset && (
            <Plus size={16} color="var(--hs-text-faint)" />
          )}
          <input
            type="color"
            aria-label={t('mobileColorPicker.customColorTitle')}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ opacity: 0, width: '100%', height: '100%', inset: 0, position: 'absolute', cursor: 'pointer' }}
          />
        </label>
      </div>
    </div>
  );
}
