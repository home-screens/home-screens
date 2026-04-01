'use client';

import { useState } from 'react';
import Slider from '@/components/ui/Slider';
import {
  RESOLUTION_PRESETS,
  deriveDisplayTransform,
} from '@/lib/constants';
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

interface DisplaySettings {
  displayWidth: number;
  displayHeight: number;
  displayTransform: string;
  rotationInterval: number;
  cursorHideSeconds: number;
  transitionEffect: string;
  transitionDuration: number;
  fullscreenTheme: string;
}

interface Props {
  values: DisplaySettings;
  onChange: (updates: Partial<DisplaySettings>) => void;
}

function resolvePreset(width: number, height: number) {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  return RESOLUTION_PRESETS.find((p) => p.short === short && p.long === long) ?? null;
}

export default function DisplaySection({ values, onChange }: Props) {
  const { displayWidth, displayHeight, displayTransform, rotationInterval, cursorHideSeconds, transitionEffect, transitionDuration, fullscreenTheme } = values;

  // Derive orientation from the actual dimensions (source of truth for the canvas),
  // not from displayTransform which may be out of sync from the old UI.
  const orientation = displayWidth < displayHeight ? 'portrait' : 'landscape';
  const flipped = orientation === 'portrait'
    ? displayTransform === '270'
    : displayTransform === '180';
  const preset = resolvePreset(displayWidth, displayHeight);
  const [userPickedCustom, setUserPickedCustom] = useState(false);
  const isCustom = userPickedCustom || !preset;

  // Build the select value from the matched preset's short dimension
  const presetValue = preset ? String(preset.short) : 'custom';

  function applyPreset(short: number, long: number, orient: 'portrait' | 'landscape', flip: boolean) {
    const w = orient === 'portrait' ? short : long;
    const h = orient === 'portrait' ? long : short;
    onChange({
      displayWidth: w,
      displayHeight: h,
      displayTransform: deriveDisplayTransform(orient, flip),
    });
  }

  function setOrientation(newOrientation: 'portrait' | 'landscape') {
    if (newOrientation === orientation) return;
    // Swap width/height and update transform
    onChange({
      displayWidth: displayHeight,
      displayHeight: displayWidth,
      displayTransform: deriveDisplayTransform(newOrientation, flipped),
    });
    setUserPickedCustom(false);
  }

  function setFlipped(newFlipped: boolean) {
    onChange({
      displayTransform: deriveDisplayTransform(orientation, newFlipped),
    });
  }

  return (
    <section>
      <h3 className="text-sm font-medium text-neutral-300 mb-3 uppercase tracking-wider">
        Display
      </h3>

      {/* Orientation toggle */}
      <div className="mb-3">
        <span className="text-xs text-neutral-400">Orientation</span>
        <div className="mt-1 flex rounded-md overflow-hidden border border-neutral-600">
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
      </div>

      {/* Resolution picker */}
      <label className="block mb-3">
        <span className="text-xs text-neutral-400">Resolution</span>
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
          className="mt-1 block w-full rounded-md bg-neutral-800 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
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
              className="block w-full rounded-md bg-neutral-800 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
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
              className="block w-full rounded-md bg-neutral-800 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
              placeholder="Height"
            />
          </div>
        )}
        <p className="text-xs text-neutral-500 mt-1">
          Match this to your physical display. Changing resolution affects the module canvas size.
        </p>
      </label>

      {/* Flip toggle for inverted mounts */}
      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={flipped}
          onChange={(e) => setFlipped(e.target.checked)}
          className="rounded bg-neutral-800 border-neutral-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
        />
        <span className="text-sm text-neutral-300">Flip display (inverted mount)</span>
      </label>
      <p className="text-xs text-neutral-500 -mt-1 mb-3">
        Enable if your monitor is mounted upside-down. Rotates the display 180° from its base orientation.
      </p>

      <hr className="my-6 border-neutral-700" />
      <div className="mb-3">
        <Slider
          label="Screen Rotation (seconds)"
          value={rotationInterval}
          min={5}
          max={120}
          step={5}
          onChange={(v) => onChange({ rotationInterval: v })}
        />
        <p className="text-xs text-neutral-500 mt-1">
          How long each screen is shown before automatically cycling to the next.
          Only applies when you have multiple screens configured.
        </p>
      </div>
      <label className="block mb-3">
        <span className="text-xs text-neutral-400">Transition Effect</span>
        <select
          value={transitionEffect}
          onChange={(e) => onChange({ transitionEffect: e.target.value })}
          className="mt-1 block w-full rounded-md bg-neutral-800 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          {TRANSITION_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <p className="text-xs text-neutral-500 mt-1">
          Animation style when cycling between screens. Blur may be GPU-intensive on low-power devices.
        </p>
      </label>
      {transitionEffect !== 'none' && (
        <div className="mb-3">
          <Slider
            label="Transition Duration (seconds)"
            value={transitionDuration}
            min={0.3}
            max={2}
            step={0.1}
            displayValue={`${transitionDuration.toFixed(1)}s`}
            onChange={(v) => onChange({ transitionDuration: v })}
          />
          <p className="text-xs text-neutral-500 mt-1">
            How long the transition animation takes between screens.
          </p>
        </div>
      )}
      <hr className="my-6 border-neutral-700" />
      <div className="mb-3">
        <Slider
          label="Hide Cursor After (seconds)"
          value={cursorHideSeconds}
          min={1}
          max={30}
          step={1}
          onChange={(v) => onChange({ cursorHideSeconds: v })}
        />
        <p className="text-xs text-neutral-500 mt-1">
          The mouse cursor is hidden after this many seconds of inactivity. Move the mouse to show it again.
        </p>
      </div>

      <hr className="my-6 border-neutral-700" />
      <h3 className="text-sm font-medium text-neutral-300 mb-3 uppercase tracking-wider">
        Fullscreen Theme
      </h3>
      <p className="text-xs text-neutral-500 mb-3">
        Applies to all fullscreen modules (Calendar, Chores, Meals) so they look seamless when rotating. You can change this per
        module in the editor.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {FULLSCREEN_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange({ fullscreenTheme: t.id })}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors ${
              fullscreenTheme === t.id
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-neutral-600 bg-neutral-800 hover:bg-neutral-750 hover:border-neutral-500'
            }`}
          >
            {/* Two-tone swatch */}
            <div
              className="w-7 h-7 rounded-md flex-shrink-0 overflow-hidden border border-neutral-600"
              style={{ background: t.tokens.bg }}
            >
              <div style={{ height: '60%', background: t.tokens.bg }} />
              <div style={{ height: '40%', background: t.tokens.border }} />
            </div>
            <div>
              <div className={`text-xs font-semibold ${fullscreenTheme === t.id ? 'text-blue-400' : 'text-neutral-200'}`}>
                {t.name}
              </div>
              <div className="text-[10px] text-neutral-500 capitalize">{t.group}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
