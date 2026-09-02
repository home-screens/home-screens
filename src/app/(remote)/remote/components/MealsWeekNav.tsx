'use client';

import { useTranslate } from '@/i18n';

interface MealsWeekNavProps {
  /** Either "This Week" or the viewed date range */
  weekLabel: string;
  isCurrentWeek: boolean;
  navigateWeek: (direction: -1 | 1) => void;
  jumpToToday: () => void;
}

export default function MealsWeekNav({ weekLabel, isCurrentWeek, navigateWeek, jumpToToday }: MealsWeekNavProps) {
  const t = useTranslate('remote');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <button
        onClick={() => navigateWeek(-1)}
        aria-label={t('mealsTab.weekNav.prevAriaLabel')}
        style={{
          width: 44, height: 44, borderRadius: 10, border: '1px solid var(--hs-border)',
          background: 'transparent', color: 'var(--hs-text-muted)', fontSize: 20, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
        }}
      >
        ‹
      </button>
      <span style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--hs-text-muted)' }}>
        {weekLabel}
      </span>
      <button
        onClick={() => navigateWeek(1)}
        aria-label={t('mealsTab.weekNav.nextAriaLabel')}
        style={{
          width: 44, height: 44, borderRadius: 10, border: '1px solid var(--hs-border)',
          background: 'transparent', color: 'var(--hs-text-muted)', fontSize: 20, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
        }}
      >
        ›
      </button>
      {!isCurrentWeek && (
        <button
          onClick={jumpToToday}
          style={{
            padding: '4px 12px', borderRadius: 6, border: 'none',
            background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {t('mealsTab.weekNav.todayButton')}
        </button>
      )}
    </div>
  );
}
