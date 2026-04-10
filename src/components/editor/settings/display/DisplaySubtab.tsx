'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import Link from 'next/link';
import Slider from '@/components/ui/Slider';
import OverrideRow from '@/components/editor/settings/OverrideRow';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { useEditorStore } from '@/stores/editor-store';
import { DISPLAY_OVERRIDE_FIELDS } from '@/lib/display-override-fields';
import { findDisplaysOverridingFields } from '@/lib/display-defaults-backlinks';
import type {
  DisplayNode,
  ScreenConfiguration,
  TransitionEffect,
} from '@/types/config';

interface DisplaySubtabProps {
  config: ScreenConfiguration;
  display: DisplayNode;
}

const TRANSITION_OPTIONS: { value: TransitionEffect; label: string }[] = [
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide Left' },
  { value: 'slide-up', label: 'Slide Up' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'flip', label: '3D Flip' },
  { value: 'blur', label: 'Blur' },
  { value: 'crossfade', label: 'Crossfade (overlap)' },
  { value: 'none', label: 'None (instant)' },
];

const DEFAULTS_HREF = '?section=defaults&page=display';
const DEFAULTS_LABEL = 'Defaults → Display';

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
  const { updateDisplay, updateDisplaySettings, saveConfig } = useEditorStore();
  const overrides = display.settings ?? {};
  const settings = config.settings;

  // Local working copy of canvas dims so the user can type freely without
  // every keystroke hitting the store. We commit on blur or Enter to keep
  // partial input states (e.g. "10" while the user types "1080") from
  // resizing the canvas mid-edit.
  const [widthDraft, setWidthDraft] = useState<string>(
    String(display.displayWidth ?? settings.displayWidth ?? 1080),
  );
  const [heightDraft, setHeightDraft] = useState<string>(
    String(display.displayHeight ?? settings.displayHeight ?? 1920),
  );

  // On blur / Enter, commit the parsed draft back to the store if it's
  // a valid positive integer within the 16384 dimension cap. Invalid or
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
    const current = display.displayWidth ?? settings.displayWidth ?? 1080;
    if (Number.isFinite(n) && n > 0 && n <= 16384) {
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
    const current = display.displayHeight ?? settings.displayHeight ?? 1920;
    if (Number.isFinite(n) && n > 0 && n <= 16384) {
      if (n !== current) {
        updateDisplay(display.id, { displayHeight: n });
        await saveConfig();
      }
    } else {
      setHeightDraft(String(current));
    }
  };

  const handleTransform = async (next: 'normal' | '90' | '180' | '270') => {
    // Auto-swap dims so the canvas long edge always lines up with the
    // rotation label. Mirrors the same rule in editor-store.orientDimensions
    // and the DisplayForm in DisplaysSection.
    const wantPortrait = next === '90' || next === '270';
    const w = display.displayWidth ?? settings.displayWidth ?? 1080;
    const h = display.displayHeight ?? settings.displayHeight ?? 1920;
    const long = Math.max(w, h);
    const short = Math.min(w, h);
    const finalW = wantPortrait ? short : long;
    const finalH = wantPortrait ? long : short;
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

  // Counts for the bulk-actions footer. We reuse `findDisplaysOverridingFields`
  // so the count comes from the same source as the Defaults page banner.
  const overrideSummary = findDisplaysOverridingFields(config, DISPLAY_OVERRIDE_FIELDS).find(
    (s) => s.displayId === display.id,
  );
  const overrideCount = overrideSummary?.overriddenFields.length ?? 0;

  const handleClearAll = async () => {
    const updates: Record<string, undefined> = {};
    for (const field of DISPLAY_OVERRIDE_FIELDS) updates[field] = undefined;
    updateDisplaySettings(display.id, updates);
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
          Fields here show the <strong className="text-hs-text-primary">default</strong> value from{' '}
          <Link
            href={DEFAULTS_HREF}
            className="text-hs-accent hover:text-hs-accent-hover underline decoration-dashed underline-offset-2"
          >
            {DEFAULTS_LABEL}
          </Link>
          . Click <strong className="text-hs-text-primary">Override</strong> on any field to change it
          just for {display.name}.
        </div>
      </div>

      {/* Canvas section — resolution, rotation, flip. Per-display only. */}
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-2">Canvas</div>
        <div className="rounded-lg border border-hs-border bg-hs-panel/40">
          <div className="px-4 py-3.5 border-b border-hs-border">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-hs-text-muted">Resolution</div>
              <span className="text-[10px] uppercase tracking-wider text-hs-text-faint">Per display</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={widthDraft}
                min={1}
                max={16384}
                onChange={(e) => setWidthDraft(e.target.value)}
                onBlur={commitWidth}
                className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent tabular-nums"
              />
              <input
                type="number"
                value={heightDraft}
                min={1}
                max={16384}
                onChange={(e) => setHeightDraft(e.target.value)}
                onBlur={commitHeight}
                className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent tabular-nums"
              />
            </div>
            <p className="text-[11px] text-hs-text-faint mt-1.5">
              Modules are laid out against this canvas. Every display carries its own resolution
              — it isn&apos;t shared.
            </p>
          </div>
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-hs-text-muted">Rotation</div>
              <span className="text-[10px] uppercase tracking-wider text-hs-text-faint">Per display</span>
            </div>
            <select
              value={display.displayTransform ?? 'normal'}
              onChange={(e) => handleTransform(e.target.value as 'normal' | '90' | '180' | '270')}
              className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
            >
              <option value="normal">Normal (landscape)</option>
              <option value="90">90° clockwise (portrait)</option>
              <option value="180">180° (inverted)</option>
              <option value="270">270° clockwise (portrait)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Rotation & transitions — inheritable */}
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-2">
          Rotation &amp; transitions
        </div>
        <div className="rounded-lg border border-hs-border bg-hs-panel/40">
          <OverrideRow
            label="Screen rotation interval"
            defaultValue={(settings.rotationIntervalMs ?? 30000) / 1000}
            override={overrides.rotationIntervalMs != null ? overrides.rotationIntervalMs / 1000 : undefined}
            onFork={(seed) => setOverride('rotationIntervalMs', seed * 1000)}
            onReset={() => setOverride('rotationIntervalMs', undefined)}
            defaultsPageHref={DEFAULTS_HREF}
            defaultsPageLabel={DEFAULTS_LABEL}
            formatValue={(v) => `${v} seconds`}
            displayName={display.name}
          >
            {({ value, onChange, disabled }) => (
              <Slider label="" value={value} min={5} max={120} step={5} displayValue={`${value}s`} onChange={onChange} disabled={disabled} />
            )}
          </OverrideRow>

          <OverrideRow<TransitionEffect>
            label="Transition effect"
            defaultValue={(settings.transitionEffect ?? 'fade') as TransitionEffect}
            override={overrides.transitionEffect}
            onFork={(seed) => setOverride('transitionEffect', seed)}
            onReset={() => setOverride('transitionEffect', undefined)}
            defaultsPageHref={DEFAULTS_HREF}
            defaultsPageLabel={DEFAULTS_LABEL}
            formatValue={(v) => TRANSITION_OPTIONS.find((t) => t.value === v)?.label ?? String(v)}
            displayName={display.name}
          >
            {({ value, onChange, disabled }) => (
              <select
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value as TransitionEffect)}
                className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent disabled:opacity-50"
              >
                {TRANSITION_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
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
              label="Transition duration"
              defaultValue={settings.transitionDuration ?? 0.6}
              override={overrides.transitionDuration}
              onFork={(seed) => setOverride('transitionDuration', seed)}
              onReset={() => setOverride('transitionDuration', undefined)}
              defaultsPageHref={DEFAULTS_HREF}
              defaultsPageLabel={DEFAULTS_LABEL}
              formatValue={(v) => `${v.toFixed(1)}s`}
              displayName={display.name}
            >
              {({ value, onChange, disabled }) => (
                <Slider
                  label=""
                  value={value}
                  min={0.3}
                  max={2}
                  step={0.1}
                  displayValue={`${value.toFixed(1)}s`}
                  onChange={onChange}
                  disabled={disabled}
                />
              )}
            </OverrideRow>
          )}

          <OverrideRow
            label="Allow pause on touchscreen"
            defaultValue={settings.pauseEnabled ?? true}
            override={overrides.pauseEnabled}
            onFork={(seed) => setOverride('pauseEnabled', seed)}
            onReset={() => setOverride('pauseEnabled', undefined)}
            defaultsPageHref={DEFAULTS_HREF}
            defaultsPageLabel={DEFAULTS_LABEL}
            formatValue={(v) => (v ? 'Enabled' : 'Disabled')}
            displayName={display.name}
          >
            {({ value, onChange, disabled }) => (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  disabled={disabled}
                  onChange={(e) => onChange(e.target.checked)}
                  className="rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
                />
                <span className="text-sm text-hs-text-secondary">Enabled</span>
              </label>
            )}
          </OverrideRow>

          {/* Same orphan-visibility rule as transitionDuration above:
              stay visible whenever the override exists even if
              `pauseEnabled` was overridden to false. */}
          {(effectivePauseEnabled || overrides.pauseTimeoutSeconds !== undefined) && (
            <OverrideRow
              label="Auto-resume timeout"
              defaultValue={settings.pauseTimeoutSeconds ?? 300}
              override={overrides.pauseTimeoutSeconds}
              onFork={(seed) => setOverride('pauseTimeoutSeconds', seed)}
              onReset={() => setOverride('pauseTimeoutSeconds', undefined)}
              defaultsPageHref={DEFAULTS_HREF}
              defaultsPageLabel={DEFAULTS_LABEL}
              formatValue={(v) => (v === 0 ? 'Never' : `${v}s`)}
              displayName={display.name}
            >
              {({ value, onChange, disabled }) => (
                <Slider
                  label=""
                  value={value}
                  min={0}
                  max={600}
                  step={30}
                  displayValue={value === 0 ? 'Never' : `${value}s`}
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
        <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-2">Appearance</div>
        <div className="rounded-lg border border-hs-border bg-hs-panel/40">
          <OverrideRow
            label="Hide cursor after"
            defaultValue={settings.cursorHideSeconds ?? 3}
            override={overrides.cursorHideSeconds}
            onFork={(seed) => setOverride('cursorHideSeconds', seed)}
            onReset={() => setOverride('cursorHideSeconds', undefined)}
            defaultsPageHref={DEFAULTS_HREF}
            defaultsPageLabel={DEFAULTS_LABEL}
            formatValue={(v) => `${v}s`}
            displayName={display.name}
          >
            {({ value, onChange, disabled }) => (
              <Slider label="" value={value} min={1} max={30} step={1} displayValue={`${value}s`} onChange={onChange} disabled={disabled} />
            )}
          </OverrideRow>

          <OverrideRow
            label="Fullscreen theme"
            defaultValue={settings.fullscreenTheme ?? 'linen'}
            override={overrides.fullscreenTheme}
            onFork={(seed) => setOverride('fullscreenTheme', seed)}
            onReset={() => setOverride('fullscreenTheme', undefined)}
            defaultsPageHref={DEFAULTS_HREF}
            defaultsPageLabel={DEFAULTS_LABEL}
            formatValue={(v) => FULLSCREEN_THEMES.find((t) => t.id === v)?.name ?? v}
            displayName={display.name}
          >
            {({ value, onChange, disabled }) => (
              <div className="grid grid-cols-3 gap-2">
                {FULLSCREEN_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(t.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      value === t.id
                        ? 'border-hs-accent bg-hs-accent-soft'
                        : 'border-hs-border-strong bg-hs-card hover:bg-hs-hover'
                    } disabled:cursor-not-allowed`}
                  >
                    <div
                      className="w-7 h-7 rounded-md flex-shrink-0 overflow-hidden border border-hs-border-strong"
                      style={{ background: t.tokens.bg }}
                    >
                      <div style={{ height: '60%', background: t.tokens.bg }} />
                      <div style={{ height: '40%', background: t.tokens.border }} />
                    </div>
                    <div>
                      <div className={`text-xs font-semibold ${value === t.id ? 'text-hs-accent-hover' : 'text-hs-text-body'}`}>
                        {t.name}
                      </div>
                      <div className="text-[10px] text-hs-text-faint capitalize">{t.group}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </OverrideRow>
        </div>
      </div>

      {/* Bulk actions footer — count + clear. Scoped to display-category
          fields only (the ones rendered above), NOT a catch-all clear
          across every subtab. A user who has also forked Sleep or Alerts
          needs to visit those subtabs to reset them — we don't want a
          button here to silently wipe out the other two whole-block
          overrides on an unrelated page. */}
      <div className="mt-6 flex items-center justify-between border-t border-hs-border pt-4">
        <div className="text-xs text-hs-text-faint">
          <span className="text-hs-text-secondary">
            {overrideCount} display {overrideCount === 1 ? 'override' : 'overrides'}
          </span>{' '}
          active for {display.name}.
        </div>
        {overrideCount > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="text-xs text-hs-danger hover:text-hs-danger transition-colors"
            title="Reset every field on this subtab to its default. Sleep and Alerts overrides are unaffected."
          >
            Clear display overrides
          </button>
        )}
      </div>
    </>
  );
}
