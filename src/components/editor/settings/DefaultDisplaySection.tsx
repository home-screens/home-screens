'use client';

import { useMemo, useState } from 'react';
import type { ScreenConfiguration, TransitionEffect } from '@/types/config';
import { findDisplaysOverridingFields } from '@/lib/display-defaults-backlinks';
import { DISPLAY_OVERRIDE_FIELDS } from '@/lib/display-override-fields';
import DefaultsBacklinkBanner from '@/components/editor/settings/DefaultsBacklinkBanner';
import Slider from '@/components/ui/Slider';
import { RESOLUTION_PRESETS, deriveDisplayTransform } from '@/lib/constants';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { TRANSITION_OPTIONS } from '@/lib/transitions';
import { useTranslate } from '@/i18n';

interface DefaultDisplayValues {
  displayWidth: number;
  displayHeight: number;
  displayTransform: string;
  rotationInterval: number;
  cursorHideSeconds: number;
  transitionEffect: string;
  transitionDuration: number;
  fullscreenTheme: string;
  pauseEnabled: boolean;
  pauseTimeoutSeconds: number;
}

interface DefaultDisplaySectionProps {
  /** The full config — needed for the backlink banner scan and to decide whether canvas controls render. */
  config: ScreenConfiguration;
  values: DefaultDisplayValues;
  onChange: (updates: Partial<DefaultDisplayValues>) => void;
}

function resolvePreset(width: number, height: number) {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  return RESOLUTION_PRESETS.find((p) => p.short === short && p.long === long) ?? null;
}

/**
 * The "Defaults → Display" page — the source-of-truth for shared display
 * values like rotation interval, transition effect, fullscreen theme, etc.
 *
 * Every per-display override (rendered via `OverrideRow` on a `PerDisplayPage`)
 * links its help text back here, and this page in turn renders a
 * `DefaultsBacklinkBanner` listing which displays currently override its
 * fields. That bidirectional linkage is the load-bearing UX move: the
 * previous chip pattern broke down because the shared value had no visible
 * home.
 *
 * Canvas controls (orientation/resolution/flip) only render in
 * single-display installs because that's the only mode where the global
 * `config.settings.displayWidth/Height/Transform` is actually read by a
 * display. In multi-display mode every `DisplayNode` owns its own copy on
 * the node itself (edited from `Per display → <X> → Display`) — so the
 * global fields become vestigial and exposing them here would let users
 * edit values nothing reads.
 */
export default function DefaultDisplaySection({ config, values, onChange }: DefaultDisplaySectionProps) {
  const t = useTranslate('editor');
  // Scan displays for overrides only when `config` changes. Without the
  // memo this runs on every keystroke into the form (which updates
  // `values`/`onChange` identities), and for a ≤64-display install with
  // ≤7 fields that's cheap but wasteful — the scan is pure over config.
  const overrides = useMemo(
    () => findDisplaysOverridingFields(config, DISPLAY_OVERRIDE_FIELDS),
    [config],
  );
  const isMultiDisplay = (config.displays?.length ?? 0) > 0;

  const {
    displayWidth,
    displayHeight,
    displayTransform,
    rotationInterval,
    cursorHideSeconds,
    transitionEffect,
    transitionDuration,
    fullscreenTheme,
    pauseEnabled,
    pauseTimeoutSeconds,
  } = values;

  // TRANSITION_OPTIONS / FULLSCREEN_THEMES are exported and consumed by
  // multiple call sites (DisplaySubtab, FullscreenPhotoConfigSection, …),
  // so we can't move the array construction in here. Instead we translate
  // each label / theme group at render time using its `value` / `group` as
  // the dictionary key. Falls back to the registry's English label when a
  // key isn't registered (e.g. plugin-introduced effects, a future theme
  // group). t() returns the raw key path on miss — not undefined and not
  // falsy — so we compare result === key to detect a miss; a `|| fallback`
  // would silently render the dotted-path key in the dropdown.
  const tOrFallback = (key: string, fallback: string) => {
    const result = t(key);
    return result === key ? fallback : result;
  };

  const transitionOptions = useMemo(
    () =>
      TRANSITION_OPTIONS.map((opt) => ({
        value: opt.value,
        label: tOrFallback(
          `settings.defaultDisplayPage.transitionOptions.${opt.value}`,
          opt.label,
        ),
      })),
    // tOrFallback closes over `t`; rebuild when locale changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  const fullscreenThemes = useMemo(
    () =>
      FULLSCREEN_THEMES.map((theme) => ({
        ...theme,
        // Theme names ("Linen", "Paper", "Charcoal", …) are kept verbatim —
        // they're product names that don't translate. Only the group label
        // ("light"/"dark") below the name is translated, with a fallback to
        // the raw group identifier if a future group lacks a registered key.
        groupLabel: tOrFallback(
          `settings.defaultDisplayPage.themeGroups.${theme.group}`,
          theme.group,
        ),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  // Canvas controls — only relevant in single-display mode. Derive
  // orientation from the actual dimensions (the source of truth for the
  // canvas) rather than from displayTransform, which can be out of sync
  // from older configs.
  const orientation = displayWidth < displayHeight ? 'portrait' : 'landscape';
  const flipped =
    orientation === 'portrait'
      ? displayTransform === '270'
      : displayTransform === '180';
  const preset = resolvePreset(displayWidth, displayHeight);
  const [userPickedCustom, setUserPickedCustom] = useState(false);
  const isCustom = userPickedCustom || !preset;
  const presetValue = preset ? String(preset.short) : 'custom';

  const applyPreset = (
    short: number,
    long: number,
    orient: 'portrait' | 'landscape',
    flip: boolean,
  ) => {
    const w = orient === 'portrait' ? short : long;
    const h = orient === 'portrait' ? long : short;
    onChange({
      displayWidth: w,
      displayHeight: h,
      displayTransform: deriveDisplayTransform(orient, flip),
    });
  };

  const setOrientation = (next: 'portrait' | 'landscape') => {
    if (next === orientation) return;
    onChange({
      displayWidth: displayHeight,
      displayHeight: displayWidth,
      displayTransform: deriveDisplayTransform(next, flipped),
    });
    setUserPickedCustom(false);
  };

  const setFlipped = (next: boolean) => {
    onChange({ displayTransform: deriveDisplayTransform(orientation, next) });
  };

  return (
    <>
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-1">
          {t('settings.defaultDisplayPage.breadcrumb')}
        </div>
        <h1 className="text-xl font-semibold text-hs-text-primary">
          {t('settings.defaultDisplayPage.heading')}
        </h1>
        <p className="text-sm text-hs-text-faint mt-1">
          {t('settings.defaultDisplayPage.descriptionPart1')}
          <em>{t('settings.defaultDisplayPage.descriptionEmphasisNot')}</em>
          {t('settings.defaultDisplayPage.descriptionPart2')}
        </p>
        {isMultiDisplay && (
          <p className="text-xs text-hs-text-faint mt-2">
            {t('settings.defaultDisplayPage.multiDisplayNotePart1')}
            <strong className="text-hs-text-secondary">
              {t('settings.defaultDisplayPage.multiDisplayNotePerDisplay')}
            </strong>
            {t('settings.defaultDisplayPage.multiDisplayNotePart2')}
            <em>{t('settings.defaultDisplayPage.multiDisplayNotePerDisplaySection')}</em>
            {t('settings.defaultDisplayPage.multiDisplayNotePart3')}
          </p>
        )}
      </div>

      {/*
        6.4a flagged the literal pageLabel="this page" here. The cleanest fix
        is to omit the prop entirely — DefaultsBacklinkBanner already falls
        back to t('settings.backlinkBanner.thisPage') so the locale resolves
        at render time instead of being baked in English at the call site.
       */}
      <DefaultsBacklinkBanner overrides={overrides} />

      {/* Canvas controls — single-display installs only. In multi-display
          mode the global dims are vestigial (every DisplayNode owns its
          own resolution/rotation), so we hide them rather than letting
          the user edit values nothing reads. */}
      {!isMultiDisplay && (
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-2">
            {t('settings.defaultDisplayPage.canvas.heading')}
          </div>
          <div className="rounded-lg border border-hs-border bg-hs-panel/40">
            <FieldRow>
              <FieldLabel>{t('common.orientation')}</FieldLabel>
              <div className="flex rounded-md overflow-hidden border border-hs-border-strong">
                {(['portrait', 'landscape'] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOrientation(o)}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                      orientation === o
                        ? 'bg-hs-accent text-white'
                        : 'bg-hs-card text-hs-text-muted hover:text-hs-text-body hover:bg-hs-hover'
                    }`}
                  >
                    {o === 'portrait'
                      ? t('settings.defaultDisplayPage.canvas.orientationPortrait')
                      : t('settings.defaultDisplayPage.canvas.orientationLandscape')}
                  </button>
                ))}
              </div>
            </FieldRow>

            <FieldRow>
              <FieldLabel>{t('common.resolution')}</FieldLabel>
              <select
                value={isCustom ? 'custom' : presetValue}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setUserPickedCustom(true);
                    return;
                  }
                  setUserPickedCustom(false);
                  const p = RESOLUTION_PRESETS.find((r) => String(r.short) === e.target.value);
                  if (p) applyPreset(p.short, p.long, orientation, flipped);
                }}
                className="block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
              >
                {RESOLUTION_PRESETS.map((p) => {
                  const w = orientation === 'portrait' ? p.short : p.long;
                  const h = orientation === 'portrait' ? p.long : p.short;
                  return (
                    <option key={p.short} value={String(p.short)}>
                      {/* RESOLUTION_PRESETS labels (e.g. "1080p Full HD") are
                          industry-standard shorthand and stay verbatim across
                          locales — only the surrounding chrome is translated. */}
                      {p.label} ({w} × {h})
                    </option>
                  );
                })}
                <option value="custom">{t('settings.defaultDisplayPage.canvas.resolutionCustom')}</option>
              </select>
              {isCustom && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    value={displayWidth}
                    min={320}
                    max={7680}
                    onChange={(e) => {
                      const w = parseInt(e.target.value, 10);
                      if (w > 0) onChange({ displayWidth: w });
                    }}
                    className="block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent tabular-nums"
                    placeholder={t('settings.defaultDisplayPage.canvas.resolutionWidthPlaceholder')}
                  />
                  <span className="text-hs-text-faint text-sm">×</span>
                  <input
                    type="number"
                    value={displayHeight}
                    min={320}
                    max={7680}
                    onChange={(e) => {
                      const h = parseInt(e.target.value, 10);
                      if (h > 0) onChange({ displayHeight: h });
                    }}
                    className="block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent tabular-nums"
                    placeholder={t('settings.defaultDisplayPage.canvas.resolutionHeightPlaceholder')}
                  />
                </div>
              )}
              <FieldHelp>
                {t('settings.defaultDisplayPage.canvas.resolutionHelp')}
              </FieldHelp>
            </FieldRow>

            <FieldRow>
              <FieldLabel>{t('settings.defaultDisplayPage.canvas.flipLabel')}</FieldLabel>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={flipped}
                  onChange={(e) => setFlipped(e.target.checked)}
                  className="rounded bg-hs-card border-hs-border-strong text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
                />
                <span className="text-sm text-hs-text-secondary">
                  {t('settings.defaultDisplayPage.canvas.flipToggle')}
                </span>
              </label>
              <FieldHelp>
                {t('settings.defaultDisplayPage.canvas.flipHelp')}
              </FieldHelp>
            </FieldRow>
          </div>
        </div>
      )}

      {/* Inheritable defaults — these are what every per-display
          OverrideRow links back to. Mockup-aligned: single rounded
          container with border-b separated rows, no <h3>/<hr> dividers. */}
      <div className="rounded-lg border border-hs-border bg-hs-panel/40">
        <FieldRow>
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

        <FieldRow>
          <FieldLabel>{t('settings.defaultDisplayPage.fields.pauseEnabledLabel')}</FieldLabel>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={pauseEnabled}
              onChange={(e) => onChange({ pauseEnabled: e.target.checked })}
              className="rounded bg-hs-card border-hs-border-strong text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
            />
            <span className="text-sm text-hs-text-secondary">
              {t('settings.defaultDisplayPage.fields.pauseEnabledToggle')}
            </span>
          </label>
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

        <FieldRow>
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
          <FieldRow>
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

        <FieldRow>
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

        <FieldRow>
          <FieldLabel>{t('settings.defaultDisplayPage.fields.fullscreenThemeLabel')}</FieldLabel>
          <FieldHelp>
            {t('settings.defaultDisplayPage.fields.fullscreenThemeHelp')}
          </FieldHelp>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {fullscreenThemes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => onChange({ fullscreenTheme: theme.id })}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                  fullscreenTheme === theme.id
                    ? 'border-hs-accent bg-hs-accent-soft'
                    : 'border-hs-border-strong bg-hs-card hover:bg-hs-hover'
                }`}
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
                      fullscreenTheme === theme.id ? 'text-hs-accent-hover' : 'text-hs-text-body'
                    }`}
                  >
                    {theme.name}
                  </div>
                  <div className="text-[10px] text-hs-text-faint">{theme.groupLabel}</div>
                </div>
              </button>
            ))}
          </div>
        </FieldRow>
      </div>
    </>
  );
}

/* ─── Mockup-aligned field-row primitives ─────────────────────────────
 *
 * The mockup renders each row as `padding: 14px 16px; border-bottom: 1px
 * solid #262626;`. Extracted as small local components so the rendering
 * stays consistent across rows without polluting a shared module — these
 * primitives have only one consumer and exist purely to make the JSX
 * above readable. The plan calls for a "single rounded container with
 * border-b separated rows," so the bottom border is added by `FieldRow`
 * itself rather than by the parent container styling each child.
 */
function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-3.5 border-b border-hs-border last:border-b-0">{children}</div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-hs-text-muted mb-2">{children}</div>;
}

function FieldHelp({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-hs-text-faint mt-1.5">{children}</p>;
}
