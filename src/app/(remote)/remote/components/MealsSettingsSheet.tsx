'use client';

/**
 * Meal-planner settings sheet for /remote.
 *
 * Exposes the *planning* settings that all meal modules share — which slots
 * are enabled, which day starts the week, and optional default serving times
 * per slot. Display-styling settings (view, density, accent color, etc.)
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

interface MealsSettingsSheetProps {
  settings: MealSettings;
  /** Household GlobalSettings.timeFormat — previews what "follow" resolves to */
  globalTimeFormat: TimeFormat;
  /** Returns true on success, false on failure. Caller is responsible for
   *  reverting state on failure; the sheet stays open so the user can retry. */
  onSave: (next: MealSettings) => Promise<boolean>;
  onClose: () => void;
}

export default function MealsSettingsSheet({ settings, globalTimeFormat, onSave, onClose }: MealsSettingsSheetProps) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');

  const { draft, setDraft, toggleSlot, setDefaultTime, saving, saveError, handleSave } =
    useMealsSettingsDraft(settings, onSave, onClose);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
      role="dialog"
      aria-label={t('mealsSettings.ariaLabel')}
    >
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
        }}
      />

      <div
        style={{
          position: 'relative',
          background: 'var(--hs-bg-body)',
          borderRadius: '16px 16px 0 0',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 40px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--hs-text-faint)' }} />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px 12px',
            borderBottom: '1px solid var(--hs-border)',
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--hs-text-primary)', margin: 0 }}>
            {t('mealsSettings.title')}
          </h3>
          <button
            onClick={onClose}
            style={{
              minWidth: 44,
              minHeight: 32,
              padding: '4px 12px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: '1px solid var(--hs-border)',
              background: 'transparent',
              color: 'var(--hs-text-muted)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            aria-label={t('mealsSettings.cancelAriaLabel')}
          >
            {tCore('actions.cancel')}
          </button>
        </div>

        <div style={{ overflow: 'auto', padding: '16px 16px 80px', flex: 1 }}>
          <MealsSettingsSlotsSection
            enabledSlots={draft.enabledSlots}
            onToggleSlot={toggleSlot}
          />

          <MealsSettingsWeekStartSection
            weekStartDay={draft.weekStartDay}
            onChange={(day) => setDraft({ ...draft, weekStartDay: day })}
          />

          <MealsSettingsTimeFormatSection
            timeFormat={draft.timeFormat}
            globalTimeFormat={globalTimeFormat}
            onChange={(fmt) => setDraft({ ...draft, timeFormat: fmt })}
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
            padding: '12px 16px 24px',
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
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%',
              padding: '14px',
              minHeight: 48,
              borderRadius: 10,
              border: 'none',
              background: saving ? 'var(--hs-text-faint)' : '#f59e0b',
              color: '#000',
              fontSize: 15,
              fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              opacity: saving ? 0.8 : 1,
              transition: 'background 0.15s, opacity 0.15s',
            }}
          >
            {saving ? t('mealsSettings.save.saving') : t('mealsSettings.save.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
