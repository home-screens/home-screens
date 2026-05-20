'use client';

import React from 'react';
import { Star } from 'lucide-react';
import type { ChoreMember } from '@/types/config';
import type { WeekDayData } from '@/components/modules/chore-chart/types';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';

interface StarChartProps {
  chartHeight: number;
  weekData: WeekDayData[];
  members: ChoreMember[];
}

export default function StarChart({ chartHeight, weekData, members }: StarChartProps) {
  const nameWidth = chartHeight * 0.55;
  const starSize = chartHeight * 0.14;
  const labelSize = chartHeight * 0.1;
  const t = useTranslate('modules');
  const locale = useFormattingLocale();

  return (
    <div style={{ padding: `${chartHeight * 0.1}px 0` }}>
      <div style={{ fontSize: labelSize, fontWeight: 700, color: 'var(--fcc-text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: chartHeight * 0.08 }}>
        {t('fullscreen-chore-chart.thisWeek')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `${nameWidth}px repeat(7, 1fr)`, gap: 1, alignItems: 'center' }}>
        {/* Day headers */}
        <div />
        {weekData.map((day) => {
          const [y, m, d] = day.date.split('-').map(Number);
          const dayDate = new Date(y, (m ?? 1) - 1, d ?? 1);
          return (
            <div key={day.date} style={{ fontSize: labelSize * 0.9, fontWeight: 600, color: day.isToday ? 'var(--fcc-accent)' : 'var(--fcc-text-3)', textAlign: 'center' }}>
              {formatDateSync(dayDate, 'EEE', { locale })}
            </div>
          );
        })}
        {/* Member rows */}
        {members.map((member) => (
          <React.Fragment key={member.id}>
            <div style={{ fontSize: labelSize, fontWeight: 500, color: 'var(--fcc-text-2)' }}>
              {member.name}
            </div>
            {weekData.map((day) => {
              const earned = day.memberStars[member.id];
              return (
                <div key={day.date} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: starSize * 1.5 }}>
                  <Star
                    size={starSize}
                    color={earned ? member.color : 'var(--fcc-text-3)'}
                    fill={earned ? member.color : 'none'}
                    strokeWidth={earned ? 0 : 1.5}
                  />
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
