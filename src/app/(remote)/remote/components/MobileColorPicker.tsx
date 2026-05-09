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
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={LABEL_STYLE}>{t('mobileColorPicker.colorLabel')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {MEMBER_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className="press-scale-xs"
            onClick={() => onChange(c)}
            style={{
              width: 44,
              height: 44,
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
            width: 44,
            height: 44,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            border: !MEMBER_COLORS.includes(value)
              ? '3px solid var(--hs-text-primary)'
              : '2px dashed var(--hs-border-strong)',
            backgroundColor: !MEMBER_COLORS.includes(value) ? value : 'transparent',
            position: 'relative',
          }}
          title={t('mobileColorPicker.customColorTitle')}
        >
          {MEMBER_COLORS.includes(value) && (
            <Plus size={16} color="var(--hs-text-faint)" />
          )}
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
          />
        </label>
      </div>
    </div>
  );
}
