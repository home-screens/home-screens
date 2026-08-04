'use client';

import { useTranslate } from '@/i18n';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import { ShapeStrokeWidthSlider, ShapeCornerRadiusSlider } from './ShapeSliders';
import type { ShapeControlsProps } from './config-controls';
import type { ShapeConfig } from '@/types/config';

export function ShapeFrameControls({ config: c, set, view }: ShapeControlsProps) {
  const t = useTranslate('editor');
  if (view !== 'frame') return null;

  const FRAME_STYLE_OPTIONS = [
    { value: 'rectangle', label: t('configSections.shape.frameRectangle') },
    { value: 'brackets',  label: t('configSections.shape.frameBrackets') },
  ] as const;

  return (
    <>
      <LabeledSelect
        label={t('configSections.shape.frameStyle')}
        value={c.frameStyle ?? 'rectangle'}
        onChange={(v) => set({ frameStyle: v as ShapeConfig['frameStyle'] })}
        options={FRAME_STYLE_OPTIONS}
      />
      <ShapeStrokeWidthSlider config={c} set={set} />
      {c.frameStyle === 'rectangle' && (
        <ShapeCornerRadiusSlider config={c} set={set} />
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
  );
}
