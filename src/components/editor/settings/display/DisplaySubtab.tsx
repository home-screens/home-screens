'use client';

import { useCallback, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import Link from 'next/link';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import OverrideRow from '@/components/editor/settings/OverrideRow';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { useEditorStore } from '@/stores/editor-store';
import { MAX_DISPLAY_DIMENSION, orientDimensions } from '@/lib/display-filter';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';
import { TRANSITION_OPTIONS } from '@/lib/transitions';
import { useTranslate } from '@/i18n';
import { settingsHref } from '@/lib/settings-route';
import type {
  DisplayNode,
  ScreenConfiguration,
  TransitionEffect,
} from '@/types/config';

interface DisplaySubtabProps {
  config: ScreenConfiguration;
  display: DisplayNode;
}

const DEFAULTS_HREF = settingsHref({ kind: 'defaults', page: 'screen' });

/**
 * Display detail "Display" — the per-display equivalent of the
 * `Defaults → Display` page. Two sections:
 *
 *   1. **Canvas** — `displayWidth`, `displayHeight`, `displayTransform`.
 *      These live directly on the `DisplayNode` and have no shared default
 *      to inherit from, so they're rendered as plain inputs without an
 *      `OverrideRow` wrapper. A "Per display" tag next to each label
 *      makes the visual distinction clear.
 *
 *   2. **Rotation & transitions / Appearance** — every inheritable field
 *      (rotation interval, transition effect/duration, pause settings,
 *      cursor hide, fullscreen theme) wrapped in `OverrideRow`. A field
 *      is in the "default" state when its key is missing from
 *      `display.settings`, and in the "overridden" state when present.
 *
 * Mutations write straight to the store via `updateDisplay` /
 * `updateDisplaySettings`. The parent settings page's top-level Save
 * button flushes everything in one go — no local form layer to keep in
 * sync.
 */
export default function DisplaySubtab({ config, display }: DisplaySubtabProps) {
  const t = useTranslate('editor');
  const { updateDisplay, updateDisplaySettings, saveConfig } = useEditorStore();
  const overrides = display.settings ?? {};
  const settings = config.settings;

  // Resolve once per render — every OverrideRow + the banner share this label.
  const DEFAULTS_LABEL = t('settings.perDisplayPage.display.defaultsLabel');

  // Translated transition labels, falling back to the registry English name
  // when a plugin introduces an effect not listed in the default tree.
  // Memoized so each OverrideRow's `formatValue` closure stays stable across
  // renders that don't change locale.
  const tOrFallback = useCallback(
    (key: string, fallback: string) => {
      const result = t(key);
      return result === key ? fallback : result;
    },
    [t],
  );
  const transitionLabelFor = useMemo(
    () => (effect: TransitionEffect) => {
      const opt = TRANSITION_OPTIONS.find((o) => o.value === effect);
      return tOrFallback(`settings.defaultDisplayPage.transitionOptions.${effect}`, opt?.label ?? String(effect));
    },
    [tOrFallback],
  );

  // Local working copy of canvas dims so the user can type freely without
  // every keystroke hitting the store. We commit on blur or Enter to keep
  // partial input states (e.g. "10" while the user types "1080") from
  // resizing the canvas mid-edit.
  const [widthDraft, setWidthDraft] = useState<string>(
    String(display.displayWidth ?? settings.displayWidth ?? DEFAULT_DISPLAY_WIDTH),
  );
  const [heightDraft, setHeightDraft] = useState<string>(
    String(display.displayHeight ?? settings.displayHeight ?? DEFAULT_DISPLAY_HEIGHT),
  );

  // On blur / Enter, commit the parsed draft back to the store if it's
  // a valid positive integer within the MAX_DISPLAY_DIMENSION cap. Invalid or
  // empty input snaps the visible draft back to the last committed value
  // rather than silently discarding the edit — without this, clearing
  // the field leaves the input blank while the store still holds the
  // old value, which looks like a UI bug to the user.
  //
  // Every mutation handler below awaits `saveConfig()` after updating
  // the store. Without this the per-display Display subtab was a
  // non-persisting editor: the mutation landed in the Zustand store
  // (making the UI reflect the change immediately) but never flushed to
  // `data/config.json`, so a page reload reverted every override. The
  // parent settings page has no global Save button for per-display
  // drill-downs — each subtab is self-saving by contract.
  const commitWidth = async () => {
    const n = parseInt(widthDraft, 10);
    const current = display.displayWidth ?? settings.displayWidth ?? DEFAULT_DISPLAY_WIDTH;
    if (Number.isFinite(n) && n > 0 && n <= MAX_DISPLAY_DIMENSION) {
      if (n !== current) {
        updateDisplay(display.id, { displayWidth: n });
        await saveConfig();
      }
    } else {
      setWidthDraft(String(current));
    }
  };
  const commitHeight = async () => {
    const n = parseInt(heightDraft, 10);
    const current = display.displayHeight ?? settings.displayHeight ?? DEFAULT_DISPLAY_HEIGHT;
    if (Number.isFinite(n) && n > 0 && n <= MAX_DISPLAY_DIMENSION) {
      if (n !== current) {
        updateDisplay(display.id, { displayHeight: n });
        await saveConfig();
      }
    } else {
      setHeightDraft(String(current));
    }
  };

  const handleTransform = async (next: 'normal' | '90' | '180' | '270') => {
    const w = display.displayWidth ?? settings.displayWidth ?? DEFAULT_DISPLAY_WIDTH;
    const h = display.displayHeight ?? settings.displayHeight ?? DEFAULT_DISPLAY_HEIGHT;
    const { width: finalW, height: finalH } = orientDimensions(w, h, next);
    updateDisplay(display.id, {
      displayTransform: next,
      displayWidth: finalW,
      displayHeight: finalH,
    });
    setWidthDraft(String(finalW));
    setHeightDraft(String(finalH));
    await saveConfig();
  };

  const setOverride = async <K extends keyof typeof overrides>(
    key: K,
    value: NonNullable<typeof overrides>[K] | undefined,
  ) => {
    updateDisplaySettings(display.id, { [key]: value });
    await saveConfig();
  };

  // Effective values that field-conditional logic uses (e.g. pauseTimeout
  // only renders when pauseEnabled is true). Match the same precedence
  // `filterConfigForDisplay` uses on the server.
  const effectivePauseEnabled =
    overrides.pauseEnabled !== undefined
      ? overrides.pauseEnabled
      : settings.pauseEnabled ?? true;
  const effectiveTransitionEffect =
    overrides.transitionEffect ?? settings.transitionEffect ?? 'fade';

  return (
    <>
      {/* Top status banner */}
      <div className="mb-4 rounded-lg border border-hs-accent/20 bg-hs-accent/[0.07] px-4 py-3 flex items-start gap-3">
        <Info className="w-4 h-4 text-hs-accent-hover shrink-0 mt-0.5" />
        <div className="text-xs text-hs-accent-hover leading-relaxed">
          {t('settings.perDisplayPage.display.bannerPart1')}
          <strong className="text-hs-text-primary">
            {t('settings.perDisplayPage.display.bannerEmphasisDefault')}
          </strong>
          {t('settings.perDisplayPage.display.bannerPart2')}
          <Link
            href={DEFAULTS_HREF}
            className="text-hs-accent hover:text-hs-accent-hover underline decoration-dashed underline-offset-2"
          >
            {DEFAULTS_LABEL}
          </Link>
          {t('settings.perDisplayPage.display.bannerPart3')}
          <strong className="text-hs-text-primary">
            {t('settings.perDisplayPage.display.bannerEmphasisOverride')}
          </strong>
          {t('settings.perDisplayPage.display.bannerPart4', { name: display.name })}
        </div>
      </div>

      {/* Canvas section — resolution, rotation, flip. Per-display only. */}
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-2">
          {t('settings.perDisplayPage.display.canvasHeading')}
        </div>
        <div className="rounded-lg border border-hs-border bg-hs-panel/40">
          <div className="px-4 py-3.5 border-b border-hs-border">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-hs-text-muted">
                {t('common.resolution')}
              </div>
              <span className="text-[10px] uppercase tracking-wider text-hs-text-faint">
                {t('settings.perDisplayPage.display.perDisplayBadge')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={widthDraft}
                min={1}
                max={MAX_DISPLAY_DIMENSION}
                onChange={(e) => setWidthDraft(e.target.value)}
                onBlur={commitWidth}
                className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent tabular-nums"
              />
              <input
                type="number"
                value={heightDraft}
                min={1}
                max={MAX_DISPLAY_DIMENSION}
                onChange={(e) => setHeightDraft(e.target.value)}
                onBlur={commitHeight}
                className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent tabular-nums"
              />
            </div>
            <p className="text-[11px] text-hs-text-faint mt-1.5">
              {t('settings.perDisplayPage.display.resolutionHelp')}
            </p>
          </div>
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-hs-text-muted">
                {t('fields.rotation')}
              </div>
              <span className="text-[10px] uppercase tracking-wider text-hs-text-faint">
                {t('settings.perDisplayPage.display.perDisplayBadge')}
              </span>
            </div>
            <select
              value={display.displayTransform ?? 'normal'}
              onChange={(e) => handleTransform(e.target.value as 'normal' | '90' | '180' | '270')}
              className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
            >
              <option value="normal">{t('settings.perDisplayPage.display.rotationOptionNormal')}</option>
              <option value="90">{t('settings.perDisplayPage.display.rotationOption90')}</option>
              <option value="180">{t('settings.perDisplayPage.display.rotationOption180')}</option>
              <option value="270">{t('settings.perDisplayPage.display.rotationOption270')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Rotation & transitions — inheritable */}
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-2">
          {t('settings.perDisplayPage.display.rotationAndTransitionsHeading')}
        </div>
        <div className="rounded-lg border border-hs-border bg-hs-panel/40">
          <OverrideRow
            label={t('settings.defaultDisplayPage.fields.rotationIntervalLabel')}
            defaultValue={(settings.rotationIntervalMs ?? 30000) / 1000}
            override={overrides.rotationIntervalMs != null ? overrides.rotationIntervalMs / 1000 : undefined}
            onFork={(seed) => setOverride('rotationIntervalMs', seed * 1000)}
            onReset={() => setOverride('rotationIntervalMs', undefined)}
            defaultsPageHref={DEFAULTS_HREF}
            defaultsPageLabel={DEFAULTS_LABEL}
            formatValue={(v) => t('settings.perDisplayPage.display.fields.rotationIntervalSeconds', { seconds: v })}
            displayName={display.name}
          >
            {({ value, onChange, disabled }) => (
              <Slider
                label=""
                value={value}
                min={5}
                max={120}
                step={5}
                displayValue={t('settings.defaultDisplayPage.fields.cursorHideValue', { seconds: value })}
                onChange={onChange}
                disabled={disabled}
              />
            )}
          </OverrideRow>

          <OverrideRow<TransitionEffect>
            label={t('settings.defaultDisplayPage.fields.transitionEffectLabel')}
            defaultValue={(settings.transitionEffect ?? 'fade') as TransitionEffect}
            override={overrides.transitionEffect}
            onFork={(seed) => setOverride('transitionEffect', seed)}
            onReset={() => setOverride('transitionEffect', undefined)}
            defaultsPageHref={DEFAULTS_HREF}
            defaultsPageLabel={DEFAULTS_LABEL}
            formatValue={(v) => transitionLabelFor(v)}
            displayName={display.name}
          >
            {({ value, onChange, disabled }) => (
              <select
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value as TransitionEffect)}
                className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent disabled:opacity-50"
              >
                {TRANSITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {transitionLabelFor(opt.value)}
                  </option>
                ))}
              </select>
            )}
          </OverrideRow>

          {/* Stay visible whenever an override value exists, even if the
              parent `transitionEffect` is 'none' (which normally hides the
              duration control). Without this, a user who overrode
              `transitionDuration` and then later overrode `transitionEffect`
              to 'none' would see the orphaned duration override counted in
              the bulk footer but have no way to reset it individually. */}
          {(effectiveTransitionEffect !== 'none' || overrides.transitionDuration !== undefined) && (
            <OverrideRow
              label={t('settings.defaultDisplayPage.fields.transitionDurationLabel')}
              defaultValue={settings.transitionDuration ?? 0.6}
              override={overrides.transitionDuration}
              onFork={(seed) => setOverride('transitionDuration', seed)}
              onReset={() => setOverride('transitionDuration', undefined)}
              defaultsPageHref={DEFAULTS_HREF}
              defaultsPageLabel={DEFAULTS_LABEL}
              formatValue={(v) => t('settings.defaultDisplayPage.fields.transitionDurationValue', { seconds: v.toFixed(1) })}
              displayName={display.name}
            >
              {({ value, onChange, disabled }) => (
                <Slider
                  label=""
                  value={value}
                  min={0.3}
                  max={2}
                  step={0.1}
                  displayValue={t('settings.defaultDisplayPage.fields.transitionDurationValue', { seconds: value.toFixed(1) })}
                  onChange={onChange}
                  disabled={disabled}
                />
              )}
            </OverrideRow>
          )}

          <OverrideRow
            label={t('settings.defaultDisplayPage.fields.pauseEnabledLabel')}
            defaultValue={settings.pauseEnabled ?? true}
            override={overrides.pauseEnabled}
            onFork={(seed) => setOverride('pauseEnabled', seed)}
            onReset={() => setOverride('pauseEnabled', undefined)}
            defaultsPageHref={DEFAULTS_HREF}
            defaultsPageLabel={DEFAULTS_LABEL}
            formatValue={(v) =>
              v
                ? t('settings.defaultDisplayPage.fields.pauseEnabledToggle')
                : t('settings.perDisplayPage.display.fields.pauseEnabledLabelDisabled')
            }
            displayName={display.name}
          >
            {({ value, onChange, disabled }) => (
              <Toggle
                label={t('settings.defaultDisplayPage.fields.pauseEnabledToggle')}
                checked={value}
                disabled={disabled}
                onChange={onChange}
              />
            )}
          </OverrideRow>

          {/* Same orphan-visibility rule as transitionDuration above:
              stay visible whenever the override exists even if
              `pauseEnabled` was overridden to false. */}
          {(effectivePauseEnabled || overrides.pauseTimeoutSeconds !== undefined) && (
            <OverrideRow
              label={t('settings.defaultDisplayPage.fields.pauseTimeoutLabel')}
              defaultValue={settings.pauseTimeoutSeconds ?? 300}
              override={overrides.pauseTimeoutSeconds}
              onFork={(seed) => setOverride('pauseTimeoutSeconds', seed)}
              onReset={() => setOverride('pauseTimeoutSeconds', undefined)}
              defaultsPageHref={DEFAULTS_HREF}
              defaultsPageLabel={DEFAULTS_LABEL}
              formatValue={(v) =>
                v === 0
                  ? t('settings.defaultDisplayPage.fields.pauseTimeoutNever')
                  : t('settings.defaultDisplayPage.fields.pauseTimeoutSeconds', { seconds: v })
              }
              displayName={display.name}
            >
              {({ value, onChange, disabled }) => (
                <Slider
                  label=""
                  value={value}
                  min={0}
                  max={600}
                  step={30}
                  displayValue={
                    value === 0
                      ? t('settings.defaultDisplayPage.fields.pauseTimeoutNever')
                      : t('settings.defaultDisplayPage.fields.pauseTimeoutSeconds', { seconds: value })
                  }
                  onChange={onChange}
                  disabled={disabled}
                />
              )}
            </OverrideRow>
          )}
        </div>
      </div>

      {/* Appearance — inheritable */}
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-2">
          {t('settings.perDisplayPage.display.appearanceHeading')}
        </div>
        <div className="rounded-lg border border-hs-border bg-hs-panel/40">
          <OverrideRow
            label={t('settings.defaultDisplayPage.fields.cursorHideLabel')}
            defaultValue={settings.cursorHideSeconds ?? 3}
            override={overrides.cursorHideSeconds}
            onFork={(seed) => setOverride('cursorHideSeconds', seed)}
            onReset={() => setOverride('cursorHideSeconds', undefined)}
            defaultsPageHref={DEFAULTS_HREF}
            defaultsPageLabel={DEFAULTS_LABEL}
            formatValue={(v) => t('settings.defaultDisplayPage.fields.cursorHideValue', { seconds: v })}
            displayName={display.name}
          >
            {({ value, onChange, disabled }) => (
              <Slider
                label=""
                value={value}
                min={1}
                max={30}
                step={1}
                displayValue={t('settings.defaultDisplayPage.fields.cursorHideValue', { seconds: value })}
                onChange={onChange}
                disabled={disabled}
              />
            )}
          </OverrideRow>

          <OverrideRow
            label={t('settings.defaultDisplayPage.fields.fullscreenThemeLabel')}
            defaultValue={settings.fullscreenTheme ?? 'linen'}
            override={overrides.fullscreenTheme}
            onFork={(seed) => setOverride('fullscreenTheme', seed)}
            onReset={() => setOverride('fullscreenTheme', undefined)}
            defaultsPageHref={DEFAULTS_HREF}
            defaultsPageLabel={DEFAULTS_LABEL}
            formatValue={(v) => FULLSCREEN_THEMES.find((th) => th.id === v)?.name ?? v}
            displayName={display.name}
          >
            {({ value, onChange, disabled }) => (
              <div className="grid grid-cols-3 gap-2">
                {FULLSCREEN_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(theme.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      value === theme.id
                        ? 'border-hs-accent bg-hs-accent-soft'
                        : 'border-hs-border-strong bg-hs-card hover:bg-hs-hover'
                    } disabled:cursor-not-allowed`}
                  >
                    <div
                      className="w-7 h-7 rounded-md flex-shrink-0 overflow-hidden border border-hs-border-strong"
                      style={{ background: theme.tokens.bg }}
                    >
                      <div style={{ height: '60%', background: theme.tokens.bg }} />
                      <div style={{ height: '40%', background: theme.tokens.border }} />
                    </div>
                    <div>
                      <div
                        className={`text-xs font-semibold ${
                          value === theme.id ? 'text-hs-accent-hover' : 'text-hs-text-body'
                        }`}
                      >
                        {theme.name}
                      </div>
                      <div className="text-[10px] text-hs-text-faint capitalize">
                        {tOrFallback(`settings.defaultDisplayPage.themeGroups.${theme.group}`, theme.group)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </OverrideRow>
        </div>
      </div>

    </>
  );
}
