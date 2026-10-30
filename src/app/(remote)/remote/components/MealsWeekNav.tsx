'use client';

import type { CSSProperties } from 'react';
import { useTranslate } from '@/i18n';

interface MealsWeekNavProps {
  /** Either "This Week" or the viewed date range */
  weekLabel: string;
  isCurrentWeek: boolean;
  navigateWeek: (direction: -1 | 1) => void;
  jumpToToday: () => void;
  /** No going back from here (the Notes tab's Calendar page starts today). */
  prevDisabled?: boolean;
  /** No going further (the Notes tab's Calendar page ends a year out). */
  nextDisabled?: boolean;
}

function arrowStyle(disabled: boolean): CSSProperties {
  return {
    width: 44, height: 44, flex: 'none', borderRadius: 10, border: '1px solid var(--hs-border)',
    background: 'transparent', color: 'var(--hs-text-muted)', fontSize: 20, cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
    opacity: disabled ? 0.35 : 1,
  };
}

/**
 * The week arrows of the Meals tab and the Notes tab's Calendar page. The
 * arrows never move: the way back to today sits beside the label, between
 * them, so a second tap on › never lands on it.
 */
export default function MealsWeekNav({ weekLabel, isCurrentWeek, navigateWeek, jumpToToday, prevDisabled = false, nextDisabled = false }: MealsWeekNavProps) {
  const t = useTranslate('remote');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <button
        onClick={() => navigateWeek(-1)}
        aria-label={t('mealsTab.weekNav.prevAriaLabel')}
        disabled={prevDisabled}
        style={arrowStyle(prevDisabled)}
      >
        ‹
      </button>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--hs-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {weekLabel}
        </span>
        {!isCurrentWeek && (
          <button
            onClick={jumpToToday}
            style={{
              flex: 'none', minHeight: 44, padding: '0 12px', borderRadius: 10, border: 'none',
              background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('mealsTab.weekNav.todayButton')}
          </button>
        )}
      </div>
      <button
        onClick={() => navigateWeek(1)}
        aria-label={t('mealsTab.weekNav.nextAriaLabel')}
        disabled={nextDisabled}
        style={arrowStyle(nextDisabled)}
      >
        ›
      </button>
    </div>
  );
}
