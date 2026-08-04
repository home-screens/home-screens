'use client';

import { useTranslate } from '@/i18n';
import { MEALS_SUB_VIEWS, type MealsSubView } from './meals-shared';

// Keyed by MealsSubView so adding a sub-view is a compile error here, not a
// missing tab at runtime.
const ICONS: Record<MealsSubView, React.ReactNode> = {
  week: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="12" height="11" rx="1.5" /><line x1="1" y1="5.5" x2="13" y2="5.5" /><line x1="4.5" y1="1" x2="4.5" y2="3" /><line x1="9.5" y1="1" x2="9.5" y2="3" />
    </svg>
  ),
  plan: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="3.5" height="3.5" rx="0.5" /><rect x="5.25" y="1" width="3.5" height="3.5" rx="0.5" /><rect x="9.5" y="1" width="3.5" height="3.5" rx="0.5" /><rect x="1" y="5.25" width="3.5" height="3.5" rx="0.5" /><rect x="5.25" y="5.25" width="3.5" height="3.5" rx="0.5" /><rect x="9.5" y="5.25" width="3.5" height="3.5" rx="0.5" /><rect x="1" y="9.5" width="3.5" height="3.5" rx="0.5" /><rect x="5.25" y="9.5" width="3.5" height="3.5" rx="0.5" /><rect x="9.5" y="9.5" width="3.5" height="3.5" rx="0.5" />
    </svg>
  ),
  library: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2 L2 5 L2 12 L7 9.5 L12 12 L12 5 Z" /><line x1="7" y1="2" x2="7" y2="9.5" />
    </svg>
  ),
  grocery: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 1 L3 1 L4.5 9 L11.5 9" /><circle cx="5.5" cy="12" r="1" /><circle cx="10.5" cy="12" r="1" /><path d="M3.5 3.5 L12.5 3.5 L11.5 9 L4.5 9 Z" />
    </svg>
  ),
};

interface MealsSubNavProps {
  subView: MealsSubView;
  setSubView: (v: MealsSubView) => void;
  /** Label for the "week" tab — either "This Week" or the viewed date range */
  weekLabel: string;
}

export default function MealsSubNav({ subView, setSubView, weekLabel }: MealsSubNavProps) {
  const t = useTranslate('remote');

  const labels: Record<MealsSubView, string> = {
    week: weekLabel,
    plan: t('mealsTab.subNav.plan'),
    library: t('mealsTab.subNav.library'),
    grocery: t('mealsTab.subNav.grocery'),
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        padding: 3,
        background: 'var(--hs-bg-panel)',
        borderRadius: 10,
        marginTop: 12,
        marginBottom: 16,
      }}
    >
      {MEALS_SUB_VIEWS.map((view) => {
        return (
          <button
            key={view}
            onClick={() => setSubView(view)}
            style={{
              flex: 1,
              padding: '8px 6px',
              minHeight: 40,
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s',
              background: subView === view ? 'var(--hs-border)' : 'transparent',
              color: subView === view ? 'var(--hs-text-primary)' : 'var(--hs-text-faint)',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
            }}
          >
            {ICONS[view]}
            {labels[view]}
          </button>
        );
      })}
    </div>
  );
}
