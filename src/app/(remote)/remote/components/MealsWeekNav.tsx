'use client';

import type { CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { ACCENT_SOFT_BUTTON } from './remote-styles';

interface MealsWeekNavProps {
  /** Either "This week" or the viewed date range */
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
    background: 'transparent', color: 'var(--hs-text-muted)', cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
    opacity: disabled ? 0.35 : 1,
  };
}

/**
 * The week arrows of the Meals tab and the Notes tab's Calendar page. The
 * arrows never move: the way back to today sits beside the label, between
 * them, so a second tap on the next arrow never lands on it.
 */
export default function MealsWeekNav({ weekLabel, isCurrentWeek, navigateWeek, jumpToToday, prevDisabled = false, nextDisabled = false }: MealsWeekNavProps) {
  const t = useTranslate('remote');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => navigateWeek(-1)}
        aria-label={t('mealsTab.weekNav.prevAriaLabel')}
        disabled={prevDisabled}
        className="press-scale-sm"
        style={arrowStyle(prevDisabled)}
      >
        <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
      </button>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--hs-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {weekLabel}
        </span>
        {!isCurrentWeek && (
          <button
            type="button"
            onClick={jumpToToday}
            className="press-scale-sm"
            style={{ ...ACCENT_SOFT_BUTTON, flex: 'none', minHeight: 44, padding: '0 12px', borderRadius: 10, fontSize: 12 }}
          >
            {t('mealsTab.weekNav.todayButton')}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => navigateWeek(1)}
        aria-label={t('mealsTab.weekNav.nextAriaLabel')}
        disabled={nextDisabled}
        className="press-scale-sm"
        style={arrowStyle(nextDisabled)}
      >
        <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
