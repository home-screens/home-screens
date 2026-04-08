'use client';

import { useState } from 'react';
import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import ForkBanner from '@/components/editor/settings/ForkBanner';

interface AlertValues {
  alertsEnabled: boolean;
  alertsPosition: string;
  alertsMaxVisible: number;
  alertsDefaultDuration: number;
  alertsScale: number;
}

/**
 * Per-display fork affordance for notification/alert settings. Mirrors
 * `SleepSection`'s `fork` prop — `alerts` is a nested AlertSettings object
 * on GlobalSettings, so per-display overrides replace the whole object.
 */
interface AlertForkProps {
  isForked: boolean;
  displayName: string;
  onFork: () => void;
  onReset: () => void;
}

interface Props {
  values: AlertValues;
  onChange: (updates: Partial<AlertValues>) => void;
  fork?: AlertForkProps;
  /**
   * Target display ID for command endpoints (e.g. clear-alerts). Named-
   * display Pis poll `/api/display/commands?display=<id>` queues, not the
   * legacy `__default__` queue, so without a `displayId` the "Clear All
   * Alerts" button silently no-ops on any adopted display. Leave undefined
   * in single-display installs to keep using the legacy default queue.
   */
  displayId?: string | null;
}

export default function AlertSection({ values, onChange, fork, displayId }: Props) {
  const { alertsEnabled, alertsPosition, alertsMaxVisible, alertsDefaultDuration, alertsScale } = values;
  const [clearing, setClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);

  async function handleClearAlerts() {
    setClearing(true);
    setClearMessage(null);
    try {
      const url = displayId
        ? `/api/display/clear-alerts?display=${encodeURIComponent(displayId)}`
        : '/api/display/clear-alerts';
      const res = await fetch(url, { method: 'POST' });
      setClearMessage(res.ok ? 'Cleared' : 'Failed');
      setTimeout(() => setClearMessage(null), 2000);
    } catch (err) {
      console.debug('Failed to clear alerts:', err);
    } finally {
      setClearing(false);
    }
  }

  const isInherited = fork && !fork.isForked;

  return (
    <section>
      <h3 className="text-sm font-medium text-neutral-300 mb-3 uppercase tracking-wider">
        Notifications
      </h3>
      {fork && (
        <ForkBanner
          label="Notifications"
          displayName={fork.displayName}
          isForked={fork.isForked}
          onFork={fork.onFork}
          onReset={fork.onReset}
        />
      )}
      <div className={`space-y-3 ${isInherited ? 'opacity-60 pointer-events-none' : ''}`}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={alertsEnabled}
            onChange={(e) => onChange({ alertsEnabled: e.target.checked })}
            className="rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
          />
          <span className="text-sm text-neutral-200">Enable alert overlay</span>
        </label>
        <p className="text-xs text-neutral-500">
          Show notifications on the display. Alerts can be triggered via the API and modules that implemented alert functionality.
        </p>

        {alertsEnabled && (
          <>
            <label className="block">
              <span className="text-xs text-neutral-400">Position</span>
              <select
                value={alertsPosition}
                onChange={(e) => onChange({ alertsPosition: e.target.value })}
                className="mt-1 block w-full rounded-md bg-neutral-800 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
              >
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>

            <Slider
              label="Max visible alerts"
              value={alertsMaxVisible}
              min={1}
              max={10}
              onChange={(v) => onChange({ alertsMaxVisible: v })}
            />

            <Slider
              label="Default duration (seconds)"
              value={alertsDefaultDuration}
              min={0}
              max={120}
              step={5}
              displayValue={alertsDefaultDuration === 0 ? 'Per-type defaults' : String(alertsDefaultDuration)}
              onChange={(v) => onChange({ alertsDefaultDuration: v })}
            />
            {alertsDefaultDuration === 0 && (
              <p className="text-xs text-neutral-500 -mt-1">
                Info: 10s, Warning: 30s, Urgent: persistent until dismissed.
              </p>
            )}

            <Slider
              label="Alert size"
              value={alertsScale * 100}
              min={75}
              max={200}
              step={25}
              displayValue={`${alertsScale * 100}%`}
              onChange={(v) => onChange({ alertsScale: v / 100 })}
            />

            <div className="mt-4 pt-4 border-t border-neutral-700">
              <h4 className="text-xs font-medium text-neutral-400 mb-2 uppercase tracking-wider">Active Alerts</h4>
              <div className="flex items-center gap-3">
                <Button onClick={handleClearAlerts} disabled={clearing}>
                  {clearing ? 'Clearing...' : 'Clear All Alerts'}
                </Button>
                {clearMessage && (
                  <span className="text-xs text-green-400">{clearMessage}</span>
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                Dismiss all active alerts on the display. Takes effect within 3 seconds.
              </p>
            </div>

            <div className="mt-4 pt-4 border-t border-neutral-700">
              <h4 className="text-xs font-medium text-neutral-400 mb-2 uppercase tracking-wider">API Usage</h4>
              <p className="text-xs text-neutral-500">
                Send alerts from external tools (Home Assistant, scripts, etc.):
              </p>
              <pre className="mt-2 text-xs text-neutral-400 bg-neutral-800/50 rounded-md p-3 overflow-x-auto">
{`POST /api/display/alert
{
  "type": "info",
  "title": "Doorbell",
  "message": "Someone is at the door",
  "duration": 15000
}`}
              </pre>
              <p className="text-xs text-neutral-500 mt-2">
                Types: <code className="text-neutral-400">info</code>, <code className="text-neutral-400">warning</code>, <code className="text-neutral-400">urgent</code>
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
