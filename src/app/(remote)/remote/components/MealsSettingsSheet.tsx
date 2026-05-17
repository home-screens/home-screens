'use client';

/**
 * Meal-planner settings sheet for /remote.
 *
 * Exposes the *planning* settings that all meal modules share — which slots
 * are enabled, which day starts the week, and optional default serving times
 * per slot. Display-styling settings (view, density, accent color, etc.)
 * stay in the editor; this sheet is purely about meal management.
 */

import { useState, useRef } from 'react';
import type { MealSettings, MealSlotType } from '@/types/config';
import { SLOT_ORDER, SLOT_META, formatMealTime, getMealSlotLabelKey, getSlotTimePresets } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';

interface MealsSettingsSheetProps {
  settings: MealSettings;
  /** Returns true on success, false on failure. Caller is responsible for
   *  reverting state on failure; the sheet stays open so the user can retry. */
  onSave: (next: MealSettings) => Promise<boolean>;
  onClose: () => void;
}

export default function MealsSettingsSheet({ settings, onSave, onClose }: MealsSettingsSheetProps) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  // Slot labels live in the `modules` namespace under `meal-planner.slots.*`,
  // so we need a second translator to resolve `getMealSlotLabelKey` against
  // the dictionary that already ships those keys.
  const tModules = useTranslate('modules');

  // Local working copy so the user can cancel without persisting partial edits.
  // Sync draft ONLY on mount (not on every settings prop change) — otherwise a
  // parent optimistic update during an in-flight save would silently overwrite
  // the user's in-progress edits while the sheet is open.
  const initialSettingsRef = useRef(settings);
  const [draft, setDraft] = useState<MealSettings>(() => initialSettingsRef.current);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggleSlot = (slot: MealSlotType) => {
    const has = draft.enabledSlots.includes(slot);
    const next = has
      ? draft.enabledSlots.filter((s) => s !== slot)
      : [...draft.enabledSlots, slot];
    if (next.length === 0) return; // require at least one
    setDraft({ ...draft, enabledSlots: next });
  };

  const setDefaultTime = (slot: MealSlotType, time: string | undefined) => {
    const nextTimes = { ...draft.defaultSlotTimes };
    if (time) {
      nextTimes[slot] = time;
    } else {
      delete nextTimes[slot];
    }
    setDraft({ ...draft, defaultSlotTimes: nextTimes });
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const ok = await onSave(draft);
      if (ok) {
        onClose();
      } else {
        setSaveError(t('mealsSettings.save.saveFailed'));
      }
    } catch {
      setSaveError(t('mealsSettings.save.networkError'));
    } finally {
      setSaving(false);
    }
  };

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
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
        }}
      />

      {/* Sheet */}
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
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--hs-text-faint)' }} />
        </div>

        {/* Header */}
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

        {/* Body */}
        <div style={{ overflow: 'auto', padding: '16px 16px 80px', flex: 1 }}>
          {/* ── Meal Slots ── */}
          <section style={{ marginBottom: 24 }}>
            <h4
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
                color: 'var(--hs-text-faint)',
                margin: '0 0 8px',
              }}
            >
              {t('mealsSettings.slots.heading')}
            </h4>
            <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '0 0 12px' }}>
              {t('mealsSettings.slots.description')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SLOT_ORDER.map((slot) => {
                const isEnabled = draft.enabledSlots.includes(slot);
                const meta = SLOT_META[slot];
                const slotLabel = tModules(getMealSlotLabelKey(slot));
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => toggleSlot(slot)}
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

          {/* ── Week Start ── */}
          <section style={{ marginBottom: 24 }}>
            <h4
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
                color: 'var(--hs-text-faint)',
                margin: '0 0 8px',
              }}
            >
              {t('mealsSettings.weekStart.heading')}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(['sunday', 'monday'] as const).map((day) => {
                const isSelected = draft.weekStartDay === day;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setDraft({ ...draft, weekStartDay: day })}
                    style={{
                      padding: '12px',
                      minHeight: 48,
                      borderRadius: 10,
                      border: isSelected ? '1px solid #f59e0b' : '1px solid var(--hs-border)',
                      background: isSelected ? 'rgba(245, 158, 11, 0.12)' : 'var(--hs-bg-panel)',
                      color: isSelected ? '#f59e0b' : 'var(--hs-text-muted)',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    aria-pressed={isSelected}
                  >
                    {day === 'sunday'
                      ? t('mealsSettings.weekStart.sunday')
                      : t('mealsSettings.weekStart.monday')}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Time Format ── */}
          <section style={{ marginBottom: 24 }}>
            <h4
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
                color: 'var(--hs-text-faint)',
                margin: '0 0 8px',
              }}
            >
              {t('mealsSettings.timeFormat.heading')}
            </h4>
            <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '0 0 12px' }}>
              {t('mealsSettings.timeFormat.description')}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(['12h', '24h'] as const).map((fmt) => {
                const isSelected = draft.timeFormat === fmt;
                const sample = fmt === '12h' ? '6:30 PM' : '18:30';
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setDraft({ ...draft, timeFormat: fmt })}
                    style={{
                      padding: '12px',
                      minHeight: 56,
                      borderRadius: 10,
                      border: isSelected ? '1px solid #f59e0b' : '1px solid var(--hs-border)',
                      background: isSelected ? 'rgba(245, 158, 11, 0.12)' : 'var(--hs-bg-panel)',
                      color: isSelected ? '#f59e0b' : 'var(--hs-text-muted)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex',
                      flexDirection: 'column' as const,
                      alignItems: 'center',
                      gap: 2,
                    }}
                    aria-pressed={isSelected}
                  >
                    <span style={{ fontSize: 14, fontWeight: 700 }}>
                      {fmt === '12h'
                        ? t('mealsSettings.timeFormat.twelveHourLabel')
                        : t('mealsSettings.timeFormat.twentyFourHourLabel')}
                    </span>
                    <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', opacity: 0.8 }}>{sample}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Default Serving Times ── */}
          <section>
            <h4
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
                color: 'var(--hs-text-faint)',
                margin: '0 0 8px',
              }}
            >
              {t('mealsSettings.defaultTimes.heading')}
            </h4>
            <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '0 0 12px' }}>
              {t('mealsSettings.defaultTimes.description')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {draft.enabledSlots.map((slot) => {
                const meta = SLOT_META[slot];
                const currentTime = draft.defaultSlotTimes[slot];
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
                          onClick={() => setDefaultTime(slot, undefined)}
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
                      onChange={(e) => setDefaultTime(slot, e.target.value || undefined)}
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
                            onClick={() => setDefaultTime(slot, preset)}
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
                            {formatMealTime(preset, draft.timeFormat)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer — sticky save bar */}
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
