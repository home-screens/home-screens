'use client';

import ColorPicker from '@/components/ui/ColorPicker';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance, ShapeConfig, ShapeView } from '@/types/config';

const VIEW_OPTIONS = [
  { value: 'divider',     label: 'Divider line' },
  { value: 'double-line', label: 'Double line' },
  { value: 'wave',        label: 'Wave' },
  { value: 'zigzag',      label: 'Zigzag' },
  { value: 'dotted-row',  label: 'Dotted row' },
  { value: 'rectangle',   label: 'Rectangle' },
  { value: 'circle',      label: 'Circle' },
  { value: 'triangle',    label: 'Triangle' },
  { value: 'polygon',     label: 'Polygon' },
  { value: 'star',        label: 'Star' },
  { value: 'arrow',       label: 'Arrow' },
  { value: 'glow',        label: 'Glow (radial)' },
  { value: 'gradient',    label: 'Gradient panel' },
  { value: 'grid',        label: 'Grid pattern' },
  { value: 'frame',       label: 'Frame' },
] as const;

const FILL_OPTIONS = [
  { value: 'solid',    label: 'Solid color' },
  { value: 'gradient', label: 'Gradient' },
] as const;

const ORIENTATION_OPTIONS = [
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical',   label: 'Vertical' },
  { value: 'diagonal',   label: 'Diagonal' },
] as const;

const LINE_STYLE_OPTIONS = [
  { value: 'solid',  label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
] as const;

const END_STYLE_OPTIONS = [
  { value: 'flat',    label: 'Flat' },
  { value: 'fade',    label: 'Fade out' },
  { value: 'rounded', label: 'Rounded' },
] as const;

const ARROW_DIRECTION_OPTIONS = [
  { value: 'right', label: 'Right' },
  { value: 'down',  label: 'Down' },
  { value: 'left',  label: 'Left' },
  { value: 'up',    label: 'Up' },
] as const;

const GRID_PATTERN_OPTIONS = [
  { value: 'dots',  label: 'Dots' },
  { value: 'lines', label: 'Lines' },
  { value: 'cross', label: 'Crosses' },
] as const;

const FRAME_STYLE_OPTIONS = [
  { value: 'rectangle', label: 'Rectangle outline' },
  { value: 'brackets',  label: 'Corner brackets' },
] as const;

// ---------------------------------------------------------------------------
// Predicates: which views show which fields
// ---------------------------------------------------------------------------

const LINE_VIEWS = new Set<ShapeView>(['divider', 'double-line', 'wave', 'zigzag', 'dotted-row']);
const STROKED_LINE_VIEWS = new Set<ShapeView>(['divider', 'double-line', 'wave', 'zigzag']);
const WAVE_VIEWS = new Set<ShapeView>(['wave', 'zigzag']);
const FILLABLE_SHAPES = new Set<ShapeView>(['rectangle', 'circle', 'triangle', 'polygon', 'star', 'arrow']);
const ROTATABLE = new Set<ShapeView>(['triangle', 'polygon', 'star']);
const ORIENTABLE = new Set<ShapeView>(['divider', 'double-line', 'dotted-row']);

function showsGradient(view: ShapeView): boolean {
  // glow uses a radial fade of `color`; gradient view forces gradient anyway —
  // both hide the fill-mode toggle.
  return view !== 'glow' && view !== 'gradient';
}

function showsColor(view: ShapeView, fillMode: ShapeConfig['fillMode']): boolean {
  if (view === 'gradient') return false;
  if (view === 'glow') return true; // glow always solid color
  return fillMode === 'solid';
}

function showsGradientPair(view: ShapeView, fillMode: ShapeConfig['fillMode']): boolean {
  if (view === 'gradient') return true;
  if (view === 'glow') return false;
  return fillMode === 'gradient';
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export function ShapeConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<ShapeConfig>(mod, screenId);
  const view: ShapeView = c.view ?? 'divider';
  const fillMode = c.fillMode ?? 'solid';

  return (
    <>
      <LabeledSelect
        label="Shape"
        value={view}
        onChange={(v) => set({ view: v as ShapeView })}
        options={VIEW_OPTIONS}
      />

      {/* Fill mode toggle (hidden for glow/gradient — those have fixed paint behavior) */}
      {showsGradient(view) && (
        <LabeledSelect
          label="Fill"
          value={fillMode}
          onChange={(v) => set({ fillMode: v as ShapeConfig['fillMode'] })}
          options={FILL_OPTIONS}
        />
      )}

      {showsColor(view, fillMode) && (
        <ColorPicker
          label="Color"
          value={c.color ?? '#ffffff'}
          onChange={(v) => set({ color: v })}
        />
      )}

      {showsGradientPair(view, fillMode) && (
        <>
          <ColorPicker
            label="Gradient from"
            value={c.gradientFrom ?? '#a78bfa'}
            onChange={(v) => set({ gradientFrom: v })}
          />
          <ColorPicker
            label="Gradient to"
            value={c.gradientTo ?? '#22d3ee'}
            onChange={(v) => set({ gradientTo: v })}
          />
          <Slider
            label="Gradient angle"
            value={c.gradientAngle ?? 90}
            min={0}
            max={360}
            step={5}
            displayValue={`${c.gradientAngle ?? 90}°`}
            onChange={(v) => set({ gradientAngle: v })}
          />
        </>
      )}

      {/* ---- Line views ---- */}
      {ORIENTABLE.has(view) && (
        <LabeledSelect
          label="Orientation"
          value={c.orientation ?? 'horizontal'}
          onChange={(v) => set({ orientation: v as ShapeConfig['orientation'] })}
          options={ORIENTATION_OPTIONS}
        />
      )}

      {STROKED_LINE_VIEWS.has(view) && (
        <Slider
          label="Thickness"
          value={c.thickness ?? 2}
          min={1}
          max={20}
          displayValue={`${c.thickness ?? 2}px`}
          onChange={(v) => set({ thickness: v })}
        />
      )}

      {STROKED_LINE_VIEWS.has(view) && (
        <LabeledSelect
          label="Line style"
          value={c.lineStyle ?? 'solid'}
          onChange={(v) => set({ lineStyle: v as ShapeConfig['lineStyle'] })}
          options={LINE_STYLE_OPTIONS}
        />
      )}

      {LINE_VIEWS.has(view) && (
        <LabeledSelect
          label="Edge style"
          value={c.endStyle ?? 'fade'}
          onChange={(v) => set({ endStyle: v as ShapeConfig['endStyle'] })}
          // 'rounded' uses strokeLinecap, which has no effect on the fill-painted
          // dots in dotted-row — drop it from that view's options to avoid a
          // silent no-op selection.
          options={
            view === 'dotted-row'
              ? END_STYLE_OPTIONS.filter((o) => o.value !== 'rounded')
              : END_STYLE_OPTIONS
          }
        />
      )}

      {WAVE_VIEWS.has(view) && (
        <>
          <Slider
            label="Amplitude"
            value={c.waveAmplitude ?? 18}
            min={2}
            max={45}
            displayValue={`${c.waveAmplitude ?? 18}%`}
            onChange={(v) => set({ waveAmplitude: v })}
          />
          <Slider
            label="Frequency"
            value={c.waveFrequency ?? 4}
            min={1}
            max={20}
            displayValue={`${c.waveFrequency ?? 4}×`}
            onChange={(v) => set({ waveFrequency: v })}
          />
        </>
      )}

      {view === 'double-line' && (
        <Slider
          label="Line gap"
          value={c.doubleLineGap ?? 6}
          min={2}
          max={40}
          displayValue={`${c.doubleLineGap ?? 6}px`}
          onChange={(v) => set({ doubleLineGap: v })}
        />
      )}

      {view === 'dotted-row' && (
        <>
          <Slider
            label="Dot count"
            value={c.dotCount ?? 5}
            min={2}
            max={50}
            onChange={(v) => set({ dotCount: v })}
          />
          <Slider
            label="Dot size"
            value={c.dotSize ?? 4}
            min={1}
            max={20}
            displayValue={`${c.dotSize ?? 4}px`}
            onChange={(v) => set({ dotSize: v })}
          />
        </>
      )}

      {/* ---- Geometric shapes ---- */}
      {FILLABLE_SHAPES.has(view) && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={c.outline ?? false}
            onChange={(e) => set({ outline: e.target.checked })}
            className="accent-cyan-500"
          />
          <span className="text-xs text-hs-text-muted">Outline only (hollow)</span>
        </label>
      )}

      {FILLABLE_SHAPES.has(view) && c.outline && (
        <Slider
          label="Stroke width"
          value={c.strokeWidth ?? 2}
          min={0.5}
          max={20}
          step={0.5}
          displayValue={`${c.strokeWidth ?? 2}px`}
          onChange={(v) => set({ strokeWidth: v })}
        />
      )}

      {(view === 'rectangle' || view === 'gradient') && (
        <Slider
          label="Corner radius"
          value={c.cornerRadius ?? 12}
          min={0}
          max={120}
          displayValue={`${c.cornerRadius ?? 12}px`}
          onChange={(v) => set({ cornerRadius: v })}
        />
      )}

      {view === 'polygon' && (
        <Slider
          label="Sides"
          value={c.sides ?? 6}
          min={3}
          max={12}
          onChange={(v) => set({ sides: v })}
        />
      )}

      {view === 'star' && (
        <>
          <Slider
            label="Points"
            value={c.starPoints ?? 5}
            min={3}
            max={12}
            onChange={(v) => set({ starPoints: v })}
          />
          <Slider
            label="Point sharpness"
            value={c.starInnerRatio ?? 0.4}
            min={0.2}
            max={0.8}
            step={0.05}
            displayValue={`${Math.round((c.starInnerRatio ?? 0.4) * 100)}%`}
            onChange={(v) => set({ starInnerRatio: v })}
          />
        </>
      )}

      {ROTATABLE.has(view) && (
        <Slider
          label="Rotation"
          value={c.rotation ?? 0}
          min={0}
          max={360}
          step={5}
          displayValue={`${c.rotation ?? 0}°`}
          onChange={(v) => set({ rotation: v })}
        />
      )}

      {view === 'arrow' && (
        <>
          <LabeledSelect
            label="Direction"
            value={c.arrowDirection ?? 'right'}
            onChange={(v) => set({ arrowDirection: v as ShapeConfig['arrowDirection'] })}
            options={ARROW_DIRECTION_OPTIONS}
          />
          <Slider
            label="Head size"
            value={c.arrowHeadRatio ?? 0.35}
            min={0.1}
            max={0.6}
            step={0.05}
            displayValue={`${Math.round((c.arrowHeadRatio ?? 0.35) * 100)}%`}
            onChange={(v) => set({ arrowHeadRatio: v })}
          />
        </>
      )}

      {/* ---- Atmospheric ---- */}
      {view === 'glow' && (
        <>
          <Slider
            label="Intensity"
            value={c.intensity ?? 0.55}
            min={0}
            max={1}
            step={0.05}
            displayValue={`${Math.round((c.intensity ?? 0.55) * 100)}%`}
            onChange={(v) => set({ intensity: v })}
          />
          <Slider
            label="Softness"
            value={c.softness ?? 0.55}
            min={0.2}
            max={1}
            step={0.05}
            displayValue={`${Math.round((c.softness ?? 0.55) * 100)}%`}
            onChange={(v) => set({ softness: v })}
          />
        </>
      )}

      {view === 'grid' && (
        <>
          <LabeledSelect
            label="Pattern"
            value={c.gridPattern ?? 'dots'}
            onChange={(v) => set({ gridPattern: v as ShapeConfig['gridPattern'] })}
            options={GRID_PATTERN_OPTIONS}
          />
          <Slider
            label="Spacing"
            value={c.gridSpacing ?? 24}
            min={4}
            max={120}
            displayValue={`${c.gridSpacing ?? 24}px`}
            onChange={(v) => set({ gridSpacing: v })}
          />
          <Slider
            label="Mark size"
            value={c.gridDotSize ?? 2}
            min={0.5}
            max={20}
            step={0.5}
            displayValue={`${c.gridDotSize ?? 2}px`}
            onChange={(v) => set({ gridDotSize: v })}
          />
        </>
      )}

      {/* ---- Frame ---- */}
      {view === 'frame' && (
        <>
          <LabeledSelect
            label="Frame style"
            value={c.frameStyle ?? 'rectangle'}
            onChange={(v) => set({ frameStyle: v as ShapeConfig['frameStyle'] })}
            options={FRAME_STYLE_OPTIONS}
          />
          <Slider
            label="Stroke width"
            value={c.strokeWidth ?? 2}
            min={0.5}
            max={20}
            step={0.5}
            displayValue={`${c.strokeWidth ?? 2}px`}
            onChange={(v) => set({ strokeWidth: v })}
          />
          {c.frameStyle === 'rectangle' && (
            <Slider
              label="Corner radius"
              value={c.cornerRadius ?? 12}
              min={0}
              max={120}
              displayValue={`${c.cornerRadius ?? 12}px`}
              onChange={(v) => set({ cornerRadius: v })}
            />
          )}
          {c.frameStyle === 'brackets' && (
            <Slider
              label="Bracket length"
              value={c.bracketLength ?? 25}
              min={5}
              max={50}
              displayValue={`${c.bracketLength ?? 25}%`}
              onChange={(v) => set({ bracketLength: v })}
            />
          )}
        </>
      )}
    </>
  );
}
