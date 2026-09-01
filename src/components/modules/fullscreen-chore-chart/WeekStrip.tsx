'use client';

import type { ChoreMember } from '@/types/config';
import type { WeekDayData } from '@/components/modules/chore-chart/types';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';

interface WeekStripProps {
  /** Canvas scale: 1 = the sizes authored for a 1080-wide panel. */
  k: number;
  weekData: WeekDayData[];
  members: ChoreMember[];
}

/**
 * The household week strip (`weekProgress: 'strip'`): seven cells, each
 * "stars earned / members" for that day. An aggregate on purpose — one row
 * per member stops fitting past three kids, and this house has five.
 */
export default function WeekStrip({ k, weekData, members }: WeekStripProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const todayIndex = weekData.findIndex((d) => d.isToday);

  return (
    <div data-testid="fcc-week-strip" style={{ padding: `${20 * k}px 0 ${8 * k}px` }}>
      <div style={{ fontSize: 18 * k, fontWeight: 700, color: 'var(--fcc-text-3)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 * k }}>
        {t('fullscreen-chore-chart.thisWeek')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 10 * k }}>
        {weekData.map((day, i) => {
          const [y, m, d] = day.date.split('-').map(Number);
          const dayDate = new Date(y, (m ?? 1) - 1, d ?? 1);
          const future = todayIndex >= 0 && i > todayIndex;
          const earned = members.reduce((n, member) => n + (day.memberStars[member.id] ? 1 : 0), 0);
          return (
            <div
              key={day.date}
              style={{
                background: 'var(--fcc-surface)',
                borderRadius: 14 * k,
                padding: `${12 * k}px 0`,
                textAlign: 'center',
                boxShadow: 'var(--fcc-card-shadow)',
                outline: day.isToday ? '3px solid var(--fcc-accent)' : undefined,
                outlineOffset: -1,
              }}
            >
              <div style={{ fontSize: 18 * k, fontWeight: 700, letterSpacing: '0.08em', color: day.isToday ? 'var(--fcc-accent)' : 'var(--fcc-text-3)' }}>
                {formatDateSync(dayDate, 'EEE', { locale })}
              </div>
              <div style={{ fontSize: 30 * k, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 4 * k, color: 'var(--fcc-text)' }}>
                {future ? '–' : (
                  <>
                    {earned}
                    <span style={{ fontSize: 18 * k, color: 'var(--fcc-text-3)', fontWeight: 600 }}>/{members.length}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
