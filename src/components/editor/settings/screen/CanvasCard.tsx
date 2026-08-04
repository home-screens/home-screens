'use client';

import Toggle from '@/components/ui/Toggle';
import { RESOLUTION_PRESETS, deriveDisplayTransform } from '@/lib/constants';
import { FieldHelp, FieldLabel, FieldRow } from '@/components/editor/settings/screen/FieldRow';
import type { DisplayState } from '@/lib/settings-form';
import { useTranslate } from '@/i18n';

interface CanvasCardProps {
  values: Pick<DisplayState, 'displayWidth' | 'displayHeight' | 'displayTransform'>;
  onChange: (updates: Partial<DisplayState>) => void;
  /**
   * Whether the user explicitly picked "Custom..." in the resolution
   * dropdown. Owned by `ScreenSection` rather than by this card: the card
   * unmounts on every tab switch, and losing the flag would snap the
   * dropdown back to the matching preset and hide the width/height inputs
   * while the user is still editing them.
   */
  userPickedCustom: boolean;
  onUserPickedCustomChange: (next: boolean) => void;
}

function resolvePreset(width: number, height: number) {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  return RESOLUTION_PRESETS.find((p) => p.short === short && p.long === long) ?? null;
}

/**
 * Canvas controls (orientation / resolution / flip) on the Screen page's
 * Appearance tab. Rendered in single-display installs only — see the
 * mounting note in `ScreenSection`.
 *
 * Orientation is derived from the actual dimensions (the source of truth
 * for the canvas) rather than from displayTransform, which can be out of
 * sync from older configs.
 */
export default function CanvasCard({
  values,
  onChange,
  userPickedCustom,
  onUserPickedCustomChange,
}: CanvasCardProps) {
  const t = useTranslate('editor');
  const { displayWidth, displayHeight, displayTransform } = values;

  const orientation = displayWidth < displayHeight ? 'portrait' : 'landscape';
  const flipped =
    orientation === 'portrait'
      ? displayTransform === '270'
      : displayTransform === '180';
  const preset = resolvePreset(displayWidth, displayHeight);
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
    onUserPickedCustomChange(false);
  };

  const setFlipped = (next: boolean) => {
    onChange({ displayTransform: deriveDisplayTransform(orientation, next) });
  };

  return (
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
                onUserPickedCustomChange(true);
                return;
              }
              onUserPickedCustomChange(false);
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
  );
}
