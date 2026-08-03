'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SCREEN_PANEL_IDS } from '@/lib/settings-route';
import { useNavigateToPanel } from '@/components/editor/settings/useNavigateToPanel';
import type { ScreenConfiguration, TransitionEffect } from '@/types/config';
import { findDisplaysOverridingFields } from '@/lib/display-defaults-backlinks';
import {
  ALERT_OVERRIDE_FIELDS,
  DISPLAY_OVERRIDE_FIELDS,
  SLEEP_OVERRIDE_FIELDS,
} from '@/lib/display-override-fields';
import DefaultsPageShell from '@/components/editor/settings/DefaultsPageShell';
import SleepFormFields, {
  type SleepFormValues,
} from '@/components/editor/settings/display/SleepFormFields';
import AlertFormFields, {
  type AlertFormValues,
} from '@/components/editor/settings/display/AlertFormFields';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import { RESOLUTION_PRESETS, deriveDisplayTransform } from '@/lib/constants';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { TRANSITION_OPTIONS } from '@/lib/transitions';
import { useTranslate, type TranslateFn } from '@/i18n';

/**
 * The Screen page's tab set, mirroring AutomationSection's URL-driven
 * `?panel=` pattern so the two tabbed Defaults pages behave identically.
 * Canvas controls (single-display only) live at the top of `appearance`
 * since they're display geometry.
 */
// Sourced from settings-route so the route parser and this tab bar cannot
// disagree about which panel ids exist.
const SCREEN_PANELS = SCREEN_PANEL_IDS;
type ScreenPanel = (typeof SCREEN_PANELS)[number];

function isScreenPanel(value: string | undefined): value is ScreenPanel {
  return !!value && (SCREEN_PANELS as readonly string[]).includes(value);
}

function panelLabel(panel: ScreenPanel, t: TranslateFn): string {
  switch (panel) {
    case 'appearance':
      return t('settings.screenPage.rotationAppearanceHeading');
    case 'sleep':
      return t('settings.screenPage.sleepHeading');
    case 'alerts':
      return t('settings.screenPage.alertsHeading');
  }
}

/**
 * When a sidebar field-search result deep-links here with `?highlight=`,
 * the target field only mounts on its owning tab — so with no explicit
 * `?panel=`, pick the tab from the highlight's field-id prefix instead of
 * always landing on `appearance` (where the highlight would silently
 * time out for sleep/alert fields).
 */
function panelForHighlight(highlight: string | null): ScreenPanel {
  if (highlight?.startsWith('sleep.')) return 'sleep';
  if (highlight?.startsWith('alerts.')) return 'alerts';
  return 'appearance';
}

export interface ScreenDisplayValues {
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

interface ScreenSectionProps {
  /** The full config — needed for the backlink banner scan and to decide whether canvas controls render. */
  config: ScreenConfiguration;
  /** Active tab, from the resolved settings route. Undefined means "no tab named". */
  panel?: string;
  displayValues: ScreenDisplayValues;
  sleepValues: SleepFormValues;
  alertValues: AlertFormValues;
  onDisplayChange: (updates: Partial<ScreenDisplayValues>) => void;
  onSleepChange: (updates: Partial<SleepFormValues>) => void;
  onAlertsChange: (updates: Partial<AlertFormValues>) => void;
}

function resolvePreset(width: number, height: number) {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  return RESOLUTION_PRESETS.find((p) => p.short === short && p.long === long) ?? null;
}

/**
 * The "Defaults → Screen" page — the source-of-truth for every shared
 * screen-behavior value: rotation interval, transitions, theme, sleep /
 * dimming, and the alert overlay. Merged from the former Display, Sleep,
 * and Alerts pages: all three were inheritable-defaults pages sharing
 * `DefaultsPageShell`, and Sleep/Alerts were a single form block each,
 * so they render here as cards under one backlink banner.
 *
 * Every per-display override (rendered on the per-display Overrides
 * subtab) links its help text back here, and this page in turn renders a
 * `DefaultsBacklinkBanner` listing which displays currently override its
 * fields — the union of the display, sleep, and alert field lists, so
 * one banner covers all three cards.
 *
 * Canvas controls (orientation/resolution/flip) only render in
 * single-display installs because that's the only mode where the global
 * `config.settings.displayWidth/Height/Transform` is actually read by a
 * display. In multi-display mode every `DisplayNode` owns its own copy on
 * the node itself (edited from `Per display → <X> → Overrides`) — so the
 * global fields become vestigial and exposing them here would let users
 * edit values nothing reads.
 */
export default function ScreenSection({
  config,
  panel: routePanel,
  displayValues,
  sleepValues,
  alertValues,
  onDisplayChange,
  onSleepChange,
  onAlertsChange,
}: ScreenSectionProps) {
  const t = useTranslate('editor');
  const searchParams = useSearchParams();

  // The active tab comes from the resolved route, not from a second, private
  // read of `?panel=` — two parsers of the same URL would be free to drift.
  // `?highlight=` still selects a tab when the route names none, so a
  // field-search result can jump straight to the tab that renders it.
  const panel: ScreenPanel = isScreenPanel(routePanel)
    ? routePanel
    : panelForHighlight(searchParams?.get('highlight') ?? null);

  const navigateToPanel = useNavigateToPanel('screen');

  // Scan displays for overrides only when `config` changes. Without the
  // memo this runs on every keystroke into the form (which updates
  // the values/onChange identities), and for a ≤64-display install
  // that's cheap but wasteful — the scan is pure over config. The three
  // field lists are unioned so the banner reports overrides from any of
  // the cards below.
  const overrides = useMemo(
    () =>
      findDisplaysOverridingFields(config, [
        ...DISPLAY_OVERRIDE_FIELDS,
        ...SLEEP_OVERRIDE_FIELDS,
        ...ALERT_OVERRIDE_FIELDS,
      ]),
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
  } = displayValues;

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
    onDisplayChange({
      displayWidth: w,
      displayHeight: h,
      displayTransform: deriveDisplayTransform(orient, flip),
    });
  };

  const setOrientation = (next: 'portrait' | 'landscape') => {
    if (next === orientation) return;
    onDisplayChange({
      displayWidth: displayHeight,
      displayHeight: displayWidth,
      displayTransform: deriveDisplayTransform(next, flipped),
    });
    setUserPickedCustom(false);
  };

  const setFlipped = (next: boolean) => {
    onDisplayChange({ displayTransform: deriveDisplayTransform(orientation, next) });
  };

  return (
    <DefaultsPageShell
      breadcrumb={t('settings.screenPage.breadcrumb')}
      heading={t('settings.screenPage.heading')}
      description={
        <>
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
        </>
      }
      overrides={overrides}
    >

      {/* Tab bar — same visual pattern as AutomationSection and
          PerDisplayPage. The backlink banner above stays visible on every
          tab since it reports the union of all three field groups. */}
      <div className="flex items-center border-b border-hs-border mb-5">
        {SCREEN_PANELS.map((p) => (
          <button
            key={p}
            type="button"
            data-testid={`screen-tab-${p}`}
            onClick={() => navigateToPanel(p)}
            className={`px-1 py-2.5 mr-6 text-sm transition-colors border-b-2 ${
              panel === p
                ? 'text-hs-text-primary border-hs-accent'
                : 'text-hs-text-faint border-transparent hover:text-hs-text-secondary'
            }`}
          >
            {panelLabel(p, t)}
          </button>
        ))}
      </div>

      {/* Canvas controls — single-display installs only. In multi-display
          mode the global dims are vestigial (every DisplayNode owns its
          own resolution/rotation), so we hide them rather than letting
          the user edit values nothing reads. */}
      {panel === 'appearance' && !isMultiDisplay && (
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-2">
            {t('settings.defaultDisplayPage.canvas.heading')}
          </div>
          <div className="rounded-lg border border-hs-border bg-hs-panel/40">
            <FieldRow fieldId="display.canvasOrientation">
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

            <FieldRow fieldId="display.canvasResolution">
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
                      if (w > 0) onDisplayChange({ displayWidth: w });
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
                      if (h > 0) onDisplayChange({ displayHeight: h });
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

            <FieldRow fieldId="display.canvasFlip">
              <FieldLabel>{t('settings.defaultDisplayPage.canvas.flipLabel')}</FieldLabel>
              <Toggle
                label={t('settings.defaultDisplayPage.canvas.flipToggle')}
                checked={flipped}
                onChange={(v) => setFlipped(v)}
              />
              <FieldHelp>
                {t('settings.defaultDisplayPage.canvas.flipHelp')}
              </FieldHelp>
            </FieldRow>
          </div>
        </div>
      )}

      {/* Rotation & appearance — the inheritable display defaults that every
          per-display OverrideRow links back to. Mockup-aligned: single
          rounded container with border-b separated rows. */}
      {panel === 'appearance' && (
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
            onChange={(v) => onDisplayChange({ rotationInterval: v })}
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
            onChange={(v) => onDisplayChange({ pauseEnabled: v })}
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
                onChange={(v) => onDisplayChange({ pauseTimeoutSeconds: v })}
              />
              <FieldHelp>
                {t('settings.defaultDisplayPage.fields.pauseTimeoutHelp')}
              </FieldHelp>
            </div>
          )}
        </FieldRow>

        <FieldRow fieldId="display.transitionEffect">
          <FieldLabel>{t('settings.defaultDisplayPage.fields.transitionEffectLabel')}</FieldLabel>
          <select
            value={transitionEffect}
            onChange={(e) => onDisplayChange({ transitionEffect: e.target.value })}
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
              onChange={(v) => onDisplayChange({ transitionDuration: v })}
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
            onChange={(v) => onDisplayChange({ cursorHideSeconds: v })}
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
          <div className="grid grid-cols-3 gap-2 mt-3">
            {fullscreenThemes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => onDisplayChange({ fullscreenTheme: theme.id })}
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
      </div>
      )}

      {/* Sleep & dimming — formerly the Defaults → Sleep page. Whole-block
          overridable per display, so the backlink banner above already
          covers it via SLEEP_OVERRIDE_FIELDS. */}
      {panel === 'sleep' && (
        <div>
          <p className="text-xs text-hs-text-faint mb-3">
            {t('settings.defaultSleepPage.description')}
          </p>
          <div className="rounded-lg border border-hs-border bg-hs-panel/40 p-4">
            <SleepFormFields values={sleepValues} onChange={onSleepChange} />
          </div>
        </div>
      )}

      {/* Alerts — formerly the Defaults → Alerts page. The `displayId`
          prop is intentionally not passed so the inlined "Clear all
          alerts" affordance stays off the shared defaults page — clearing
          is a per-display operation on the Overrides subtab. */}
      {panel === 'alerts' && (
        <div>
          <p className="text-xs text-hs-text-faint mb-3">
            {t('settings.defaultAlertsPage.description')}
          </p>
          <div className="rounded-lg border border-hs-border bg-hs-panel/40 p-4">
            <AlertFormFields values={alertValues} onChange={onAlertsChange} />
          </div>
        </div>
      )}
    </DefaultsPageShell>
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
function FieldRow({ fieldId, children }: { fieldId?: string; children: React.ReactNode }) {
  return (
    <div data-field-id={fieldId} className="px-4 py-3.5 border-b border-hs-border last:border-b-0">{children}</div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-hs-text-muted mb-2">{children}</div>;
}

function FieldHelp({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-hs-text-faint mt-1.5">{children}</p>;
}
