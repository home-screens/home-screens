'use client';

import { useMemo } from 'react';
import type { ScreenConfiguration } from '@/types/config';
import { findDisplaysOverridingFields } from '@/lib/display-defaults-backlinks';
import { ALERT_OVERRIDE_FIELDS } from '@/lib/display-override-fields';
import DefaultsBacklinkBanner from '@/components/editor/settings/DefaultsBacklinkBanner';
import AlertFormFields, {
  type AlertFormValues,
} from '@/components/editor/settings/display/AlertFormFields';
import { useTranslate } from '@/i18n';

/**
 * The "Defaults → Alerts" page — the source-of-truth for shared alert
 * overlay settings (position, size, default duration). Like Sleep, the
 * `alerts` block is overridden per-display as a single full-replacement
 * unit, never per-field, so the backlink banner just looks at "is the
 * `alerts` key set?" for each display.
 *
 * The legacy `displayId` prop is intentionally undefined here because
 * this is the *defaults* page — clearing alerts is a per-display
 * operation that lives on the per-display Alerts subtab, not on the
 * shared defaults page. Passing `null` from here keeps the inlined
 * "Clear all alerts" button hitting the legacy default queue, which
 * is the original single-display behavior.
 *
 * The legacy `AlertSection` wrapper was inlined. The form rows now live
 * in the shared `AlertFormFields` component.
 */
interface DefaultAlertsSectionProps {
  config: ScreenConfiguration;
  values: AlertFormValues;
  onChange: (updates: Partial<AlertFormValues>) => void;
}

export default function DefaultAlertsSection({ config, values, onChange }: DefaultAlertsSectionProps) {
  const t = useTranslate('editor');
  // Memoized on config — see the rationale in DefaultDisplaySection.
  const overrides = useMemo(
    () => findDisplaysOverridingFields(config, ALERT_OVERRIDE_FIELDS),
    [config],
  );

  return (
    <>
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-1">
          {t('settings.defaultAlertsPage.breadcrumb')}
        </div>
        <h1 className="text-xl font-semibold text-hs-text-primary">
          {t('settings.defaultAlertsPage.heading')}
        </h1>
        <p className="text-sm text-hs-text-faint mt-1">
          {t('settings.defaultAlertsPage.description')}
        </p>
      </div>
      <DefaultsBacklinkBanner overrides={overrides} />
      <div className="rounded-lg border border-hs-border bg-hs-panel/40 p-4">
        <AlertFormFields values={values} onChange={onChange} />
      </div>
    </>
  );
}
