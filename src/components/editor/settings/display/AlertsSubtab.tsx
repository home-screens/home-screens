'use client';

import Link from 'next/link';
import type { AlertSettings, DisplayNode, ScreenConfiguration } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import AlertFormFields, {
  type AlertFormValues,
} from './AlertFormFields';
import WholeBlockOverrideCard from './WholeBlockOverrideCard';

interface AlertsSubtabProps {
  config: ScreenConfiguration;
  display: DisplayNode;
}

/**
 * Display detail "Alerts" — whole-block override of the shared
 * `Defaults → Alerts` settings, mirroring the `SleepSubtab` pattern.
 *
 * Rendering matches `SleepSubtab` exactly: single rounded card with a
 * header row ("Alert overlay" label + Override/Reset button) and the
 * shared `AlertFormFields` form body below, dimmed when inheriting and
 * editable when forked. An earlier Phase 5 pass rendered this subtab
 * as an empty-state CTA per the mockup, which was inconsistent with
 * the Sleep subtab's dimmed-form treatment — two subtabs that do the
 * same thing (whole-block override of a nested settings object) should
 * use the same affordance. The dimmed-form pattern also lets the user
 * see what the default values ARE before committing to a fork, which
 * matches `DisplaySubtab`'s per-field `OverrideRow` behavior.
 *
 * The `displayId` prop on `AlertFormFields` is wired so the "Clear
 * alerts" button targets THIS display's command queue
 * (`/api/display/clear-alerts?display=<id>`) rather than the legacy
 * `__default__` queue. Without this, clearing alerts from a per-display
 * Alerts subtab would silently no-op on every adopted Pi — the kind of
 * bug that's painful to debug live.
 */
export default function AlertsSubtab({ config, display }: AlertsSubtabProps) {
  const { updateDisplaySettings, saveConfig } = useEditorStore();
  const isForked = display.settings?.alerts !== undefined;
  const values: AlertFormValues = isForked
    ? alertsConfigToForm(display.settings?.alerts)
    : alertsConfigToForm(config.settings.alerts);

  const handleChange = async (updates: Partial<AlertFormValues>) => {
    if (!isForked) return;
    const merged = { ...values, ...updates };
    updateDisplaySettings(display.id, { alerts: alertsFormToConfig(merged) });
    await saveConfig();
  };

  const handleFork = async () => {
    updateDisplaySettings(display.id, {
      alerts: alertsFormToConfig(alertsConfigToForm(config.settings.alerts)),
    });
    await saveConfig();
  };

  const handleReset = async () => {
    updateDisplaySettings(display.id, { alerts: undefined });
    await saveConfig();
  };

  return (
    <WholeBlockOverrideCard
      label="Alert overlay"
      displayName={display.name}
      defaultsHref="?section=defaults&page=alerts"
      defaultsLabel="Defaults → Alerts"
      infoCopy={
        <>
          Alerts is overridden as a whole block. The default lives on{' '}
          <Link
            href="?section=defaults&page=alerts"
            className="text-blue-300 hover:text-blue-200 underline decoration-dashed underline-offset-2"
          >
            Defaults → Alerts
          </Link>
          .
        </>
      }
      isForked={isForked}
      onFork={handleFork}
      onReset={handleReset}
    >
      <AlertFormFields
        values={values}
        onChange={handleChange}
        displayId={display.id}
        disabled={!isForked}
      />
    </WholeBlockOverrideCard>
  );
}

function alertsConfigToForm(alerts: AlertSettings | undefined): AlertFormValues {
  return {
    alertsEnabled: alerts?.enabled ?? true,
    alertsPosition: alerts?.position ?? 'top',
    alertsMaxVisible: alerts?.maxVisible ?? 3,
    alertsDefaultDuration: (alerts?.defaultDuration ?? 0) / 1000,
    alertsScale: alerts?.scale ?? 1,
  };
}

function alertsFormToConfig(alerts: AlertFormValues): AlertSettings {
  return {
    enabled: alerts.alertsEnabled,
    position: alerts.alertsPosition as 'top' | 'bottom',
    maxVisible: alerts.alertsMaxVisible,
    defaultDuration: alerts.alertsDefaultDuration * 1000,
    scale: alerts.alertsScale,
  };
}
