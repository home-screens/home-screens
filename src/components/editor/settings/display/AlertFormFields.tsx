'use client';

import { useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';

export interface AlertFormValues {
  alertsEnabled: boolean;
  alertsPosition: string;
  alertsMaxVisible: number;
  alertsDefaultDuration: number;
  alertsScale: number;
}

interface AlertFormFieldsProps {
  values: AlertFormValues;
  onChange: (updates: Partial<AlertFormValues>) => void;
  /**
   * When true the entire form goes opacity-60 + pointer-events-none, signaling
   * that the field values are inherited and the user must explicitly fork
   * the block before editing. The Defaults page never dims; the per-display
   * subtab dims until the user clicks "Override for {display}".
   */
  disabled?: boolean;
  /**
   * Target display ID for the "Clear All Alerts" command endpoint. Named-
   * display Pis poll `/api/display/commands?display=<id>` queues, not the
   * legacy `__default__` queue, so without a `displayId` the button silently
   * no-ops on any adopted display.
   *
   * `null` and `undefined` are treated identically — both route the clear
   * command to the legacy `__default__` queue. The Defaults page omits this
   * prop entirely; the per-display Alerts subtab passes the actual display id.
   */
  displayId?: string | null;
}

/**
 * The shared form body for alert overlay settings (position, scale, default
 * duration, max visible) plus the runtime "Clear all alerts" action and the
 * API usage docs.
 *
 * Extracted from the legacy `AlertSection` into its two consumers
 * (`DefaultAlertsSection` for the defaults page, `AlertsSubtab` for the
 * per-display drill-down). Both consumers want the same field rows but
 * render different chrome around them — Defaults shows just the form,
 * AlertsSubtab wraps it in a card with an Override CTA. This component
 * is the one place the form rendering lives.
 */
export default function AlertFormFields({ values, onChange, disabled = false, displayId }: AlertFormFieldsProps) {
  const t = useTranslate('editor');
  const { alertsEnabled, alertsPosition, alertsMaxVisible, alertsDefaultDuration, alertsScale } = values;
  const [clearing, setClearing] = useState(false);
  // Track outcome via discriminated `kind` so styling/copy never branch on
  // English strings; the rendered label resolves through t() at display time.
  const [clearStatus, setClearStatus] = useState<{ kind: 'success' | 'error' } | null>(null);

  async function handleClearAlerts() {
    setClearing(true);
    setClearStatus(null);
    try {
      const url = displayId
        ? `/api/display/clear-alerts?display=${encodeURIComponent(displayId)}`
        : '/api/display/clear-alerts';
      const res = await editorFetch(url, { method: 'POST' });
      setClearStatus({ kind: res.ok ? 'success' : 'error' });
      setTimeout(() => setClearStatus(null), 2000);
    } catch (err) {
      console.debug('Failed to clear alerts:', err);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className={`space-y-3 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={alertsEnabled}
          disabled={disabled}
          onChange={(e) => onChange({ alertsEnabled: e.target.checked })}
          className="rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
        />
        <span className="text-sm text-hs-text-body">{t('settings.alertFormFields.enableLabel')}</span>
      </label>
      <p className="text-xs text-hs-text-faint">{t('settings.alertFormFields.enableHelp')}</p>

      {alertsEnabled && (
        <>
          <label className="block">
            <span className="text-xs text-hs-text-muted">{t('settings.alertFormFields.positionLabel')}</span>
            <select
              value={alertsPosition}
              disabled={disabled}
              onChange={(e) => onChange({ alertsPosition: e.target.value })}
              className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent disabled:opacity-70"
            >
              <option value="top">{t('settings.alertFormFields.positionTop')}</option>
              <option value="bottom">{t('settings.alertFormFields.positionBottom')}</option>
            </select>
          </label>

          <Slider
            label={t('settings.alertFormFields.maxVisibleLabel')}
            value={alertsMaxVisible}
            min={1}
            max={10}
            onChange={(v) => onChange({ alertsMaxVisible: v })}
            disabled={disabled}
          />

          <Slider
            label={t('settings.alertFormFields.defaultDurationLabel')}
            value={alertsDefaultDuration}
            min={0}
            max={120}
            step={5}
            displayValue={alertsDefaultDuration === 0 ? t('settings.alertFormFields.defaultDurationPerType') : String(alertsDefaultDuration)}
            onChange={(v) => onChange({ alertsDefaultDuration: v })}
            disabled={disabled}
          />
          {alertsDefaultDuration === 0 && (
            <p className="text-xs text-hs-text-faint -mt-1">
              {t('settings.alertFormFields.defaultDurationHelp')}
            </p>
          )}

          <Slider
            label={t('settings.alertFormFields.alertSizeLabel')}
            value={alertsScale * 100}
            min={75}
            max={200}
            step={25}
            displayValue={`${alertsScale * 100}%`}
            onChange={(v) => onChange({ alertsScale: v / 100 })}
            disabled={disabled}
          />

          <div className="mt-4 pt-4 border-t border-hs-border-strong">
            <h4 className="text-xs font-medium text-hs-text-muted mb-2 uppercase tracking-wider">
              {t('settings.alertFormFields.activeAlertsHeading')}
            </h4>
            <div className="flex items-center gap-3">
              <Button onClick={handleClearAlerts} disabled={clearing || disabled}>
                {clearing ? t('settings.alertFormFields.clearingButton') : t('settings.alertFormFields.clearAllButton')}
              </Button>
              {clearStatus && (
                <span
                  className={`text-xs ${clearStatus.kind === 'success' ? 'text-hs-success' : 'text-hs-danger'}`}
                >
                  {clearStatus.kind === 'success'
                    ? t('settings.alertFormFields.cleared')
                    : t('settings.alertFormFields.failed')}
                </span>
              )}
            </div>
            <p className="text-xs text-hs-text-faint mt-2">{t('settings.alertFormFields.clearHelp')}</p>
          </div>

          <div className="mt-4 pt-4 border-t border-hs-border-strong">
            <h4 className="text-xs font-medium text-hs-text-muted mb-2 uppercase tracking-wider">
              {t('settings.alertFormFields.apiUsageHeading')}
            </h4>
            <p className="text-xs text-hs-text-faint">{t('settings.alertFormFields.apiUsageIntro')}</p>
            <pre className="mt-2 text-xs text-hs-text-muted bg-hs-hover rounded-md p-3 overflow-x-auto">
{`POST /api/display/alert
{
  "type": "info",
  "title": "Doorbell",
  "message": "Someone is at the door",
  "duration": 15000
}`}
            </pre>
            <p className="text-xs text-hs-text-faint mt-2">
              {t('settings.alertFormFields.apiTypesPart1')}
              <code className="text-hs-text-muted">info</code>
              {t('settings.alertFormFields.apiTypesPart2')}
              <code className="text-hs-text-muted">warning</code>
              {t('settings.alertFormFields.apiTypesPart3')}
              <code className="text-hs-text-muted">urgent</code>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
