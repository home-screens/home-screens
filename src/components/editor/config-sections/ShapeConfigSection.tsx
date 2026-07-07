'use client';

import { useTranslate } from '@/i18n';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance, ShapeConfig, ShapeView } from '@/types/config';

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
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<ShapeConfig>(mod, screenId);
  const view: ShapeView = c.view ?? 'divider';
  const fillMode = c.fillMode ?? 'solid';

  const VIEW_OPTIONS = [
    { value: 'divider',     label: t('configSections.shape.viewDivider') },
    { value: 'double-line', label: t('configSections.shape.viewDoubleLine') },
    { value: 'wave',        label: t('configSections.shape.viewWave') },
    { value: 'zigzag',      label: t('configSections.shape.viewZigzag') },
    { value: 'dotted-row',  label: t('configSections.shape.viewDottedRow') },
    { value: 'rectangle',   label: t('configSections.shape.viewRectangle') },
    { value: 'circle',      label: t('configSections.shape.viewCircle') },
    { value: 'triangle',    label: t('configSections.shape.viewTriangle') },
    { value: 'polygon',     label: t('configSections.shape.viewPolygon') },
    { value: 'star',        label: t('configSections.shape.viewStar') },
    { value: 'arrow',       label: t('configSections.shape.viewArrow') },
    { value: 'glow',        label: t('configSections.shape.viewGlow') },
    { value: 'gradient',    label: t('configSections.shape.viewGradient') },
    { value: 'grid',        label: t('configSections.shape.viewGrid') },
    { value: 'frame',       label: t('configSections.shape.viewFrame') },
  ] as const;

  const FILL_OPTIONS = [
    { value: 'solid',    label: t('configSections.shape.fillSolid') },
    { value: 'gradient', label: t('configSections.shape.fillGradient') },
  ] as const;

  const ORIENTATION_OPTIONS = [
    { value: 'horizontal', label: t('configSections.shape.orientationHorizontal') },
    { value: 'vertical',   label: t('configSections.shape.orientationVertical') },
    { value: 'diagonal',   label: t('configSections.shape.orientationDiagonal') },
  ] as const;

  const LINE_STYLE_OPTIONS = [
    { value: 'solid',  label: t('configSections.shape.lineStyleSolid') },
    { value: 'dashed', label: t('configSections.shape.lineStyleDashed') },
    { value: 'dotted', label: t('configSections.shape.lineStyleDotted') },
  ] as const;

  const END_STYLE_OPTIONS = [
    { value: 'flat',    label: t('configSections.shape.endStyleFlat') },
    { value: 'fade',    label: t('configSections.shape.endStyleFade') },
    { value: 'rounded', label: t('configSections.shape.endStyleRounded') },
  ] as const;

  const ARROW_DIRECTION_OPTIONS = [
    { value: 'right', label: t('configSections.shape.arrowRight') },
    { value: 'down',  label: t('configSections.shape.arrowDown') },
    { value: 'left',  label: t('configSections.shape.arrowLeft') },
    { value: 'up',    label: t('configSections.shape.arrowUp') },
  ] as const;

  const GRID_PATTERN_OPTIONS = [
    { value: 'dots',  label: t('configSections.shape.gridDots') },
    { value: 'lines', label: t('configSections.shape.gridLines') },
    { value: 'cross', label: t('configSections.shape.gridCross') },
  ] as const;

  const FRAME_STYLE_OPTIONS = [
    { value: 'rectangle', label: t('configSections.shape.frameRectangle') },
    { value: 'brackets',  label: t('configSections.shape.frameBrackets') },
  ] as const;

  return (
    <>
      <LabeledSelect
        label={t('configSections.shape.shape')}
        value={view}
        onChange={(v) => set({ view: v as ShapeView })}
        options={VIEW_OPTIONS}
      />

      {/* Fill mode toggle (hidden for glow/gradient — those have fixed paint behavior) */}
      {showsGradient(view) && (
        <LabeledSelect
          label={t('configSections.shape.fill')}
          value={fillMode}
          onChange={(v) => set({ fillMode: v as ShapeConfig['fillMode'] })}
          options={FILL_OPTIONS}
        />
      )}

      {showsColor(view, fillMode) && (
        <ColorPicker
          label={t('fields.color')}
          value={c.color ?? '#ffffff'}
          onChange={(v) => set({ color: v })}
        />
      )}

      {showsGradientPair(view, fillMode) && (
        <>
          <ColorPicker
            label={t('configSections.shape.gradientFrom')}
            value={c.gradientFrom ?? '#a78bfa'}
            onChange={(v) => set({ gradientFrom: v })}
          />
          <ColorPicker
            label={t('configSections.shape.gradientTo')}
            value={c.gradientTo ?? '#22d3ee'}
            onChange={(v) => set({ gradientTo: v })}
          />
          <Slider
            label={t('configSections.shape.gradientAngle')}
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
          label={t('configSections.shape.orientation')}
          value={c.orientation ?? 'horizontal'}
          onChange={(v) => set({ orientation: v as ShapeConfig['orientation'] })}
          options={ORIENTATION_OPTIONS}
        />
      )}

      {STROKED_LINE_VIEWS.has(view) && (
        <Slider
          label={t('configSections.shape.thickness')}
          value={c.thickness ?? 2}
          min={1}
          max={20}
          displayValue={`${c.thickness ?? 2}px`}
          onChange={(v) => set({ thickness: v })}
        />
      )}

      {STROKED_LINE_VIEWS.has(view) && (
        <LabeledSelect
          label={t('configSections.shape.lineStyle')}
          value={c.lineStyle ?? 'solid'}
          onChange={(v) => set({ lineStyle: v as ShapeConfig['lineStyle'] })}
          options={LINE_STYLE_OPTIONS}
        />
      )}

      {LINE_VIEWS.has(view) && (
        <LabeledSelect
          label={t('configSections.shape.edgeStyle')}
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
            label={t('configSections.shape.amplitude')}
            value={c.waveAmplitude ?? 18}
            min={2}
            max={45}
            displayValue={`${c.waveAmplitude ?? 18}%`}
            onChange={(v) => set({ waveAmplitude: v })}
          />
          <Slider
            label={t('configSections.shape.frequency')}
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
          label={t('configSections.shape.lineGap')}
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
            label={t('configSections.shape.dotCount')}
            value={c.dotCount ?? 5}
            min={2}
            max={50}
            onChange={(v) => set({ dotCount: v })}
          />
          <Slider
            label={t('configSections.shape.dotSize')}
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
        <Toggle
          label={t('configSections.shape.outlineOnly')}
          checked={c.outline ?? false}
          onChange={(v) => set({ outline: v })}
        />
      )}

      {FILLABLE_SHAPES.has(view) && c.outline && (
        <Slider
          label={t('configSections.shape.strokeWidth')}
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
          label={t('configSections.shape.cornerRadius')}
          value={c.cornerRadius ?? 12}
          min={0}
          max={120}
          displayValue={`${c.cornerRadius ?? 12}px`}
          onChange={(v) => set({ cornerRadius: v })}
        />
      )}

      {view === 'polygon' && (
        <Slider
          label={t('configSections.shape.sides')}
          value={c.sides ?? 6}
          min={3}
          max={12}
          onChange={(v) => set({ sides: v })}
        />
      )}

      {view === 'star' && (
        <>
          <Slider
            label={t('configSections.shape.points')}
            value={c.starPoints ?? 5}
            min={3}
            max={12}
            onChange={(v) => set({ starPoints: v })}
          />
          <Slider
            label={t('configSections.shape.pointSharpness')}
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
          label={t('fields.rotation')}
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
            label={t('configSections.shape.direction')}
            value={c.arrowDirection ?? 'right'}
            onChange={(v) => set({ arrowDirection: v as ShapeConfig['arrowDirection'] })}
            options={ARROW_DIRECTION_OPTIONS}
          />
          <Slider
            label={t('configSections.shape.headSize')}
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
            label={t('configSections.shape.intensity')}
            value={c.intensity ?? 0.55}
            min={0}
            max={1}
            step={0.05}
            displayValue={`${Math.round((c.intensity ?? 0.55) * 100)}%`}
            onChange={(v) => set({ intensity: v })}
          />
          <Slider
            label={t('configSections.shape.softness')}
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
            label={t('configSections.shape.pattern')}
            value={c.gridPattern ?? 'dots'}
            onChange={(v) => set({ gridPattern: v as ShapeConfig['gridPattern'] })}
            options={GRID_PATTERN_OPTIONS}
          />
          <Slider
            label={t('configSections.shape.spacing')}
            value={c.gridSpacing ?? 24}
            min={4}
            max={120}
            displayValue={`${c.gridSpacing ?? 24}px`}
            onChange={(v) => set({ gridSpacing: v })}
          />
          <Slider
            label={t('configSections.shape.markSize')}
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
            label={t('configSections.shape.frameStyle')}
            value={c.frameStyle ?? 'rectangle'}
            onChange={(v) => set({ frameStyle: v as ShapeConfig['frameStyle'] })}
            options={FRAME_STYLE_OPTIONS}
          />
          <Slider
            label={t('configSections.shape.strokeWidth')}
            value={c.strokeWidth ?? 2}
            min={0.5}
            max={20}
            step={0.5}
            displayValue={`${c.strokeWidth ?? 2}px`}
            onChange={(v) => set({ strokeWidth: v })}
          />
          {c.frameStyle === 'rectangle' && (
            <Slider
              label={t('configSections.shape.cornerRadius')}
              value={c.cornerRadius ?? 12}
              min={0}
              max={120}
              displayValue={`${c.cornerRadius ?? 12}px`}
              onChange={(v) => set({ cornerRadius: v })}
            />
          )}
          {c.frameStyle === 'brackets' && (
            <Slider
              label={t('configSections.shape.bracketLength')}
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
