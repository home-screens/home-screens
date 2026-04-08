'use client';

import { useMemo, useState } from 'react';
import type { ScreenConfiguration } from '@/types/config';
import { findDisplaysOverridingFields } from '@/lib/display-defaults-backlinks';
import { DISPLAY_OVERRIDE_FIELDS } from '@/lib/display-override-fields';
import DefaultsBacklinkBanner from '@/components/editor/settings/DefaultsBacklinkBanner';
import Slider from '@/components/ui/Slider';
import { RESOLUTION_PRESETS, deriveDisplayTransform } from '@/lib/constants';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';

const TRANSITION_OPTIONS = [
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide Left' },
  { value: 'slide-up', label: 'Slide Up' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'flip', label: '3D Flip' },
  { value: 'blur', label: 'Blur' },
  { value: 'crossfade', label: 'Crossfade (overlap)' },
  { value: 'none', label: 'None (instant)' },
] as const;

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
 * the node itself (edited from `Per display → <X> → Display`) and
 * `applyMainDisplayNormalization` keeps `displays[main]` in sync — so the
 * global fields become vestigial and exposing them here would let users
 * edit values nothing reads.
 */
export default function DefaultDisplaySection({ config, values, onChange }: DefaultDisplaySectionProps) {
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
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
          Defaults → Display
        </div>
        <h1 className="text-xl font-semibold text-neutral-100">Default display settings</h1>
        <p className="text-sm text-neutral-500 mt-1">
          These values are used by every display until a specific one overrides them. Change anything
          here and every display that&apos;s <em>not</em> overriding that field picks up the new value.
        </p>
        {isMultiDisplay && (
          <p className="text-xs text-neutral-500 mt-2">
            Resolution, orientation, and flip are <strong className="text-neutral-300">per display</strong>{' '}
            — edit them on each display&apos;s own page under <em>Per display</em>.
          </p>
        )}
      </div>

      <DefaultsBacklinkBanner overrides={overrides} pageLabel="this page" />

      {/* Canvas controls — single-display installs only. In multi-display
          mode the global dims are vestigial (every DisplayNode owns its
          own resolution/rotation), so we hide them rather than letting
          the user edit values nothing reads. */}
      {!isMultiDisplay && (
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">Canvas</div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
            <FieldRow>
              <FieldLabel>Orientation</FieldLabel>
              <div className="flex rounded-md overflow-hidden border border-neutral-700">
                {(['portrait', 'landscape'] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOrientation(o)}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                      orientation === o
                        ? 'bg-blue-600 text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700'
                    }`}
                  >
                    {o === 'portrait' ? 'Portrait' : 'Landscape'}
                  </button>
                ))}
              </div>
            </FieldRow>

            <FieldRow>
              <FieldLabel>Resolution</FieldLabel>
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
                className="block w-full rounded-md bg-neutral-800 border border-neutral-700 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
              >
                {RESOLUTION_PRESETS.map((p) => {
                  const w = orientation === 'portrait' ? p.short : p.long;
                  const h = orientation === 'portrait' ? p.long : p.short;
                  return (
                    <option key={p.short} value={String(p.short)}>
                      {p.label} ({w} × {h})
                    </option>
                  );
                })}
                <option value="custom">Custom...</option>
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
                    className="block w-full rounded-md bg-neutral-800 border border-neutral-700 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500 tabular-nums"
                    placeholder="Width"
                  />
                  <span className="text-neutral-500 text-sm">×</span>
                  <input
                    type="number"
                    value={displayHeight}
                    min={320}
                    max={7680}
                    onChange={(e) => {
                      const h = parseInt(e.target.value, 10);
                      if (h > 0) onChange({ displayHeight: h });
                    }}
                    className="block w-full rounded-md bg-neutral-800 border border-neutral-700 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500 tabular-nums"
                    placeholder="Height"
                  />
                </div>
              )}
              <FieldHelp>
                Match this to your physical display. Changing resolution affects the module canvas size.
              </FieldHelp>
            </FieldRow>

            <FieldRow>
              <FieldLabel>Flip display</FieldLabel>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={flipped}
                  onChange={(e) => setFlipped(e.target.checked)}
                  className="rounded bg-neutral-800 border-neutral-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span className="text-sm text-neutral-300">Inverted mount</span>
              </label>
              <FieldHelp>
                Enable if your monitor is mounted upside-down. Rotates the display 180° from its base
                orientation.
              </FieldHelp>
            </FieldRow>
          </div>
        </div>
      )}

      {/* Inheritable defaults — these are what every per-display
          OverrideRow links back to. Mockup-aligned: single rounded
          container with border-b separated rows, no <h3>/<hr> dividers. */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
        <FieldRow>
          <FieldLabel>Screen rotation interval</FieldLabel>
          <Slider
            label=""
            value={rotationInterval}
            min={5}
            max={120}
            step={5}
            onChange={(v) => onChange({ rotationInterval: v })}
          />
          <FieldHelp>
            How long each screen is shown before automatically cycling to the next. Only applies when
            you have multiple screens configured.
          </FieldHelp>
        </FieldRow>

        <FieldRow>
          <FieldLabel>Allow pause on touchscreen</FieldLabel>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={pauseEnabled}
              onChange={(e) => onChange({ pauseEnabled: e.target.checked })}
              className="rounded bg-neutral-800 border-neutral-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span className="text-sm text-neutral-300">Enabled</span>
          </label>
          <FieldHelp>
            Double-tap the active pagination dot to pause screen rotation. Double-tap again to resume.
          </FieldHelp>
          {pauseEnabled && (
            <div className="mt-3">
              <Slider
                label="Auto-resume timeout"
                value={pauseTimeoutSeconds}
                min={0}
                max={600}
                step={30}
                displayValue={pauseTimeoutSeconds === 0 ? 'Never' : `${pauseTimeoutSeconds}s`}
                onChange={(v) => onChange({ pauseTimeoutSeconds: v })}
              />
              <FieldHelp>
                Automatically resume rotation after this many seconds. Set to 0 to stay paused until
                manually resumed.
              </FieldHelp>
            </div>
          )}
        </FieldRow>

        <FieldRow>
          <FieldLabel>Transition effect</FieldLabel>
          <select
            value={transitionEffect}
            onChange={(e) => onChange({ transitionEffect: e.target.value })}
            className="block w-full rounded-md bg-neutral-800 border border-neutral-700 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            {TRANSITION_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <FieldHelp>
            Animation style when cycling between screens. Blur may be GPU-intensive on low-power devices.
          </FieldHelp>
        </FieldRow>

        {transitionEffect !== 'none' && (
          <FieldRow>
            <FieldLabel>Transition duration</FieldLabel>
            <Slider
              label=""
              value={transitionDuration}
              min={0.3}
              max={2}
              step={0.1}
              displayValue={`${transitionDuration.toFixed(1)}s`}
              onChange={(v) => onChange({ transitionDuration: v })}
            />
            <FieldHelp>How long the transition animation takes between screens.</FieldHelp>
          </FieldRow>
        )}

        <FieldRow>
          <FieldLabel>Hide cursor after</FieldLabel>
          <Slider
            label=""
            value={cursorHideSeconds}
            min={1}
            max={30}
            step={1}
            displayValue={`${cursorHideSeconds}s`}
            onChange={(v) => onChange({ cursorHideSeconds: v })}
          />
          <FieldHelp>
            The mouse cursor is hidden after this many seconds of inactivity. Move the mouse to show
            it again.
          </FieldHelp>
        </FieldRow>

        <FieldRow>
          <FieldLabel>Fullscreen theme</FieldLabel>
          <FieldHelp>
            Applies to all fullscreen modules (Calendar, Chores, Meals) so they look seamless when
            rotating. You can change this per module in the editor.
          </FieldHelp>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {FULLSCREEN_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange({ fullscreenTheme: t.id })}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                  fullscreenTheme === t.id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-neutral-700 bg-neutral-800 hover:bg-neutral-750 hover:border-neutral-600'
                }`}
              >
                <div
                  className="w-7 h-7 rounded-md flex-shrink-0 overflow-hidden border border-neutral-600"
                  style={{ background: t.tokens.bg }}
                >
                  <div style={{ height: '60%', background: t.tokens.bg }} />
                  <div style={{ height: '40%', background: t.tokens.border }} />
                </div>
                <div>
                  <div
                    className={`text-xs font-semibold ${
                      fullscreenTheme === t.id ? 'text-blue-400' : 'text-neutral-200'
                    }`}
                  >
                    {t.name}
                  </div>
                  <div className="text-[10px] text-neutral-500 capitalize">{t.group}</div>
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
    <div className="px-4 py-3.5 border-b border-neutral-800 last:border-b-0">{children}</div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-neutral-400 mb-2">{children}</div>;
}

function FieldHelp({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-neutral-500 mt-1.5">{children}</p>;
}
