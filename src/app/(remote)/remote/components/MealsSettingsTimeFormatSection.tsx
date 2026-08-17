'use client';

import type { MealSettings, TimeFormat } from '@/types/config';
import { formatMealTime } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import { SECTION_HEADING_STYLE } from './meals-shared';

interface MealsSettingsTimeFormatSectionProps {
  timeFormat: MealSettings['timeFormat'];
  /** Household GlobalSettings.timeFormat — previews what "follow" resolves to */
  globalTimeFormat: TimeFormat;
  onChange: (fmt: MealSettings['timeFormat']) => void;
}

/** Selected/unselected button style pair shared by the follow/12h/24h buttons */
function formatBtnStyle(selected: boolean): React.CSSProperties {
  return {
    padding: '12px',
    minHeight: 56,
    borderRadius: 10,
    border: selected ? '1px solid #f59e0b' : '1px solid var(--hs-border)',
    background: selected ? 'rgba(245, 158, 11, 0.12)' : 'var(--hs-bg-panel)',
    color: selected ? '#f59e0b' : 'var(--hs-text-muted)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
  };
}

export default function MealsSettingsTimeFormatSection({
  timeFormat,
  globalTimeFormat,
  onChange,
}: MealsSettingsTimeFormatSectionProps) {
  const t = useTranslate('remote');

  return (
    <section style={{ marginBottom: 24 }}>
      <h4 style={SECTION_HEADING_STYLE}>
        {t('mealsSettings.timeFormat.heading')}
      </h4>
      <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '0 0 12px' }}>
        {t('mealsSettings.timeFormat.description')}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          style={formatBtnStyle(timeFormat === undefined)}
          aria-pressed={timeFormat === undefined}
        >
          <span style={{ fontSize: 14, fontWeight: 700 }}>{t('mealsSettings.timeFormat.followLabel')}</span>
          <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', opacity: 0.8 }}>
            {formatMealTime('18:30', globalTimeFormat)}
          </span>
        </button>
        {(['12h', '24h'] as const).map((fmt) => {
          const isSelected = timeFormat === fmt;
          const sample = fmt === '12h' ? '6:30 PM' : '18:30';
          return (
            <button
              key={fmt}
              type="button"
              onClick={() => onChange(fmt)}
              style={formatBtnStyle(isSelected)}
              aria-pressed={isSelected}
            >
              <span style={{ fontSize: 14, fontWeight: 700 }}>
                {fmt === '12h'
                  ? t('mealsSettings.timeFormat.twelveHourLabel')
                  : t('mealsSettings.timeFormat.twentyFourHourLabel')}
              </span>
              <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', opacity: 0.8 }}>{sample}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
