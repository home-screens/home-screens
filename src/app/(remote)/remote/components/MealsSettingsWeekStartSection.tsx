'use client';

import type { MealSettings } from '@/types/config';
import { useTranslate } from '@/i18n';
import { SECTION_HEADING_STYLE } from './meals-shared';
import { selectedPillStyle } from './chore-form-styles';

interface MealsSettingsWeekStartSectionProps {
  weekStartDay: MealSettings['weekStartDay'];
  onChange: (day: MealSettings['weekStartDay']) => void;
}

export default function MealsSettingsWeekStartSection({ weekStartDay, onChange }: MealsSettingsWeekStartSectionProps) {
  const t = useTranslate('remote');

  return (
    <section style={{ marginBottom: 24 }}>
      <h4 style={SECTION_HEADING_STYLE}>
        {t('mealsSettings.weekStart.heading')}
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(['sunday', 'monday'] as const).map((day) => {
          const isSelected = weekStartDay === day;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onChange(day)}
              style={{
                padding: '12px',
                minHeight: 48,
                borderRadius: 10,
                ...selectedPillStyle(isSelected, 'var(--hs-text-muted)'),
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              aria-pressed={isSelected}
            >
              {day === 'sunday'
                ? t('mealsSettings.weekStart.sunday')
                : t('mealsSettings.weekStart.monday')}
            </button>
          );
        })}
      </div>
      {/* The calendars keep their own first day, and on one wall the two
          weeks sit side by side: say whose week this is. */}
      <p style={{ margin: '8px 2px 0', fontSize: 13, lineHeight: 1.4, color: 'var(--hs-text-muted)' }}>
        {t('mealsSettings.weekStart.hint')}
      </p>
    </section>
  );
}
