'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import {
  SLOT_ORDER,
  SLOT_META,
  formatMealTime,
  getMealSlotLabelKey,
  getSlotTimePresets,
  resolveMealTimeFormat,
} from '@/lib/meal-constants';
import {
  toggleMealSlot,
  setMealSlotDefaultTime,
  setMealWeekStart,
  setMealTimeFormat,
  setMealPlanSource,
  resetMealSettings,
  canChooseMealiePlan,
} from '@/lib/meal-settings';
import { loadMealSettings, saveMealSettings } from '@/lib/meal-client';
import { HubUnreachableError } from '@/lib/hub-request';
import { mealieProblem } from '@/lib/meal-sources';
import { settingsPath } from '@/lib/settings-route';
import { useMealieCheck, type MealieCheck } from '@/hooks/useMealieCheck';
import { MEALIE_CARD_FIELD_ID } from './MealieIntegrationCard';
import { useEditorStore } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import { useTranslate } from '@/i18n';
import PhoneSurfaceLinks from '@/components/editor/PhoneSurfaceLinks';
import type { MealPlanSource, MealSettings, MealSlotType, TimeFormat, WeekStartDay } from '@/types/config';
import { useHouseholdTimeFormat } from '@/hooks/useHouseholdTimeFormat';

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
  const globalTf = useHouseholdTimeFormat(useEditorStore((s) => s.config?.settings?.timeFormat));

  const [settings, setSettings] = useState<MealSettings | null>(null);
  // Mealie's address and token are saved, so the plan can live there.
  const [mealieConnected, setMealieConnected] = useState(false);
  // What Mealie says about the saved token: whose household, or why not.
  const mealieCheck = useMealieCheck(mealieConnected);
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
        const loaded = await loadMealSettings(editorFetch);
        if (cancelled) return;
        setSettings(loaded.settings);
        setMealieConnected(loaded.mealieConnected);
      } catch (err) {
        if (cancelled || isSessionExpired(err)) return;
        setStatus({ message: t(err instanceof HubUnreachableError ? 'settings.mealsPage.status.networkLoad' : 'settings.mealsPage.status.loadFailed'), kind: 'error' });
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
      // Settings only: the meals and the plan are left as the hub has them,
      // so a meal saved from the phone meanwhile is not lost. The canvas
      // preview reads the new settings at once.
      const saved = await saveMealSettings(editorFetch, next);
      // Discard if a newer request superseded us (or if we unmounted): even
      // though our PUT succeeded, landing its response in state would clobber
      // whatever the newer request set, or touch an unmounted component.
      if (!stillCurrent(myReqId)) return true;
      setSettings(saved);
      setStatus({ message: t('common.saved'), kind: 'success' });
      if (saveMsgTimerRef.current) clearTimeout(saveMsgTimerRef.current);
      saveMsgTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setStatus(null);
      }, 2500);
      return true;
    } catch (err) {
      // A failure superseded by a newer request must not overwrite its
      // "Saved" or revert its settings; an expired session is on its way to
      // sign-in.
      if (!stillCurrent(myReqId) || isSessionExpired(err)) return false;
      setStatus({
        message: t(err instanceof HubUnreachableError ? 'settings.mealsPage.status.networkSave' : 'settings.mealsPage.status.saveFailed'),
        kind: 'error',
      });
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

  /**
   * Apply one of the shared edit rules and persist the result. A rule that
   * refuses the edit returns the settings it was given (turning off the last
   * slot), and there is then nothing to save.
   */
  const apply = useCallback((edit: (current: MealSettings) => MealSettings) => {
    if (!settings) return;
    const updated = edit(settings);
    if (updated === settings) return;
    setSettings(updated);
    persist(updated, settings);
  }, [settings, persist]);

  const toggleSlot = useCallback((slot: MealSlotType) => {
    apply((current) => toggleMealSlot(current, slot));
  }, [apply]);

  const setWeekStartDay = useCallback((day: WeekStartDay) => {
    apply((current) => setMealWeekStart(current, day));
  }, [apply]);

  const setTimeFormat = useCallback((fmt: TimeFormat | undefined) => {
    apply((current) => setMealTimeFormat(current, fmt));
  }, [apply]);

  const setDefaultTime = useCallback((slot: MealSlotType, time: string | undefined) => {
    apply((current) => setMealSlotDefaultTime(current, slot, time));
  }, [apply]);

  const setPlanSource = useCallback((source: MealPlanSource | undefined) => {
    apply((current) => setMealPlanSource(current, source));
  }, [apply]);

  // Asked first: the default serving times it clears have no Undo. The
  // question says what changes in the words shown under the button.
  const resetToDefaults = useCallback(async () => {
    const ok = await useConfirmStore.getState().confirm({
      title: t('settings.mealsPage.reset.confirmTitle'),
      message: t('settings.mealsPage.reset.help'),
      confirmLabel: t('settings.mealsPage.reset.confirmButton'),
    });
    if (ok) apply(resetMealSettings);
  }, [apply, t]);

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
          {t('settings.mealsPage.intro.text')}
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

      {/* The same settings are editable from the phone; this is the one page
          that says so with a scannable code rather than a bare path. */}
      <div className="max-w-xs">
        <PhoneSurfaceLinks context="meals" />
      </div>

      {/* ── Where the plan lives ── */}
      <PlanSourceChoice
        planSource={settings.planSource}
        mealieConnected={mealieConnected}
        mealieCheck={mealieCheck}
        saving={saving}
        onChange={setPlanSource}
      />

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
        {/* The calendars keep their own first day, and on one wall the two
            weeks sit side by side: say whose week this is. */}
        <p className="text-xs text-hs-text-faint mt-2">{t('settings.mealsPage.weekStart.hint')}</p>
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
          onClick={resetToDefaults}
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

/**
 * "Your meal plan lives in": Home Screens or Mealie. Mealie can only be picked
 * once its address and token are saved on the API keys page, which the line
 * under the choice links to; switching back to Home Screens is always open,
 * and the plan kept here comes back as it was.
 */
function PlanSourceChoice({
  planSource,
  mealieConnected,
  mealieCheck,
  saving,
  onChange,
}: {
  planSource: MealPlanSource | undefined;
  mealieConnected: boolean;
  /** The hub's check of the saved address and token; `undefined` while it asks. */
  mealieCheck: MealieCheck | undefined;
  saving: boolean;
  onChange: (source: MealPlanSource | undefined) => void;
}) {
  const t = useTranslate('editor');
  const onMealie = planSource === 'mealie';
  const canChooseMealie = canChooseMealiePlan(planSource, mealieConnected);
  const mealieCard = settingsPath({ kind: 'defaults', page: 'integrations' }, { highlight: MEALIE_CARD_FIELD_ID });
  // Mealie refusing the token, or not being a Mealie Home Screens can use,
  // is not Mealie being away: it is fixed on the API keys page or in Mealie,
  // not by waiting.
  const problem = mealieConnected && mealieCheck?.ok === false && mealieCheck.failure !== 'network' ? mealieProblem(mealieCheck.failure) : null;
  const mealieSub = !mealieConnected
    ? t('settings.mealsPage.planSource.mealieNotConnected')
    : !mealieCheck
      ? t('settings.mealsPage.planSource.mealieConnected')
      : mealieCheck.ok
        ? mealieCheck.household
          ? t('settings.mealsPage.planSource.mealieHousehold', { household: mealieCheck.household })
          : t('settings.mealsPage.planSource.mealieConnected')
        : problem === 'token'
          ? t('settings.mealsPage.planSource.mealieTokenRefused')
          : problem === 'setup'
            ? t('settings.mealsPage.planSource.mealieSetup')
            : t('settings.mealsPage.planSource.mealieNotAnswering');
  const choiceClass = (selected: boolean, disabled: boolean) =>
    `flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-md border transition ${
      selected
        ? 'bg-hs-accent-soft border-hs-accent/40 text-hs-accent-hover'
        : 'bg-hs-panel border-hs-border-strong text-hs-text-muted hover:border-hs-text-faint hover:text-hs-text-body'
    } ${disabled ? 'opacity-45 cursor-not-allowed hover:border-hs-border-strong hover:text-hs-text-muted' : ''}`;
  const linkClass = 'text-hs-accent hover:text-hs-accent-hover';

  return (
    <section data-field-id="meals.planSource">
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        {t('settings.mealsPage.planSource.heading')}
      </h3>
      <p className="text-xs text-hs-text-faint mb-3">
        {t('settings.mealsPage.planSource.description')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(undefined)}
          disabled={saving}
          className={choiceClass(!onMealie, false)}
          aria-pressed={!onMealie}
        >
          <span className="text-sm font-medium">{t('settings.mealsPage.planSource.homeScreens')}</span>
          <span className="text-[11px] opacity-80">{t('settings.mealsPage.planSource.homeScreensSub')}</span>
        </button>
        <button
          type="button"
          onClick={() => onChange('mealie')}
          disabled={saving || !canChooseMealie}
          className={choiceClass(onMealie, !canChooseMealie)}
          aria-pressed={onMealie}
        >
          <span className="text-sm font-medium">{t('settings.mealsPage.planSource.mealie')}</span>
          <span className="text-[11px] opacity-80">{mealieSub}</span>
        </button>
      </div>
      <p className="mt-2.5 text-xs leading-[17px] text-hs-text-muted">
        {!mealieConnected ? (
          <>
            {t('settings.mealsPage.planSource.connectFirst')}{' '}
            <Link href={mealieCard} className={linkClass}>{t('settings.mealsPage.planSource.apiKeysLink')} &rarr;</Link>
          </>
        ) : problem === 'token' || problem === 'setup' ? (
          <span className="text-hs-warning">
            {t(problem === 'token' ? 'settings.mealsPage.planSource.tokenRefused' : 'settings.mealsPage.planSource.setup')}{' '}
            <Link href={mealieCard} className={linkClass}>{t('settings.mealsPage.planSource.apiKeysLink')} &rarr;</Link>
          </span>
        ) : onMealie ? (
          <>
            {t('settings.mealsPage.planSource.onMealie')}{' '}
            <Link href={mealieCard} className={linkClass}>{t('settings.mealsPage.planSource.mealieSettingsLink')} &rarr;</Link>
          </>
        ) : (
          t('settings.mealsPage.planSource.connectedOffer')
        )}
      </p>
    </section>
  );
}
