import { useMemo } from 'react';
import { useTranslate } from '@/i18n';

/**
 * Option lists that several module panels offer with the same values and
 * the same words. Each is translated at render time and memoized, so a
 * panel can pass it straight to a select.
 */

/** Which day a week starts on. */
export function useWeekStartOptions() {
  const tCore = useTranslate('core');
  return useMemo(
    () => [
      { value: 'sunday', label: tCore('days.sunday') },
      { value: 'monday', label: tCore('days.monday') },
    ] as const,
    [tCore],
  );
}

/** How a picture or video fills its box. */
export function useObjectFitOptions() {
  const t = useTranslate('editor');
  return useMemo(
    () => [
      { value: 'cover', label: t('common.objectFitCover') },
      { value: 'contain', label: t('common.objectFitContain') },
      { value: 'fill', label: t('common.objectFitFill') },
    ] as const,
    [t],
  );
}

/** How tightly a full-screen module packs its content. The words say what each is for. */
export function useDensityOptions() {
  const t = useTranslate('editor');
  return useMemo(
    () => [
      { value: 'cozy', label: t('common.densityOptions.cozy') },
      { value: 'snug', label: t('common.densityOptions.snug') },
    ] as const,
    [t],
  );
}
