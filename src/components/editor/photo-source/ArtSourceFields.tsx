'use client';

import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useTranslate } from '@/i18n';
import { ART_FITS, ART_ORIENTATIONS, ART_PROVIDERS, DEFAULT_ART_FIT, DEFAULT_ART_MIN_SHORT_SIDE, type PhotoSourceUse } from '@/lib/photo-source';
import type { PhotoSource } from '@/types/config';

type Art = Extract<PhotoSource, { kind: 'art' }>;

/** The shape-match choices, loosest first; the saved value is how far the shape may differ. */
const SHAPES: ReadonlyArray<{ id: 'any' | 'loose' | 'medium' | 'strict'; tolerance: number | undefined }> = [
  { id: 'any', tolerance: undefined },
  { id: 'loose', tolerance: 0.5 },
  { id: 'medium', tolerance: 0.25 },
  { id: 'strict', tolerance: 0.1 },
];
const TOLERANT = SHAPES.filter((s): s is { id: 'loose' | 'medium' | 'strict'; tolerance: number } => s.tolerance !== undefined);

function shapeOf(tolerance: number | undefined): (typeof SHAPES)[number]['id'] {
  if (tolerance === undefined) return 'any';
  // A hand-edited value shows as the nearest choice.
  return TOLERANT.reduce((best, s) => (Math.abs(s.tolerance - tolerance) < Math.abs(best.tolerance - tolerance) ? s : best)).id;
}

/** Paintings from a museum collection: whose, in what style, how big and how they sit on the screen. */
export default function ArtSourceFields({ use, source, onChange }: {
  use: PhotoSourceUse;
  source: Art;
  onChange: (source: PhotoSource) => void;
}) {
  const t = useTranslate('editor');
  /** A text or number field that is empty is not saved at all. */
  const set = (patch: Partial<Art>) => {
    const next = { ...source, ...patch };
    for (const key of Object.keys(patch)) if ((next as Record<string, unknown>)[key] === undefined || (next as Record<string, unknown>)[key] === '') delete (next as Record<string, unknown>)[key];
    onChange(next);
  };
  return (
    <>
      <LabeledSelect
        label={t('photoSources.art.provider')}
        value={source.provider}
        onChange={(provider) => set({ provider })}
        options={ART_PROVIDERS.map((value) => ({ value, label: t(`photoSources.art.providers.${value}`) }))}
      />
      <LabeledInput
        label={t('photoSources.art.artist')}
        value={source.artist ?? ''}
        placeholder={t('photoSources.art.artistPlaceholder')}
        onChange={(artist) => set({ artist })}
      />
      <LabeledInput
        label={t('photoSources.art.style')}
        value={source.style ?? ''}
        placeholder={t('photoSources.art.stylePlaceholder')}
        onChange={(style) => set({ style })}
      />
      <LabeledSelect
        label={t('photoSources.art.orientation')}
        value={source.orientation ?? 'any'}
        onChange={(orientation) => set({ orientation: orientation === 'any' ? undefined : orientation })}
        options={ART_ORIENTATIONS.map((value) => ({ value, label: t(`photoSources.art.orientations.${value}`) }))}
      />
      <LabeledInput
        label={t('photoSources.art.minSize')}
        type="number"
        min={100}
        max={8000}
        step={100}
        value={source.minShortSide ?? DEFAULT_ART_MIN_SHORT_SIDE}
        onChange={(value) => set({ minShortSide: value === '' ? undefined : Number(value) })}
      />
      <LabeledSelect
        label={t('photoSources.art.shape')}
        value={shapeOf(source.aspectTolerance)}
        onChange={(id) => set({ aspectTolerance: SHAPES.find((s) => s.id === id)?.tolerance })}
        options={SHAPES.map((s) => ({ value: s.id, label: t(`photoSources.art.shapes.${s.id}`) }))}
      />
      {use === 'background' && (
        <LabeledSelect
          label={t('photoSources.art.fit')}
          value={source.fit ?? DEFAULT_ART_FIT}
          onChange={(fit) => set({ fit })}
          options={ART_FITS.map((value) => ({ value, label: t(`photoSources.art.fits.${value}`) }))}
        />
      )}
      <p className="text-[10px] leading-relaxed text-hs-text-faint">
        {t(use === 'background' ? 'photoSources.art.backgroundInfo' : 'photoSources.art.streamInfo')}
      </p>
    </>
  );
}
