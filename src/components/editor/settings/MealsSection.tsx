'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import {
  SLOT_ORDER,
  SLOT_META,
  DEFAULT_MEAL_SETTINGS,
  formatMealTime,
  getMealSlotLabelKey,
  getSlotTimePresets,
  normalizeMealSettings,
  resolveMealTimeFormat,
} from '@/lib/meal-constants';
import { displayCache } from '@/lib/display-cache';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import type { MealSettings, MealSlotType, TimeFormat } from '@/types/config';

/**
 * Editor settings page section for meal-planner shared settings.
 *
 * Edits the same `MealSettings` block in `data/meals.json` that the /remote
 * MealsSettingsSheet edits. Both surfaces hit the same PUT /api/meals/data
 * endpoint so they stay perfectly in sync.
 *
 * This is a "self-saving" section — it persists its own changes via the API
 * rather than batching with the parent settings page's global Save button,
 * because the meal settings live in `data/meals.json`, not `data/config.json`.
 */

// kind drives styling/role explicitly — don't sniff English prefixes from message.
// In-flight is tracked separately via a `saving: boolean` and drives its own
// indicator; this status object only carries the terminal success/error
// message that lingers after the PUT settles.
type SaveStatusKind = 'success' | 'error';
interface SaveStatus {
  message: string;
  kind: SaveStatusKind;
}

export default function MealsSection() {
  const t = useTranslate('editor');
  // Slot labels live in the `modules` namespace under `meal-planner.slots.*`,
  // so we need a second translator to resolve `getMealSlotLabelKey` against
  // the dictionary that already ships those keys (Step 4 / task 6.1).
  const tModules = useTranslate('modules');
  const tCore = useTranslate('core');
  // Household GlobalSettings.timeFormat from config.json — what "follow global"
  // resolves to. Read from the editor store so the page reflects the unsaved
  // draft while the user edits it.
  const globalTf = useEditorStore((s) => s.config?.settings?.timeFormat);

  const [settings, setSettings] = useState<MealSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SaveStatus | null>(null);
  const saveMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic counter for in-flight persist requests. Used to discard
  // out-of-order responses — when a user toggles two fields rapidly, only the
  // latest request's response should land in state. Without this, an older
  // (slower) PUT response could overwrite a newer (faster) one and silently
  // revert the user's most recent click.
  const persistReqIdRef = useRef(0);
  // Mount guard — gates state setters so a PUT still in flight when the user
  // navigates away doesn't try to update an unmounted component.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  /** True if this request is still the latest AND the component is still mounted */
  const stillCurrent = useCallback((myReqId: number) => {
    return isMountedRef.current && myReqId === persistReqIdRef.current;
  }, []);

  // ── Fetch on mount ──

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await editorFetch('/api/meals/data');
        if (!res.ok) {
          if (!cancelled) setStatus({ message: t('settings.mealsPage.status.loadFailed'), kind: 'error' });
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setSettings(normalizeMealSettings(data.settings));
      } catch {
        if (!cancelled) setStatus({ message: t('settings.mealsPage.status.networkLoad'), kind: 'error' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // t is stable across renders for the same locale; intentionally only run on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist a settings change ──

  /**
   * Persist a settings change optimistically. The caller is expected to have
   * already applied `next` to local state; `prev` is the pre-update value used
   * to roll back if the PUT fails (or the network errors).
   *
   * Rollback is gated by `stillCurrent` so a failed request that has already
   * been superseded by a newer successful request does NOT revert the newer
   * state. That would be the classic "A fails after B succeeds → B's work
   * disappears" bug.
   */
  const persist = useCallback(async (next: MealSettings, prev: MealSettings): Promise<boolean> => {
    const myReqId = ++persistReqIdRef.current;
    setSaving(true);
    setStatus(null);
    try {
      // Settings-only PUT — the API now preserves savedMeals/plan/groceryChecked
      // when those fields are omitted from the body, so we don't have to GET
      // first or round-trip meal data. This eliminates the cross-surface clobber
      // race where a /remote meal write between our GET and PUT would be lost.
      const putRes = await editorFetch('/api/meals/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: next }),
      });
      // Discard if a newer request superseded us (or if we unmounted) — even
      // if our PUT succeeded, landing its response in state would clobber
      // whatever the newer request set, or touch an unmounted component.
      if (!stillCurrent(myReqId)) return putRes.ok;
      if (!putRes.ok) {
        const body = await putRes.json().catch(() => ({}));
        // Re-check AFTER awaiting the json parse — a newer request could
        // have completed while we awaited. Previously this branch set the
        // error unconditionally, which overwrote a newer success's "Saved"
        // indicator with a phantom failure.
        if (!stillCurrent(myReqId)) return false;
        setStatus({
          message: body.error ?? t('settings.mealsPage.status.saveFailed'),
          kind: 'error',
        });
        setSettings(prev); // rollback optimistic update
        return false;
      }
      const body = await putRes.json();
      if (!stillCurrent(myReqId)) return true;
      setSettings(normalizeMealSettings(body.settings));
      setStatus({ message: t('common.saved'), kind: 'success' });
      if (saveMsgTimerRef.current) clearTimeout(saveMsgTimerRef.current);
      saveMsgTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setStatus(null);
      }, 2500);
      // Notify the canvas preview (and any display polling this endpoint)
      // to refetch so the newly-saved settings propagate without waiting
      // for the next poll interval.
      displayCache.invalidate('/api/meals/data');
      return true;
    } catch {
      if (!stillCurrent(myReqId)) return false;
      setStatus({ message: t('settings.mealsPage.status.networkSave'), kind: 'error' });
      setSettings(prev); // rollback optimistic update
      return false;
    } finally {
      // Only clear the saving indicator if we're still the latest request
      // AND still mounted. Otherwise the newer request will manage it.
      if (stillCurrent(myReqId)) setSaving(false);
    }
  }, [stillCurrent, t]);

  useEffect(() => {
    return () => { if (saveMsgTimerRef.current) clearTimeout(saveMsgTimerRef.current); };
  }, []);

  // ── Field handlers — each immediately persists ──

  const toggleSlot = useCallback((slot: MealSlotType) => {
    if (!settings) return;
    const has = settings.enabledSlots.includes(slot);
    const next = has
      ? settings.enabledSlots.filter((s) => s !== slot)
      : [...settings.enabledSlots, slot];
    if (next.length === 0) return; // require at least one
    const updated: MealSettings = { ...settings, enabledSlots: next };
    setSettings(updated);
    persist(updated, settings);
  }, [settings, persist]);

  const setWeekStartDay = useCallback((day: 'sunday' | 'monday') => {
    if (!settings) return;
    const updated: MealSettings = { ...settings, weekStartDay: day };
    setSettings(updated);
    persist(updated, settings);
  }, [settings, persist]);

  const setTimeFormat = useCallback((fmt: TimeFormat | undefined) => {
    if (!settings) return;
    // undefined = follow global — the explicit undefined overwrites any stored
    // override here, then serializes out of the PUT body so the key is gone
    // server-side too (spreading an empty object would have kept the old key).
    const updated: MealSettings = { ...settings, timeFormat: fmt };
    setSettings(updated);
    persist(updated, settings);
  }, [settings, persist]);

  const setDefaultTime = useCallback((slot: MealSlotType, time: string | undefined) => {
    if (!settings) return;
    const nextTimes = { ...settings.defaultSlotTimes };
    if (time) {
      nextTimes[slot] = time;
    } else {
      delete nextTimes[slot];
    }
    const updated: MealSettings = { ...settings, defaultSlotTimes: nextTimes };
    setSettings(updated);
    persist(updated, settings);
  }, [settings, persist]);

  // ── Render ──

  if (loading) {
    return (
      <div className="text-sm text-hs-text-faint">{t('settings.mealsPage.loading')}</div>
    );
  }

  if (!settings) {
    return (
      <div className="text-sm text-hs-danger">
        {status?.message ?? t('settings.mealsPage.status.unableToLoad')}
      </div>
    );
  }

  // Effective format: explicit meal override, else the household global, else 12h
  const tf = resolveMealTimeFormat(settings, globalTf);

  return (
    <div className="space-y-6">
      {/* Status row — mirrors the parent page's "Saved" indicator */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-hs-text-faint leading-relaxed">
          {t('settings.mealsPage.intro.part1')}
          <a href="/remote" className="text-hs-accent hover:text-hs-accent-hover underline">
            {t('settings.mealsPage.intro.remoteLinkLabel')}
          </a>
          {t('settings.mealsPage.intro.part2')}
        </p>
        <div className="flex items-center gap-2 text-xs">
          {saving && <span className="text-hs-text-faint">{tCore('status.saving')}</span>}
          {!saving && status && status.kind === 'success' && (
            <span className="text-hs-success">{status.message}</span>
          )}
          {!saving && status && status.kind === 'error' && (
            <span className="text-hs-danger">{status.message}</span>
          )}
        </div>
      </div>

      {/* ── Meal Slots ── */}
      <section data-field-id="meals.enabledSlots">
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.mealsPage.slots.heading')}
        </h3>
        <p className="text-xs text-hs-text-faint mb-3">
          {t('settings.mealsPage.slots.description')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SLOT_ORDER.map((slot) => {
            const isEnabled = settings.enabledSlots.includes(slot);
            const meta = SLOT_META[slot];
            const slotLabel = tModules(getMealSlotLabelKey(slot));
            return (
              <button
                key={slot}
                type="button"
                onClick={() => toggleSlot(slot)}
                disabled={saving}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-left transition ${
                  isEnabled
                    ? 'bg-hs-card border-hs-border-strong'
                    : 'bg-hs-panel border-hs-border-strong hover:border-hs-text-faint'
                }`}
                aria-pressed={isEnabled}
              >
                <div
                  className="w-4 h-4 rounded shrink-0 flex items-center justify-center"
                  style={{
                    backgroundColor: isEnabled ? meta.color : 'transparent',
                    border: `1.5px solid ${isEnabled ? meta.color : 'var(--hs-border-strong)'}`,
                  }}
                >
                  {isEnabled && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span className="text-sm font-medium text-hs-text-body">{slotLabel}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Week Start ── */}
      <section data-field-id="meals.weekStartDay">
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.mealsPage.weekStart.heading')}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {(['sunday', 'monday'] as const).map((day) => {
            const isSelected = settings.weekStartDay === day;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setWeekStartDay(day)}
                disabled={saving}
                className={`px-3 py-2.5 rounded-md border text-sm font-medium transition ${
                  isSelected
                    ? 'bg-hs-accent-soft border-hs-accent/40 text-hs-accent-hover'
                    : 'bg-hs-panel border-hs-border-strong text-hs-text-muted hover:border-hs-text-faint hover:text-hs-text-body'
                }`}
                aria-pressed={isSelected}
              >
                {day === 'sunday' ? tCore('days.sunday') : tCore('days.monday')}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Time Format ── */}
      <section data-field-id="meals.timeFormat">
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.mealsPage.timeFormat.heading')}
        </h3>
        <p className="text-xs text-hs-text-faint mb-3">
          {t('settings.mealsPage.timeFormat.description')}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setTimeFormat(undefined)}
            disabled={saving}
            className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-md border transition ${
              settings.timeFormat === undefined
                ? 'bg-hs-accent-soft border-hs-accent/40 text-hs-accent-hover'
                : 'bg-hs-panel border-hs-border-strong text-hs-text-muted hover:border-hs-text-faint hover:text-hs-text-body'
            }`}
            aria-pressed={settings.timeFormat === undefined}
          >
            <span className="text-sm font-semibold">
              {t('settings.mealsPage.timeFormat.followLabel')}
            </span>
            <span className="text-[11px] tabular-nums opacity-80">{formatMealTime('18:30', globalTf)}</span>
          </button>
          {(['12h', '24h'] as const).map((fmt) => {
            const isSelected = settings.timeFormat === fmt;
            const sample = fmt === '12h' ? '6:30 PM' : '18:30';
            return (
              <button
                key={fmt}
                type="button"
                onClick={() => setTimeFormat(fmt)}
                disabled={saving}
                className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-md border transition ${
                  isSelected
                    ? 'bg-hs-accent-soft border-hs-accent/40 text-hs-accent-hover'
                    : 'bg-hs-panel border-hs-border-strong text-hs-text-muted hover:border-hs-text-faint hover:text-hs-text-body'
                }`}
                aria-pressed={isSelected}
              >
                <span className="text-sm font-semibold">
                  {fmt === '12h'
                    ? t('settings.mealsPage.timeFormat.twelveHourLabel')
                    : t('settings.mealsPage.timeFormat.twentyFourHourLabel')}
                </span>
                <span className="text-[11px] tabular-nums opacity-80">{sample}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Default Serving Times ── */}
      <section data-field-id="meals.defaultSlotTimes">
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.mealsPage.defaultTimes.heading')}
        </h3>
        <p className="text-xs text-hs-text-faint mb-3">
          {t('settings.mealsPage.defaultTimes.description')}
        </p>
        <div className="space-y-2">
          {settings.enabledSlots.map((slot) => {
            const meta = SLOT_META[slot];
            const currentTime = settings.defaultSlotTimes[slot];
            const presets = getSlotTimePresets(slot);
            const slotLabel = tModules(getMealSlotLabelKey(slot));
            return (
              <div
                key={slot}
                className="rounded-md border border-hs-border-strong bg-hs-panel p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold" style={{ color: meta.color }}>
                    {slotLabel}
                  </span>
                  {currentTime && (
                    <button
                      type="button"
                      onClick={() => setDefaultTime(slot, undefined)}
                      disabled={saving}
                      className="text-[11px] font-semibold text-hs-text-faint hover:text-hs-text-secondary px-2 py-0.5 rounded border border-hs-border-strong transition"
                      aria-label={t('settings.mealsPage.defaultTimes.clearAriaLabel', { name: slotLabel })}
                    >
                      {t('settings.mealsPage.defaultTimes.clear')}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={currentTime ?? ''}
                    onChange={(e) => setDefaultTime(slot, e.target.value || undefined)}
                    disabled={saving}
                    className="flex-1 rounded-md bg-hs-card border border-hs-border-strong px-2.5 py-1.5 text-sm text-hs-text-body focus:border-hs-accent focus:outline-none"
                    aria-label={t('settings.mealsPage.defaultTimes.timeInputAriaLabel', { name: slotLabel })}
                  />
                  <div className="flex gap-1">
                    {presets.map((preset) => {
                      const isSelected = preset === currentTime;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setDefaultTime(slot, preset)}
                          disabled={saving}
                          className={`px-2 py-1 rounded text-[11px] font-semibold tabular-nums transition ${
                            isSelected
                              ? 'border'
                              : 'border border-hs-border-strong text-hs-text-muted hover:text-hs-text-body hover:border-hs-text-faint'
                          }`}
                          style={isSelected ? {
                            color: meta.color,
                            borderColor: `${meta.color}66`,
                            backgroundColor: `${meta.color}15`,
                          } : undefined}
                        >
                          {formatMealTime(preset, tf)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
          {settings.enabledSlots.length === 0 && (
            <p className="text-xs text-hs-text-faint italic">
              {t('settings.mealsPage.defaultTimes.noSlotsHint')}
            </p>
          )}
        </div>
      </section>

      {/* ── Reset to defaults ── */}
      <section>
        <Button
          variant="secondary"
          onClick={() => {
            const defaults: MealSettings = {
              ...DEFAULT_MEAL_SETTINGS,
              enabledSlots: [...DEFAULT_MEAL_SETTINGS.enabledSlots],
              defaultSlotTimes: {},
            };
            const prev = settings;
            setSettings(defaults);
            persist(defaults, prev);
          }}
          disabled={saving}
        >
          {t('settings.mealsPage.reset.button')}
        </Button>
        <p className="text-xs text-hs-text-faint mt-2">
          {t('settings.mealsPage.reset.help')}
        </p>
      </section>
    </div>
  );
}
