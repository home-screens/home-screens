'use client';

/**
 * Meal-planner settings sheet for /remote.
 *
 * Exposes the *planning* settings that all meal modules share: where the
 * plan lives (Home Screens or Mealie), which slots are enabled, which day
 * starts the week, and optional default serving times per slot. Display-styling settings (view, density, accent color, etc.)
 * stay in the editor; this sheet is purely about meal management.
 */

import type { MealSettings, TimeFormat } from '@/types/config';
import { resolveMealTimeFormat } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import { useMealsSettingsDraft } from '../hooks/useMealsSettingsDraft';
import MealsSettingsSlotsSection from './MealsSettingsSlotsSection';
import MealsSettingsWeekStartSection from './MealsSettingsWeekStartSection';
import MealsSettingsTimeFormatSection from './MealsSettingsTimeFormatSection';
import MealsSettingsDefaultTimesSection from './MealsSettingsDefaultTimesSection';
import MealsSettingsPlanSourceSection from './MealsSettingsPlanSourceSection';
import PrimaryButton from './PrimaryButton';
import TallSheet from './TallSheet';

interface MealsSettingsSheetProps {
  settings: MealSettings;
  /** Household GlobalSettings.timeFormat — previews what "follow" resolves to */
  globalTimeFormat: TimeFormat;
  /** Mealie's address and key are saved, so the plan can be switched to it. */
  mealieConnected: boolean;
  /** Returns true on success, false on failure. Caller is responsible for
   *  reverting state on failure; the sheet stays open so the user can retry. */
  onSave: (next: MealSettings) => Promise<boolean>;
  onClose: () => void;
}

export default function MealsSettingsSheet({ settings, globalTimeFormat, mealieConnected, onSave, onClose }: MealsSettingsSheetProps) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');

  const {
    draft, toggleSlot, setDefaultTime, setWeekStartDay, setTimeFormat, setPlanSource,
    saving, saveError, handleSave,
  } = useMealsSettingsDraft(settings, onSave, onClose);

  return (
    <TallSheet label={t('mealsSettings.ariaLabel')} title={t('mealsSettings.title')} onClose={onClose}>
      <div style={{ overflow: 'auto', padding: '16px 16px 80px', flex: 1 }}>
        <MealsSettingsPlanSourceSection
          planSource={draft.planSource}
          savedPlanSource={settings.planSource}
          mealieConnected={mealieConnected}
          onChange={setPlanSource}
        />

        <MealsSettingsSlotsSection
          enabledSlots={draft.enabledSlots}
          onToggleSlot={toggleSlot}
        />

        <MealsSettingsWeekStartSection
          weekStartDay={draft.weekStartDay}
          onChange={setWeekStartDay}
        />

        <MealsSettingsTimeFormatSection
          timeFormat={draft.timeFormat}
          globalTimeFormat={globalTimeFormat}
          onChange={setTimeFormat}
        />

        <MealsSettingsDefaultTimesSection
          enabledSlots={draft.enabledSlots}
          defaultSlotTimes={draft.defaultSlotTimes}
          timeFormat={resolveMealTimeFormat(draft, globalTimeFormat)}
          onSetTime={setDefaultTime}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 16px',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          background: 'linear-gradient(to top, var(--hs-bg-body) 60%, transparent)',
          borderTop: '1px solid var(--hs-border)',
        }}
      >
        {saveError && (
          <div
            style={{
              marginBottom: 8,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'color-mix(in srgb, var(--hs-danger) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--hs-danger) 30%, transparent)',
              color: 'var(--hs-danger)',
              fontSize: 12,
              fontWeight: 500,
            }}
            role="alert"
          >
            {saveError}
          </div>
        )}
        <PrimaryButton onClick={handleSave} busy={saving} style={{ marginTop: 0 }}>
          {tCore('actions.save')}
        </PrimaryButton>
      </div>
    </TallSheet>
  );
}
