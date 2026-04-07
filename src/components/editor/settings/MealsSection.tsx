'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import {
  SLOT_ORDER,
  SLOT_META,
  DEFAULT_MEAL_SETTINGS,
  formatMealTime,
  getSlotTimePresets,
  normalizeMealSettings,
} from '@/lib/meal-constants';
import { displayCache } from '@/lib/display-cache';
import type { MealSettings, MealSlotType } from '@/types/config';

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

export default function MealsSection() {
  const [settings, setSettings] = useState<MealSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
          if (!cancelled) setError('Failed to load meal settings.');
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setSettings(normalizeMealSettings(data.settings));
      } catch {
        if (!cancelled) setError('Network error loading meal settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
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
    setError(null);
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
        setError(body.error ?? 'Failed to save meal settings.');
        setSettings(prev); // rollback optimistic update
        return false;
      }
      const body = await putRes.json();
      if (!stillCurrent(myReqId)) return true;
      setSettings(normalizeMealSettings(body.settings));
      setSaveMessage('Saved');
      if (saveMsgTimerRef.current) clearTimeout(saveMsgTimerRef.current);
      saveMsgTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setSaveMessage(null);
      }, 2500);
      // Notify the canvas preview (and any display polling this endpoint)
      // to refetch so the newly-saved settings propagate without waiting
      // for the next poll interval.
      displayCache.invalidate('/api/meals/data');
      return true;
    } catch {
      if (!stillCurrent(myReqId)) return false;
      setError('Network error saving meal settings.');
      setSettings(prev); // rollback optimistic update
      return false;
    } finally {
      // Only clear the saving indicator if we're still the latest request
      // AND still mounted. Otherwise the newer request will manage it.
      if (stillCurrent(myReqId)) setSaving(false);
    }
  }, [stillCurrent]);

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

  const setTimeFormat = useCallback((fmt: '12h' | '24h') => {
    if (!settings) return;
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
      <div className="text-sm text-neutral-500">Loading meal settings...</div>
    );
  }

  if (!settings) {
    return (
      <div className="text-sm text-red-400">{error ?? 'Unable to load meal settings.'}</div>
    );
  }

  const tf = settings.timeFormat;

  return (
    <div className="space-y-6">
      {/* Status row — mirrors the parent page's "Saved" indicator */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500 leading-relaxed">
          Shared meal-planner settings. These also appear in the{' '}
          <a href="/remote" className="text-blue-400 hover:text-blue-300 underline">remote</a>{' '}
          settings drawer — edits from either surface stay in sync.
        </p>
        <div className="flex items-center gap-2 text-xs">
          {saving && <span className="text-neutral-500">Saving...</span>}
          {!saving && saveMessage && <span className="text-green-400">{saveMessage}</span>}
          {!saving && error && <span className="text-red-400">{error}</span>}
        </div>
      </div>

      {/* ── Meal Slots ── */}
      <section>
        <h3 className="text-sm font-medium text-neutral-300 mb-3 uppercase tracking-wider">
          Meal Slots
        </h3>
        <p className="text-xs text-neutral-500 mb-3">
          Which meals does your household plan? Affects every meal-planner module across all screens.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SLOT_ORDER.map((slot) => {
            const isEnabled = settings.enabledSlots.includes(slot);
            const meta = SLOT_META[slot];
            return (
              <button
                key={slot}
                type="button"
                onClick={() => toggleSlot(slot)}
                disabled={saving}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-left transition ${
                  isEnabled
                    ? 'bg-neutral-800 border-neutral-600'
                    : 'bg-neutral-900 border-neutral-700 hover:border-neutral-600'
                }`}
                aria-pressed={isEnabled}
              >
                <div
                  className="w-4 h-4 rounded shrink-0 flex items-center justify-center"
                  style={{
                    backgroundColor: isEnabled ? meta.color : 'transparent',
                    border: `1.5px solid ${isEnabled ? meta.color : '#525252'}`,
                  }}
                >
                  {isEnabled && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span className="text-sm font-medium text-neutral-200">{meta.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Week Start ── */}
      <section>
        <h3 className="text-sm font-medium text-neutral-300 mb-3 uppercase tracking-wider">
          Week Starts On
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
                className={`px-3 py-2.5 rounded-md border text-sm font-medium capitalize transition ${
                  isSelected
                    ? 'bg-blue-500/10 border-blue-500/40 text-blue-300'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200'
                }`}
                aria-pressed={isSelected}
              >
                {day}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Time Format ── */}
      <section>
        <h3 className="text-sm font-medium text-neutral-300 mb-3 uppercase tracking-wider">
          Time Format
        </h3>
        <p className="text-xs text-neutral-500 mb-3">
          Applies to every meal display across the kiosk and the remote.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(['12h', '24h'] as const).map((fmt) => {
            const isSelected = tf === fmt;
            const sample = fmt === '12h' ? '6:30 PM' : '18:30';
            return (
              <button
                key={fmt}
                type="button"
                onClick={() => setTimeFormat(fmt)}
                disabled={saving}
                className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-md border transition ${
                  isSelected
                    ? 'bg-blue-500/10 border-blue-500/40 text-blue-300'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200'
                }`}
                aria-pressed={isSelected}
              >
                <span className="text-sm font-semibold">{fmt === '12h' ? '12-hour' : '24-hour'}</span>
                <span className="text-[11px] tabular-nums opacity-80">{sample}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Default Serving Times ── */}
      <section>
        <h3 className="text-sm font-medium text-neutral-300 mb-3 uppercase tracking-wider">
          Default Serving Times
        </h3>
        <p className="text-xs text-neutral-500 mb-3">
          Used when a planned meal doesn&apos;t have its own time. Leave blank for slots that vary day-to-day.
        </p>
        <div className="space-y-2">
          {settings.enabledSlots.map((slot) => {
            const meta = SLOT_META[slot];
            const currentTime = settings.defaultSlotTimes[slot];
            const presets = getSlotTimePresets(slot);
            return (
              <div
                key={slot}
                className="rounded-md border border-neutral-700 bg-neutral-900 p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  {currentTime && (
                    <button
                      type="button"
                      onClick={() => setDefaultTime(slot, undefined)}
                      disabled={saving}
                      className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-300 px-2 py-0.5 rounded border border-neutral-700 hover:border-neutral-600 transition"
                      aria-label={`Clear default time for ${meta.label}`}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={currentTime ?? ''}
                    onChange={(e) => setDefaultTime(slot, e.target.value || undefined)}
                    disabled={saving}
                    className="flex-1 rounded-md bg-neutral-800 border border-neutral-600 px-2.5 py-1.5 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
                    style={{ colorScheme: 'dark' }}
                    aria-label={`Default time for ${meta.label}`}
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
                              : 'border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600'
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
            <p className="text-xs text-neutral-600 italic">Enable at least one slot above to set default times.</p>
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
          Reset to defaults
        </Button>
        <p className="text-xs text-neutral-600 mt-2">
          Restores breakfast/lunch/dinner, Sunday week start, 12-hour format, and clears all default times.
        </p>
      </section>
    </div>
  );
}
