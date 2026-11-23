'use client';

import { useMemo } from 'react';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import { FieldLabel, FieldRow } from '@/components/editor/settings/screen/FieldRow';
import FieldHint from '@/components/ui/FieldHint';
import FullscreenThemeGrid from '@/components/editor/settings/shared/FullscreenThemeGrid';
import { TRANSITION_OPTIONS } from '@/lib/transitions';
import type { DisplayState } from '@/lib/settings-form';
import type { TransitionEffect } from '@/types/config';
import { useFormattingLocale, useTranslate, tOrFallback } from '@/i18n';
import { SETTINGS_INPUT_CLASS } from '@/components/ui/input-classes';
import { DEFAULT_ROTATION_SECONDS, DISPLAY_FIELD_SLIDERS, transitionSecondsText } from '@/lib/display-override-fields';

/** Seeded when rotation is switched back on, so the slider has somewhere to start. */

interface AppearanceCardProps {
  values: DisplayState;
  onChange: (updates: Partial<DisplayState>) => void;
  /**
   * Whether any wall still draws the dots (see `paginationDotDefaultsInUse`).
   * The pause and progress-line defaults live on the dots, so they hide only
   * when no display uses them; a display that turns the dots back on still
   * inherits them and needs them editable here.
   */
  dotDefaultsInUse: boolean;
}

/**
 * Rotation & appearance — the inheritable display defaults that every
 * per-display OverrideRow links back to. Mockup-aligned: single rounded
 * container with border-b separated rows.
 */
export default function AppearanceCard({ values, onChange, dotDefaultsInUse }: AppearanceCardProps) {
  const t = useTranslate('editor');
  const locale = useFormattingLocale();

  const {
    rotationInterval,
    cursorHideSeconds,
    transitionEffect,
    transitionDuration,
    fullscreenTheme,
    pauseEnabled,
    pauseTimeoutSeconds,
    swipeEnabled,
    setupHintEnabled,
    showRotationProgress,
    showPaginationDots,
    pixelShift,
  } = values;

  // TRANSITION_OPTIONS is exported and consumed by multiple call sites
  // (DisplaySubtab, FullscreenPhotoConfigSection, …), so we can't move the
  // array construction in here. Instead we translate each label at render
  // time using its `value` as the dictionary key, falling back to the
  // registry's English label when a key isn't registered (e.g. a
  // plugin-introduced effect).
  const transitionOptions = useMemo(
    () =>
      TRANSITION_OPTIONS.map((opt) => ({
        value: opt.value,
        label: tOrFallback(
          t,
          `settings.defaultDisplayPage.transitionOptions.${opt.value}`,
          opt.label,
        ),
      })),
    [t],
  );

  return (
    <div className="mb-5">
      <div className="rounded-lg border border-hs-border bg-hs-panel/40">
      {/* 0 seconds is "do not rotate": the wall stays on a screen until a
          tap, a swipe or the remote moves it (resolveScreenDuration). */}
      <FieldRow fieldId="display.rotateAutomatically">
        <FieldLabel>{t('settings.defaultDisplayPage.fields.rotateLabel')}</FieldLabel>
        <Toggle
          label={t('settings.defaultDisplayPage.fields.rotateToggle')}
          checked={rotationInterval > 0}
          onChange={(v) => onChange({ rotationInterval: v ? DEFAULT_ROTATION_SECONDS : 0 })}
          description={t('settings.defaultDisplayPage.fields.rotateHelp')}
        />
      </FieldRow>

      {rotationInterval > 0 && (
        <FieldRow fieldId="display.rotationInterval">
          <FieldLabel>{t('settings.defaultDisplayPage.fields.rotationIntervalLabel')}</FieldLabel>
          <Slider
            label=""
            value={rotationInterval}
            min={DISPLAY_FIELD_SLIDERS.rotationSeconds.min}
            max={Math.max(DISPLAY_FIELD_SLIDERS.rotationSeconds.max, rotationInterval)}
            step={DISPLAY_FIELD_SLIDERS.rotationSeconds.step}
            displayValue={t('settings.defaultDisplayPage.fields.cursorHideValue', { seconds: rotationInterval })}
            onChange={(v) => onChange({ rotationInterval: v })}
            hint={t('settings.defaultDisplayPage.fields.rotationIntervalHelp')}
          />
        </FieldRow>
      )}

      <FieldRow fieldId="display.showPaginationDots">
        <FieldLabel>{t('settings.defaultDisplayPage.fields.paginationDotsLabel')}</FieldLabel>
        <Toggle
          label={t('settings.defaultDisplayPage.fields.paginationDotsToggle')}
          checked={showPaginationDots}
          onChange={(v) => onChange({ showPaginationDots: v })}
          description={t('settings.defaultDisplayPage.fields.paginationDotsHelp')}
        />
      </FieldRow>

      {dotDefaultsInUse && (
        <>
          <FieldRow fieldId="display.pauseEnabled">
            <FieldLabel>{t('settings.defaultDisplayPage.fields.pauseEnabledLabel')}</FieldLabel>
            <Toggle
              label={t('settings.defaultDisplayPage.fields.pauseEnabledToggle')}
              checked={pauseEnabled}
              onChange={(v) => onChange({ pauseEnabled: v })}
              description={t('settings.defaultDisplayPage.fields.pauseEnabledHelp')}
            />
            {pauseEnabled && (
              <div className="mt-3">
                <Slider
                  label={t('settings.defaultDisplayPage.fields.pauseTimeoutLabel')}
                  value={pauseTimeoutSeconds}
                  {...DISPLAY_FIELD_SLIDERS.pauseTimeoutSeconds}
                  displayValue={
                    pauseTimeoutSeconds === 0
                      ? t('settings.defaultDisplayPage.fields.pauseTimeoutNever')
                      : t('settings.defaultDisplayPage.fields.pauseTimeoutSeconds', {
                          seconds: pauseTimeoutSeconds,
                        })
                  }
                  onChange={(v) => onChange({ pauseTimeoutSeconds: v })}
                  hint={t('settings.defaultDisplayPage.fields.pauseTimeoutHelp')}
                />
              </div>
            )}
          </FieldRow>

          <FieldRow fieldId="display.showRotationProgress">
            <FieldLabel>{t('settings.defaultDisplayPage.fields.rotationProgressLabel')}</FieldLabel>
            <Toggle
              label={t('settings.defaultDisplayPage.fields.rotationProgressToggle')}
              checked={showRotationProgress}
              onChange={(v) => onChange({ showRotationProgress: v })}
              description={t('settings.defaultDisplayPage.fields.rotationProgressHelp')}
            />
          </FieldRow>
        </>
      )}

      <FieldRow fieldId="display.swipeEnabled">
        <FieldLabel>{t('settings.defaultDisplayPage.fields.swipeEnabledLabel')}</FieldLabel>
        <Toggle
          label={t('settings.defaultDisplayPage.fields.swipeEnabledToggle')}
          checked={swipeEnabled}
          onChange={(v) => onChange({ swipeEnabled: v })}
          description={t('settings.defaultDisplayPage.fields.swipeEnabledHelp')}
        />
      </FieldRow>

      <FieldRow fieldId="display.setupHintEnabled">
        <FieldLabel>{t('settings.defaultDisplayPage.fields.setupHintLabel')}</FieldLabel>
        <Toggle
          label={t('settings.defaultDisplayPage.fields.setupHintToggle')}
          checked={setupHintEnabled}
          onChange={(v) => onChange({ setupHintEnabled: v })}
          description={t('settings.defaultDisplayPage.fields.setupHintHelp')}
        />
      </FieldRow>

      <FieldRow fieldId="display.transitionEffect">
        <FieldLabel>{t('settings.defaultDisplayPage.fields.transitionEffectLabel')}</FieldLabel>
        <select
          value={transitionEffect}
          onChange={(e) => onChange({ transitionEffect: e.target.value })}
          className={`block w-full ${SETTINGS_INPUT_CLASS}`}
        >
          {transitionOptions.map((opt) => (
            <option key={opt.value} value={opt.value as TransitionEffect}>
              {opt.label}
            </option>
          ))}
        </select>
        <FieldHint className="mt-1.5">
          {t('settings.defaultDisplayPage.fields.transitionEffectHelp')}
        </FieldHint>
      </FieldRow>

      {transitionEffect !== 'none' && (
        <FieldRow fieldId="display.transitionDuration">
          <FieldLabel>{t('settings.defaultDisplayPage.fields.transitionDurationLabel')}</FieldLabel>
          <Slider
            label=""
            value={transitionDuration}
            {...DISPLAY_FIELD_SLIDERS.transitionDuration}
            displayValue={t('settings.defaultDisplayPage.fields.transitionDurationValue', {
              seconds: transitionSecondsText(transitionDuration, locale),
            })}
            onChange={(v) => onChange({ transitionDuration: v })}
            hint={t('settings.defaultDisplayPage.fields.transitionDurationHelp')}
          />
        </FieldRow>
      )}

      <FieldRow fieldId="display.cursorHideSeconds">
        <FieldLabel>{t('settings.defaultDisplayPage.fields.cursorHideLabel')}</FieldLabel>
        <Slider
          label=""
          value={cursorHideSeconds}
          {...DISPLAY_FIELD_SLIDERS.cursorHideSeconds}
          displayValue={t('settings.defaultDisplayPage.fields.cursorHideValue', {
            seconds: cursorHideSeconds,
          })}
          onChange={(v) => onChange({ cursorHideSeconds: v })}
          hint={t('settings.defaultDisplayPage.fields.cursorHideHelp')}
        />
      </FieldRow>

      {/* The wall's root box steps along a small lattice once a minute
          (usePixelShift), the way OLED televisions shift their picture. */}
      <FieldRow fieldId="display.pixelShift">
        <FieldLabel>{t('settings.defaultDisplayPage.fields.pixelShiftLabel')}</FieldLabel>
        <Toggle
          label={t('settings.defaultDisplayPage.fields.pixelShiftToggle')}
          checked={pixelShift}
          onChange={(v) => onChange({ pixelShift: v })}
          description={t('settings.defaultDisplayPage.fields.pixelShiftHelp')}
        />
      </FieldRow>

      <FieldRow fieldId="display.fullscreenTheme">
        <FieldLabel>{t('settings.defaultDisplayPage.fields.fullscreenThemeLabel')}</FieldLabel>
        <FieldHint className="mt-1.5">
          {t('settings.defaultDisplayPage.fields.fullscreenThemeHelp')}
        </FieldHint>
        <FullscreenThemeGrid
          value={fullscreenTheme}
          onChange={(themeId) => onChange({ fullscreenTheme: themeId })}
          className="mt-3"
        />
      </FieldRow>
      </div>
    </div>
  );
}
