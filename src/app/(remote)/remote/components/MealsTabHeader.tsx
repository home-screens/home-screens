'use client';

import { useFormattingLocale, useTranslate } from '@/i18n';

interface MealsTabHeaderProps {
  onOpenSettings: () => void;
}

export default function MealsTabHeader({ onOpenSettings }: MealsTabHeaderProps) {
  const locale = useFormattingLocale();
  const t = useTranslate('remote');

  return (
    <div style={{ padding: '12px 0 4px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 12, color: 'var(--hs-text-faint)' }}>
          {new Date().toLocaleDateString(locale, { weekday: 'long' })}
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--hs-text-primary)', margin: 0 }}>{t('mealsTab.header')}</h2>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          border: '1px solid var(--hs-border)',
          background: 'var(--hs-bg-panel)',
          color: 'var(--hs-text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'inherit',
        }}
        aria-label={t('mealsTab.settingsButtonAriaLabel')}
        title={t('mealsTab.settingsButtonTitle')}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  );
}
