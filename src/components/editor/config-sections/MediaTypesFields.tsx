'use client';

import LabeledSelect from '@/components/ui/LabeledSelect';
import LabeledInput from '@/components/ui/LabeledInput';
import { useTranslate } from '@/i18n';

/**
 * Shared photo/video media-type controls for the two slideshow modules.
 * 'photos' (the default) keeps the legacy image-only pipeline; anything else
 * switches the list endpoints to typed mixed-media responses.
 */
export function MediaTypesFields({ config, set }: {
  config: Record<string, unknown>;
  set: (updates: Record<string, unknown>) => void;
}) {
  const t = useTranslate('editor');
  const mediaTypes = (config.mediaTypes as string) || 'photos';

  return (
    <>
      <LabeledSelect
        label={t('common.mediaTypes')}
        value={mediaTypes}
        onChange={(v) => set({ mediaTypes: v })}
        options={[
          { value: 'photos', label: t('common.mediaTypesPhotos') },
          { value: 'videos', label: t('common.mediaTypesVideos') },
          { value: 'both', label: t('common.mediaTypesBoth') },
        ]}
      />
      {mediaTypes !== 'photos' && (
        <LabeledInput
          label={t('common.maxVideoDurationSeconds')}
          type="number"
          min={5}
          step={5}
          value={Math.round(((config.maxVideoDurationMs as number) ?? 60_000) / 1000)}
          onChange={(v) => {
            const seconds = Number(v);
            set({ maxVideoDurationMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000 });
          }}
        />
      )}
    </>
  );
}
