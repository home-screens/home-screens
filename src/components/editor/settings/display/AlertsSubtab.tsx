'use client';

import Link from 'next/link';
import { Info, RotateCcw } from 'lucide-react';
import type { AlertSettings, DisplayNode, ScreenConfiguration } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import AlertFormFields, {
  type AlertFormValues,
} from './AlertFormFields';

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
    <>
      <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/[0.07] px-4 py-3 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-300 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-200 leading-relaxed">
          Alerts is overridden as a whole block. The default lives on{' '}
          <Link
            href="?section=defaults&page=alerts"
            className="text-blue-300 hover:text-blue-200 underline decoration-dashed underline-offset-2"
          >
            Defaults → Alerts
          </Link>
          .
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-neutral-200">Alert overlay</div>
            {isForked ? (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md text-blue-300 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to default
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFork}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md text-neutral-300 bg-neutral-800 border border-neutral-700 hover:text-neutral-100 hover:bg-neutral-700 transition-colors"
              >
                Override for {display.name}
              </button>
            )}
          </div>
          <AlertFormFields
            values={values}
            onChange={handleChange}
            displayId={display.id}
            disabled={!isForked}
          />
          {!isForked && (
            <p className="text-[11px] text-neutral-500 mt-3">
              Using the default from{' '}
              <Link
                href="?section=defaults&page=alerts"
                className="text-blue-400 hover:text-blue-300 underline decoration-dashed underline-offset-2"
              >
                Defaults → Alerts
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </>
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
