'use client';

import type { MealSlotType } from '@/types/config';
import { SLOT_ORDER, SLOT_META, getMealSlotLabelKey } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import { SECTION_HEADING_STYLE } from './meals-shared';

interface MealsSettingsSlotsSectionProps {
  enabledSlots: MealSlotType[];
  onToggleSlot: (slot: MealSlotType) => void;
}

export default function MealsSettingsSlotsSection({ enabledSlots, onToggleSlot }: MealsSettingsSlotsSectionProps) {
  const t = useTranslate('remote');
  // Slot labels live in the `modules` namespace under `meal-planner.slots.*`,
  // so we need a second translator to resolve `getMealSlotLabelKey` against
  // the dictionary that already ships those keys.
  const tModules = useTranslate('modules');

  return (
    <section style={{ marginBottom: 24 }}>
      <h4 style={SECTION_HEADING_STYLE}>
        {t('mealsSettings.slots.heading')}
      </h4>
      <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '0 0 12px' }}>
        {t('mealsSettings.slots.description')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {SLOT_ORDER.map((slot) => {
          const isEnabled = enabledSlots.includes(slot);
          const meta = SLOT_META[slot];
          const slotLabel = tModules(getMealSlotLabelKey(slot));
          return (
            <button
              key={slot}
              type="button"
              onClick={() => onToggleSlot(slot)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                minHeight: 50,
                borderRadius: 10,
                border: isEnabled
                  ? `1px solid ${meta.color}40`
                  : '1px solid var(--hs-border)',
                background: isEnabled ? `${meta.color}12` : 'var(--hs-bg-panel)',
                color: 'inherit',
                cursor: 'pointer',
                textAlign: 'left' as const,
                fontFamily: 'inherit',
              }}
              aria-pressed={isEnabled}
              aria-label={
                isEnabled
                  ? t('mealsSettings.slots.toggleAriaLabelEnabled', { label: slotLabel })
                  : t('mealsSettings.slots.toggleAriaLabelDisabled', { label: slotLabel })
              }
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  border: `2px solid ${isEnabled ? meta.color : 'var(--hs-text-faint)'}`,
                  background: isEnabled ? meta.color : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {isEnabled && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--hs-text-primary)' }}>
                {slotLabel}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
