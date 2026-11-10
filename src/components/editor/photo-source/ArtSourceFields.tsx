'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import LabeledField from '@/components/ui/LabeledField';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { useEditorData } from '@/hooks/useEditorData';
import { useSettledValue } from '@/hooks/useSettledValue';
import { useTranslate } from '@/i18n';
import {
  ART_FITS, ART_GENRES, ART_MUSEUMS, ART_ORIENTATIONS, ART_PROVIDERS, ART_YEAR_MAX, ART_YEAR_MIN, DEFAULT_ART_FIT, DEFAULT_ART_MIN_SHORT_SIDE,
  PHOTO_SOURCE_MEDIA_PATH, artNumber, photoSourceParams, type ArtCount, type PhotoSourceUse,
} from '@/lib/photo-source';
import type { ArtGenre, MediaListItem, PhotoSource } from '@/types/config';
import CheckboxList from './CheckboxList';
import PreviewStrip from './PreviewStrip';

type Art = Extract<PhotoSource, { kind: 'art' }>;

const SHAPES = { any: undefined, loose: 0.5, medium: 0.25, strict: 0.1 } as const;
type Shape = keyof typeof SHAPES;

const shapeOf = (tolerance: number | undefined): Shape => (tolerance === undefined ? 'any' : (['loose', 'medium', 'strict'] as const)
  .reduce((best, id) => (Math.abs(SHAPES[id] - tolerance) < Math.abs(SHAPES[best] - tolerance) ? id : best)));

const FILTERS = {
  museum: ['museums'],
  period: ['fromYear', 'toYear'],
  genre: ['genre'],
  artist: ['artist'],
  style: ['style'],
  orientation: ['orientation'],
  shape: ['aspectTolerance'],
  size: ['minShortSide'],
} as const satisfies Record<string, ReadonlyArray<keyof Art>>;
type Filter = keyof typeof FILTERS;

/** Fewer matches than this and the wall would show the same few paintings over and over. */
const FEW_MATCHES = 20;

const yearOf = (value: string) => (value.trim() === '' ? undefined : artNumber(Number(value), ART_YEAR_MIN, ART_YEAR_MAX));

export default function ArtSourceFields({ use, source, onChange }: {
  use: PhotoSourceUse;
  source: Art;
  onChange: (source: PhotoSource) => void;
}) {
  const t = useTranslate('editor');
  const set = (patch: Partial<Art>) => onChange(Object.fromEntries(
    Object.entries({ ...source, ...patch }).filter(([, value]) => value !== undefined && value !== ''),
  ) as Art);
  const [added, setAdded] = useState<Filter[]>([]);
  const wikimedia = source.provider === 'wikimedia';
  const offered = (Object.keys(FILTERS) as Filter[]).filter((filter) => filter !== 'museum' || wikimedia);
  const shown = offered.filter((filter) => added.includes(filter) || FILTERS[filter].some((field) => source[field] !== undefined));
  const remaining = offered.filter((filter) => !shown.includes(filter));
  const filterLabel = (filter: Filter) => t(`photoSources.art.${filter === 'size' ? 'minSize' : filter}`);
  const remove = (filter: Filter) => {
    setAdded(added.filter((f) => f !== filter));
    set(Object.fromEntries(FILTERS[filter].map((field) => [field, undefined])));
  };

  const settled = useSettledValue(useMemo(() => {
    const params = photoSourceParams(source);
    params.set('count', '4');
    return params.toString();
  }, [source]), 600);
  const { data: counted } = useEditorData<ArtCount>(`${PHOTO_SOURCE_MEDIA_PATH}?${settled}&info=count`);
  const { data: previewData } = useEditorData<MediaListItem[]>(`${PHOTO_SOURCE_MEDIA_PATH}?${settled}`);
  const { data: museumCounts } = useEditorData<Array<{ id: string; count: number | null }>>(
    wikimedia && shown.includes('museum') ? `${PHOTO_SOURCE_MEDIA_PATH}?kind=art&provider=wikimedia&info=museums` : null,
    30_000,
  );

  const field = (filter: Filter): ReactNode => {
    switch (filter) {
      case 'museum': {
        const museums = source.museums ?? [];
        const counts = new Map((museumCounts ?? []).map((m) => [m.id, m.count]));
        return (
          <LabeledField label={t('photoSources.art.museum')} as="div">
            <p className="mb-1 text-[10px] text-hs-text-faint">{museums.length === 0 ? t('photoSources.art.anyMuseum') : t('photoSources.art.museumsChosen', { count: museums.length })}</p>
            <CheckboxList
              options={ART_MUSEUMS.map(({ id, name }) => {
                const count = counts.get(id);
                return { id, label: typeof count === 'number' ? `${name} (${count})` : name };
              })}
              selected={museums}
              onChange={(ids) => set({ museums: ids.length > 0 ? ids : undefined })}
              emptyLabel={t('photoSources.art.anyMuseum')}
              testId="art-museums"
            />
          </LabeledField>
        );
      }
      case 'period':
        return (
          <LabeledField label={t('photoSources.art.period')} as="div">
            <div className="flex items-center gap-2">
              <input
                type="number" aria-label={t('photoSources.art.fromYear')} placeholder={t('photoSources.art.fromYear')} className={INPUT_CLASS}
                min={ART_YEAR_MIN} max={ART_YEAR_MAX} step={10} value={source.fromYear ?? ''}
                onChange={(e) => set({ fromYear: yearOf(e.target.value) })}
              />
              <input
                type="number" aria-label={t('photoSources.art.toYear')} placeholder={t('photoSources.art.toYear')} className={INPUT_CLASS}
                min={ART_YEAR_MIN} max={ART_YEAR_MAX} step={10} value={source.toYear ?? ''}
                onChange={(e) => set({ toYear: yearOf(e.target.value) })}
              />
            </div>
          </LabeledField>
        );
      case 'genre':
        return (
          <LabeledSelect
            label={t('photoSources.art.genre')}
            value={source.genre ?? ''}
            onChange={(genre) => set({ genre: genre === '' ? undefined : genre as ArtGenre })}
            options={[{ value: '', label: t('photoSources.art.choose') }, ...ART_GENRES.map((value) => ({ value, label: t(`photoSources.art.genres.${value}`) }))]}
          />
        );
      case 'artist':
        return (
          <LabeledInput
            label={t('photoSources.art.artist')}
            value={source.artist ?? ''}
            placeholder={t('photoSources.art.artistPlaceholder')}
            onChange={(artist) => set({ artist })}
          />
        );
      case 'style':
        return (
          <LabeledInput
            label={t('photoSources.art.style')}
            value={source.style ?? ''}
            placeholder={t('photoSources.art.stylePlaceholder')}
            onChange={(style) => set({ style })}
          />
        );
      case 'orientation':
        return (
          <LabeledSelect
            label={t('photoSources.art.orientation')}
            value={source.orientation ?? 'any'}
            onChange={(orientation) => set({ orientation: orientation === 'any' ? undefined : orientation })}
            options={ART_ORIENTATIONS.map((value) => ({ value, label: t(`photoSources.art.orientations.${value}`) }))}
          />
        );
      case 'shape':
        return (
          <LabeledSelect
            label={t('photoSources.art.shape')}
            value={shapeOf(source.aspectTolerance)}
            onChange={(id) => set({ aspectTolerance: SHAPES[id as Shape] })}
            options={(Object.keys(SHAPES) as Shape[]).map((id) => ({ value: id, label: t(`photoSources.art.shapes.${id}`) }))}
          />
        );
      case 'size':
        return (
          <LabeledInput
            label={t('photoSources.art.minSize')}
            type="number"
            min={100}
            max={8000}
            step={100}
            value={source.minShortSide ?? DEFAULT_ART_MIN_SHORT_SIDE}
            onChange={(value) => set({ minShortSide: value === '' ? undefined : Number(value) })}
          />
        );
    }
  };

  return (
    <>
      <LabeledSelect
        label={t('photoSources.art.provider')}
        value={source.provider}
        onChange={(provider) => set({ provider, ...(provider === 'wikimedia' ? {} : { museums: undefined }) })}
        options={ART_PROVIDERS.map((value) => ({ value, label: t(`photoSources.art.providers.${value}`) }))}
      />
      {shown.map((filter) => (
        <div key={filter} className="flex items-end gap-1" data-testid={`art-filter-${filter}`}>
          <div className="min-w-0 flex-1">{field(filter)}</div>
          <button
            type="button"
            onClick={() => remove(filter)}
            aria-label={t('photoSources.art.removeFilter', { filter: filterLabel(filter) })}
            className="mb-1 rounded p-1 text-hs-text-faint hover:text-hs-text-body"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      {remaining.length > 0 && (
        <LabeledSelect
          label={t('photoSources.art.filters')}
          value=""
          onChange={(filter) => filter && setAdded([...added, filter as Filter])}
          options={[{ value: '', label: t('photoSources.art.addFilter') }, ...remaining.map((filter) => ({ value: filter, label: filterLabel(filter) }))]}
        />
      )}
      {counted && (
        <p className="text-[10px] text-hs-text-faint" data-testid="art-count">
          {counted.count === null
            ? t('photoSources.art.manyMatch')
            : t(counted.approximate ? 'photoSources.art.matchCountAbout' : 'photoSources.art.matchCount', { count: counted.count })}
        </p>
      )}
      {counted && counted.count !== null && counted.count < FEW_MATCHES && (
        <p className="text-[10px] text-hs-warning" data-testid="art-few">{t('photoSources.art.fewMatches')}</p>
      )}
      <PreviewStrip urls={(previewData ?? []).map((item) => item.url)} />
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
