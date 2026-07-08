'use client';

import { useMemo } from 'react';
import type { ScreenConfiguration } from '@/types/config';
import { findDisplaysOverridingFields } from '@/lib/display-defaults-backlinks';
import { SLEEP_OVERRIDE_FIELDS } from '@/lib/display-override-fields';
import DefaultsPageShell from '@/components/editor/settings/DefaultsPageShell';
import SleepFormFields, {
  type SleepFormValues,
} from '@/components/editor/settings/display/SleepFormFields';
import { useTranslate } from '@/i18n';

/**
 * The "Defaults → Sleep" page — the source-of-truth for shared sleep /
 * dim / screensaver settings.
 *
 * Sleep is overridden as a *whole block* — not per-field. The shallow-
 * merge contract in `display-filter.ts` says nested objects (sleep,
 * screensaver, alerts) are full-replacement, so the per-display override
 * UI presents one big "Override sleep for this display" toggle, not
 * one-row-per-field. The backlink banner here only needs to know if any
 * display has the `sleep` or `screensaver` keys present at all.
 *
 * The legacy `SleepSection` wrapper was inlined. The form rows now live
 * in the shared `SleepFormFields` component, and this page wraps them
 * with just the header + backlink banner — no fork affordance, because
 * the defaults page is always editable.
 */
interface DefaultSleepSectionProps {
  config: ScreenConfiguration;
  values: SleepFormValues;
  onChange: (updates: Partial<SleepFormValues>) => void;
}

export default function DefaultSleepSection({ config, values, onChange }: DefaultSleepSectionProps) {
  const t = useTranslate('editor');
  // Memoized on config — see the rationale in DefaultDisplaySection.
  const overrides = useMemo(
    () => findDisplaysOverridingFields(config, SLEEP_OVERRIDE_FIELDS),
    [config],
  );

  return (
    <DefaultsPageShell
      breadcrumb={t('settings.defaultSleepPage.breadcrumb')}
      heading={t('settings.defaultSleepPage.heading')}
      description={
        <p className="text-sm text-hs-text-faint mt-1">
          {t('settings.defaultSleepPage.description')}
        </p>
      }
      overrides={overrides}
    >
      <div className="rounded-lg border border-hs-border bg-hs-panel/40 p-4">
        <SleepFormFields values={values} onChange={onChange} />
      </div>
    </DefaultsPageShell>
  );
}
