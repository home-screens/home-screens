'use client';

import React from 'react';
import { Star } from 'lucide-react';
import type { ChoreMember } from '@/types/config';
import type { WeekDayData } from '@/components/modules/chore-chart/types';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';

interface StarChartProps {
  /** Canvas scale: 1 = the sizes authored for a 1080-wide panel. */
  k: number;
  weekData: WeekDayData[];
  members: ChoreMember[];
}

/**
 * The per-member week grid (`weekProgress: 'grid'`): one row per member,
 * one star per day. Authored so a name reads from across the room (24px
 * names, 30px stars on the standard kiosk); it costs list height, which is
 * why it is an option rather than the default.
 */
export default function StarChart({ k, weekData, members }: StarChartProps) {
  const nameWidth = 170 * k;
  const starSize = 30 * k;
  const nameSize = 24 * k;
  const daySize = 19 * k;
  const labelSize = 18 * k;
  const t = useTranslate('modules');
  const locale = useFormattingLocale();

  return (
    <div data-testid="fcc-week-grid" style={{ padding: `${20 * k}px 0 ${10 * k}px` }}>
      <div style={{ fontSize: labelSize, fontWeight: 700, color: 'var(--fcc-text-3)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 * k }}>
        {t('fullscreen-chore-chart.thisWeek')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `${nameWidth}px repeat(7, 1fr)`, rowGap: 8 * k, alignItems: 'center' }}>
        <div />
        {weekData.map((day) => {
          const [y, m, d] = day.date.split('-').map(Number);
          const dayDate = new Date(y, (m ?? 1) - 1, d ?? 1);
          return (
            <div key={day.date} style={{ fontSize: daySize, fontWeight: 700, letterSpacing: '0.06em', color: day.isToday ? 'var(--fcc-accent)' : 'var(--fcc-text-3)', textAlign: 'center' }}>
              {formatDateSync(dayDate, 'EEE', { locale })}
            </div>
          );
        })}
        {members.map((member) => (
          <React.Fragment key={member.id}>
            <div style={{ fontSize: nameSize, fontWeight: 600, color: 'var(--fcc-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 12 * k }}>
              {member.name}
            </div>
            {weekData.map((day) => {
              const earned = day.memberStars[member.id];
              return (
                <div key={day.date} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: starSize * 1.2 }}>
                  <Star
                    size={starSize}
                    color={earned ? member.color : 'var(--fcc-border)'}
                    fill={earned ? member.color : 'var(--fcc-border)'}
                    strokeWidth={0}
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
