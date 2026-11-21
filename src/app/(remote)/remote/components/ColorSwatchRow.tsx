'use client';

import { MEMBER_COLORS } from '@/components/modules/chore-chart/types';
import { useTranslate } from '@/i18n';
import { swatchStyle } from './remote-styles';

/** The row of colour dots a list picks its colour from. `labelledBy` is the id of the heading above it. */
export default function ColorSwatchRow({ value, onChange, labelledBy }: { value: string; onChange: (color: string) => void; labelledBy: string }) {
  const t = useTranslate('remote');
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} role="group" aria-labelledby={labelledBy}>
      {MEMBER_COLORS.map((c, i) => (
        <button
          key={c}
          type="button"
          aria-label={t('lists.colourSwatch', { number: i + 1 })}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          style={swatchStyle(c, value === c)}
        />
      ))}
    </div>
  );
}
