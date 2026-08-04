'use client';

import { useMemo } from 'react';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import OverrideRow from '@/components/editor/settings/OverrideRow';
import FullscreenThemeGrid from '@/components/editor/settings/shared/FullscreenThemeGrid';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { useEditorStore } from '@/stores/editor-store';
import { TRANSITION_OPTIONS } from '@/lib/transitions';
import { useTranslate, tOrFallback } from '@/i18n';
import { settingsHref } from '@/lib/settings-route';
import type {
  DisplayNode,
  DisplayNodeSettings,
  ScreenConfiguration,
  TransitionEffect,
} from '@/types/config';

interface DisplayOverrideFieldsProps {
  config: ScreenConfiguration;
  display: DisplayNode;
}

const DEFAULTS_HREF = settingsHref({ kind: 'defaults', page: 'screen' });

/**
 * The inheritable half of the per-display Overrides subtab: rotation &
 * transitions, then appearance. Every field (rotation interval, transition
 * effect/duration, pause settings, cursor hide, fullscreen theme) is
 * wrapped in `OverrideRow`. A field is in the "default" state when its key
 * is missing from `display.settings`, and in the "overridden" state when
 * present.
 *
 * Mutations write straight to the store via `updateDisplaySettings` and
 * flush with `saveConfig` — the per-display pages have no top-level Save
 * button, so each card is self-saving by contract.
 */
export default function DisplayOverrideFields({ config, display }: DisplayOverrideFieldsProps) {
  const t = useTranslate('editor');
  // Selector-scoped: an unscoped `useEditorStore()` re-renders this card on
  // every store write (including each save's isSaving flip), which is enough
  // to interrupt typing in the sibling canvas inputs.
  const updateDisplaySettings = useEditorStore((s) => s.updateDisplaySettings);
  const saveConfig = useEditorStore((s) => s.saveConfig);
  const overrides = display.settings ?? {};
  const settings = config.settings;

  // Resolve once per render — every OverrideRow shares this label.
  const DEFAULTS_LABEL = t('settings.perDisplayPage.display.defaultsLabel');

  // Translated transition labels, falling back to the registry English name
  // when a plugin introduces an effect not listed in the default tree.
  // Memoized so each OverrideRow's `formatValue` closure stays stable across
  // renders that don't change locale.
  const transitionLabelFor = useMemo(
    () => (effect: TransitionEffect) => {
      const opt = TRANSITION_OPTIONS.find((o) => o.value === effect);
      return tOrFallback(t, `settings.defaultDisplayPage.transitionOptions.${effect}`, opt?.label ?? String(effect));
    },
    [t],
  );

  const setOverride = async <K extends keyof DisplayNodeSettings>(
    key: K,
    value: DisplayNodeSettings[K] | undefined,
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

          <OverrideRow
            label={t('settings.defaultDisplayPage.fields.swipeEnabledLabel')}
            defaultValue={settings.swipeEnabled ?? true}
            override={overrides.swipeEnabled}
            onFork={(seed) => setOverride('swipeEnabled', seed)}
            onReset={() => setOverride('swipeEnabled', undefined)}
            defaultsPageHref={DEFAULTS_HREF}
            defaultsPageLabel={DEFAULTS_LABEL}
            formatValue={(v) =>
              v
                ? t('settings.defaultDisplayPage.fields.swipeEnabledToggle')
                : t('settings.perDisplayPage.display.fields.swipeEnabledLabelDisabled')
            }
            displayName={display.name}
          >
            {({ value, onChange, disabled }) => (
              <Toggle
                label={t('settings.defaultDisplayPage.fields.swipeEnabledToggle')}
                checked={value}
                disabled={disabled}
                onChange={onChange}
              />
            )}
          </OverrideRow>
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
              <FullscreenThemeGrid value={value} onChange={onChange} disabled={disabled} />
            )}
          </OverrideRow>
        </div>
      </div>
    </>
  );
}
