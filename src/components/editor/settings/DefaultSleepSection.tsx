'use client';

import { useMemo } from 'react';
import type { ScreenConfiguration } from '@/types/config';
import { findDisplaysOverridingFields } from '@/lib/display-defaults-backlinks';
import { SLEEP_OVERRIDE_FIELDS } from '@/lib/display-override-fields';
import DefaultsBacklinkBanner from '@/components/editor/settings/DefaultsBacklinkBanner';
import SleepFormFields, {
  type SleepFormValues,
} from '@/components/editor/settings/display/SleepFormFields';

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
  // Memoized on config — see the rationale in DefaultDisplaySection.
  const overrides = useMemo(
    () => findDisplaysOverridingFields(config, SLEEP_OVERRIDE_FIELDS),
    [config],
  );

  return (
    <>
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-1">
          Defaults → Sleep
        </div>
        <h1 className="text-xl font-semibold text-hs-text-primary">Default sleep settings</h1>
        <p className="text-sm text-hs-text-faint mt-1">
          Default dim / sleep schedule and screensaver applied to every display. A specific
          display can override the whole block from its own page.
        </p>
      </div>
      <DefaultsBacklinkBanner overrides={overrides} pageLabel="this page" />
      <div className="rounded-lg border border-hs-border bg-hs-panel/40 p-4">
        <SleepFormFields values={values} onChange={onChange} />
      </div>
    </>
  );
}
