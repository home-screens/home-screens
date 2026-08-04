'use client';

import { useTranslate } from '@/i18n';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import type { ShapeControlsProps } from './config-controls';
import type { ShapeConfig, ShapeView } from '@/types/config';

const LINE_VIEWS = new Set<ShapeView>(['divider', 'double-line', 'wave', 'zigzag', 'dotted-row']);
const STROKED_LINE_VIEWS = new Set<ShapeView>(['divider', 'double-line', 'wave', 'zigzag']);
const WAVE_VIEWS = new Set<ShapeView>(['wave', 'zigzag']);
const ORIENTABLE = new Set<ShapeView>(['divider', 'double-line', 'dotted-row']);

export function ShapeLineControls({ config: c, set, view }: ShapeControlsProps) {
  const t = useTranslate('editor');

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

  return (
    <>
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
    </>
  );
}
