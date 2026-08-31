'use client';

import { useMemo } from 'react';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import { FieldHelp, FieldLabel, FieldRow } from '@/components/editor/settings/screen/FieldRow';
import FullscreenThemeGrid from '@/components/editor/settings/shared/FullscreenThemeGrid';
import { TRANSITION_OPTIONS } from '@/lib/transitions';
import type { DisplayState } from '@/lib/settings-form';
import type { TransitionEffect } from '@/types/config';
import { useTranslate, tOrFallback } from '@/i18n';

interface AppearanceCardProps {
  values: DisplayState;
  onChange: (updates: Partial<DisplayState>) => void;
}

/**
 * Rotation & appearance — the inheritable display defaults that every
 * per-display OverrideRow links back to. Mockup-aligned: single rounded
 * container with border-b separated rows.
 */
export default function AppearanceCard({ values, onChange }: AppearanceCardProps) {
  const t = useTranslate('editor');

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
      <FieldRow fieldId="display.rotationInterval">
        <FieldLabel>{t('settings.defaultDisplayPage.fields.rotationIntervalLabel')}</FieldLabel>
        <Slider
          label=""
          value={rotationInterval}
          min={5}
          max={120}
          step={5}
          onChange={(v) => onChange({ rotationInterval: v })}
        />
        <FieldHelp>
          {t('settings.defaultDisplayPage.fields.rotationIntervalHelp')}
        </FieldHelp>
      </FieldRow>

      <FieldRow fieldId="display.pauseEnabled">
        <FieldLabel>{t('settings.defaultDisplayPage.fields.pauseEnabledLabel')}</FieldLabel>
        <Toggle
          label={t('settings.defaultDisplayPage.fields.pauseEnabledToggle')}
          checked={pauseEnabled}
          onChange={(v) => onChange({ pauseEnabled: v })}
        />
        <FieldHelp>
          {t('settings.defaultDisplayPage.fields.pauseEnabledHelp')}
        </FieldHelp>
        {pauseEnabled && (
          <div className="mt-3">
            <Slider
              label={t('settings.defaultDisplayPage.fields.pauseTimeoutLabel')}
              value={pauseTimeoutSeconds}
              min={0}
              max={600}
              step={30}
              displayValue={
                pauseTimeoutSeconds === 0
                  ? t('settings.defaultDisplayPage.fields.pauseTimeoutNever')
                  : t('settings.defaultDisplayPage.fields.pauseTimeoutSeconds', {
                      seconds: pauseTimeoutSeconds,
                    })
              }
              onChange={(v) => onChange({ pauseTimeoutSeconds: v })}
            />
            <FieldHelp>
              {t('settings.defaultDisplayPage.fields.pauseTimeoutHelp')}
            </FieldHelp>
          </div>
        )}
      </FieldRow>

      <FieldRow fieldId="display.swipeEnabled">
        <FieldLabel>{t('settings.defaultDisplayPage.fields.swipeEnabledLabel')}</FieldLabel>
        <Toggle
          label={t('settings.defaultDisplayPage.fields.swipeEnabledToggle')}
          checked={swipeEnabled}
          onChange={(v) => onChange({ swipeEnabled: v })}
        />
        <FieldHelp>
          {t('settings.defaultDisplayPage.fields.swipeEnabledHelp')}
        </FieldHelp>
      </FieldRow>

      <FieldRow fieldId="display.setupHintEnabled">
        <FieldLabel>{t('settings.defaultDisplayPage.fields.setupHintLabel')}</FieldLabel>
        <Toggle
          label={t('settings.defaultDisplayPage.fields.setupHintToggle')}
          checked={setupHintEnabled}
          onChange={(v) => onChange({ setupHintEnabled: v })}
        />
        <FieldHelp>
          {t('settings.defaultDisplayPage.fields.setupHintHelp')}
        </FieldHelp>
      </FieldRow>

      <FieldRow fieldId="display.transitionEffect">
        <FieldLabel>{t('settings.defaultDisplayPage.fields.transitionEffectLabel')}</FieldLabel>
        <select
          value={transitionEffect}
          onChange={(e) => onChange({ transitionEffect: e.target.value })}
          className="block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
        >
          {transitionOptions.map((opt) => (
            <option key={opt.value} value={opt.value as TransitionEffect}>
              {opt.label}
            </option>
          ))}
        </select>
        <FieldHelp>
          {t('settings.defaultDisplayPage.fields.transitionEffectHelp')}
        </FieldHelp>
      </FieldRow>

      {transitionEffect !== 'none' && (
        <FieldRow fieldId="display.transitionDuration">
          <FieldLabel>{t('settings.defaultDisplayPage.fields.transitionDurationLabel')}</FieldLabel>
          <Slider
            label=""
            value={transitionDuration}
            min={0.3}
            max={2}
            step={0.1}
            displayValue={t('settings.defaultDisplayPage.fields.transitionDurationValue', {
              seconds: transitionDuration.toFixed(1),
            })}
            onChange={(v) => onChange({ transitionDuration: v })}
          />
          <FieldHelp>{t('settings.defaultDisplayPage.fields.transitionDurationHelp')}</FieldHelp>
        </FieldRow>
      )}

      <FieldRow fieldId="display.cursorHideSeconds">
        <FieldLabel>{t('settings.defaultDisplayPage.fields.cursorHideLabel')}</FieldLabel>
        <Slider
          label=""
          value={cursorHideSeconds}
          min={1}
          max={30}
          step={1}
          displayValue={t('settings.defaultDisplayPage.fields.cursorHideValue', {
            seconds: cursorHideSeconds,
          })}
          onChange={(v) => onChange({ cursorHideSeconds: v })}
        />
        <FieldHelp>
          {t('settings.defaultDisplayPage.fields.cursorHideHelp')}
        </FieldHelp>
      </FieldRow>

      <FieldRow fieldId="display.fullscreenTheme">
        <FieldLabel>{t('settings.defaultDisplayPage.fields.fullscreenThemeLabel')}</FieldLabel>
        <FieldHelp>
          {t('settings.defaultDisplayPage.fields.fullscreenThemeHelp')}
        </FieldHelp>
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
