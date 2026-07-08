import { useMemo } from 'react';
import { TYPOGRAPHY_SIZES } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';

/**
 * Translates the shared `TYPOGRAPHY_SIZES` table at render time for the
 * fullscreen module dropdowns. Falls back to the English `label` when a key
 * is missing — `t()` returns the raw dotted path on miss (not undefined), so
 * `result === i18nKey` is the only reliable miss check.
 */
export function useTypographySizeOptions() {
  const t = useTranslate('editor');
  return useMemo(
    () =>
      TYPOGRAPHY_SIZES.map((opt) => {
        const translated = t(opt.i18nKey);
        return {
          value: opt.value,
          label: translated === opt.i18nKey ? opt.label : translated,
        };
      }),
    [t],
  );
}
