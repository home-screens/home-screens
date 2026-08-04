'use client';

import type { MealSettings, MealSlotType } from '@/types/config';
import { SLOT_META, formatMealTime, getMealSlotLabelKey, getSlotTimePresets } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import { SECTION_HEADING_STYLE } from './meals-shared';

interface MealsSettingsDefaultTimesSectionProps {
  enabledSlots: MealSlotType[];
  defaultSlotTimes: MealSettings['defaultSlotTimes'];
  timeFormat: MealSettings['timeFormat'];
  onSetTime: (slot: MealSlotType, time: string | undefined) => void;
}

export default function MealsSettingsDefaultTimesSection({
  enabledSlots,
  defaultSlotTimes,
  timeFormat,
  onSetTime,
}: MealsSettingsDefaultTimesSectionProps) {
  const t = useTranslate('remote');
  // Slot labels live in the `modules` namespace under `meal-planner.slots.*`,
  // so we need a second translator to resolve `getMealSlotLabelKey` against
  // the dictionary that already ships those keys.
  const tModules = useTranslate('modules');

  return (
    <section>
      <h4 style={SECTION_HEADING_STYLE}>
        {t('mealsSettings.defaultTimes.heading')}
      </h4>
      <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '0 0 12px' }}>
        {t('mealsSettings.defaultTimes.description')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {enabledSlots.map((slot) => {
          const meta = SLOT_META[slot];
          const currentTime = defaultSlotTimes[slot];
          const presets = getSlotTimePresets(slot);
          const slotLabel = tModules(getMealSlotLabelKey(slot));
          return (
            <div
              key={slot}
              style={{
                padding: 12,
                borderRadius: 10,
                border: '1px solid var(--hs-border)',
                background: 'var(--hs-bg-panel)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: meta.color }}>
                  {slotLabel}
                </span>
                {currentTime && (
                  <button
                    type="button"
                    onClick={() => onSetTime(slot, undefined)}
                    style={{
                      minHeight: 28,
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--hs-border)',
                      background: 'transparent',
                      color: 'var(--hs-text-muted)',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    aria-label={t('mealsSettings.defaultTimes.clearAriaLabel', { name: slotLabel })}
                  >
                    {t('mealsSettings.defaultTimes.clear')}
                  </button>
                )}
              </div>
              <input
                type="time"
                value={currentTime ?? ''}
                onChange={(e) => onSetTime(slot, e.target.value || undefined)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  minHeight: 44,
                  borderRadius: 8,
                  border: '1px solid var(--hs-border)',
                  background: 'var(--hs-bg-body)',
                  color: 'var(--hs-text-primary)',
                  fontSize: 15,
                  fontFamily: 'inherit',
                  colorScheme: 'dark',
                  marginBottom: 8,
                }}
                aria-label={t('mealsSettings.defaultTimes.timeInputAriaLabel', { name: slotLabel })}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {presets.map((preset) => {
                  const isSelected = preset === currentTime;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onSetTime(slot, preset)}
                      style={{
                        padding: '8px',
                        minHeight: 36,
                        borderRadius: 6,
                        border: isSelected ? `1px solid ${meta.color}` : '1px solid var(--hs-border)',
                        background: isSelected ? `${meta.color}15` : 'var(--hs-bg-body)',
                        color: isSelected ? meta.color : 'var(--hs-text-muted)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontVariantNumeric: 'tabular-nums',
                        fontFamily: 'inherit',
                      }}
                    >
                      {formatMealTime(preset, timeFormat)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
