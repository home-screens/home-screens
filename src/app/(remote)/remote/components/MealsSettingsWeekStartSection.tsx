'use client';

import type { MealSettings } from '@/types/config';
import { useTranslate } from '@/i18n';
import { SECTION_HEADING_STYLE } from './meals-shared';

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
                border: isSelected ? '1px solid #f59e0b' : '1px solid var(--hs-border)',
                background: isSelected ? 'rgba(245, 158, 11, 0.12)' : 'var(--hs-bg-panel)',
                color: isSelected ? '#f59e0b' : 'var(--hs-text-muted)',
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
    </section>
  );
}
