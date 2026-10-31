'use client';

import { useEffect, useState } from 'react';
import { CookingPot, Smartphone } from 'lucide-react';
import type { MealPlanSource } from '@/types/config';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import { SECTION_HEADING_STYLE } from './meals-shared';

interface MealsSettingsPlanSourceSectionProps {
  /** The sheet's draft: Mealie, or unset for Home Screens. */
  planSource: MealPlanSource | undefined;
  /** Where the plan lives now, before Save. */
  savedPlanSource: MealPlanSource | undefined;
  /** Mealie's address and key are saved on the hub. */
  mealieConnected: boolean;
  onChange: (source: MealPlanSource | undefined) => void;
}

/**
 * Whose household's plan Mealie would show, for "Mealie is connected to the
 * Family household". Asked once as the sheet opens; the line reads without a
 * name when Mealie cannot say.
 */
function useMealieHousehold(enabled: boolean): string | null {
  const [household, setHousehold] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    editorFetch('/api/mealie/validate')
      .then((res) => (res.ok ? res.json() : null))
      .then((d: { ok?: boolean; household?: unknown } | null) => {
        if (live && d?.ok && typeof d.household === 'string' && d.household.trim()) setHousehold(d.household.trim());
      })
      .catch(() => { /* the line reads without a name */ });
    return () => { live = false; };
  }, [enabled]);
  return household;
}

/**
 * Where the family's meal plan lives: Home Screens, or Mealie. First in the
 * sheet because it changes the most. Mealie can be chosen once the computer
 * has connected it (Settings > API keys); it takes effect on Save, like the
 * rest of the sheet.
 */
export default function MealsSettingsPlanSourceSection({ planSource, savedPlanSource, mealieConnected, onChange }: MealsSettingsPlanSourceSectionProps) {
  const t = useTranslate('remote');
  const household = useMealieHousehold(mealieConnected);
  const onMealie = planSource === 'mealie';
  // A Mealie that was disconnected after the switch can still be switched off.
  const mealieOff = !mealieConnected && !onMealie;

  const option = (selected: boolean, disabled: boolean) => ({
    padding: 12,
    minHeight: 48,
    borderRadius: 10,
    border: selected ? '1px solid #f59e0b' : '1px solid var(--hs-border)',
    background: selected ? 'rgba(245, 158, 11, 0.12)' : 'var(--hs-bg-panel)',
    color: selected ? '#f59e0b' : 'var(--hs-text-muted)',
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    textAlign: 'center' as const,
    opacity: disabled ? 0.4 : 1,
  });

  const noteStyle = { margin: '10px 0 0', fontSize: 13, color: 'var(--hs-text-muted)', lineHeight: '19px' };
  // A choice not saved yet says what Save will do; nothing changes before then.
  const switching = planSource !== savedPlanSource;
  let note: React.ReactNode;
  if (switching) {
    note = <p style={noteStyle}>{t(onMealie ? 'mealsSettings.planSource.switchingToMealieNote' : 'mealsSettings.planSource.switchingToHomeNote')}</p>;
  } else if (onMealie) {
    note = <p style={noteStyle}>{t('mealsSettings.planSource.onNote')}</p>;
  } else if (mealieConnected) {
    note = (
      <p style={noteStyle}>
        {household ? t('mealsSettings.planSource.connectedNote', { household }) : t('mealsSettings.planSource.connectedNoteNoName')}
      </p>
    );
  } else {
    note = (
      <p style={{ margin: '10px 0 0', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--hs-text-faint)', lineHeight: '18px' }}>
        <Smartphone size={15} strokeWidth={2} aria-hidden style={{ marginTop: 1, flex: 'none' }} />
        {t('mealsSettings.planSource.notConnectedNote')}
      </p>
    );
  }

  return (
    <section style={{ marginBottom: 24 }} data-testid="meals-plan-source">
      <h4 style={SECTION_HEADING_STYLE}>{t('mealsSettings.planSource.heading')}</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button type="button" onClick={() => onChange(undefined)} aria-pressed={!onMealie} style={option(!onMealie, false)}>
          {t('mealsSettings.planSource.homeScreens')}
        </button>
        <button
          type="button"
          onClick={() => onChange('mealie')}
          aria-pressed={onMealie}
          disabled={mealieOff}
          style={option(onMealie, mealieOff)}
        >
          <CookingPot size={16} strokeWidth={2} aria-hidden />
          {t('mealsSettings.planSource.mealie')}
        </button>
      </div>
      {note}
    </section>
  );
}
