'use client';

import { useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import { SectionHeading } from './shared/SectionHeading';
import type { SystemStats } from './types';

export function TelemetryCard({
  stats,
  telemetryOn,
  isSaving,
  onToggle,
}: {
  stats: SystemStats;
  telemetryOn: boolean;
  isSaving: boolean;
  onToggle: () => void | Promise<void>;
}) {
  const [showTelemetryDetails, setShowTelemetryDetails] = useState(false);

  return (
    <section>
      <SectionHeading icon={BarChart3} title="Anonymous Telemetry" />
      <div className="space-y-3">
        <p className="text-xs text-hs-text-muted leading-relaxed">
          Home Screens collects anonymous usage statistics to help prioritize features
          and understand how the app is used. No personal data, IP addresses, or content
          is ever collected.
        </p>

        <div className="flex items-center justify-between">
          <label htmlFor="telemetry-toggle" className="text-sm text-hs-text-secondary">
            Send anonymous usage data
          </label>
          <button
            id="telemetry-toggle"
            role="switch"
            aria-checked={telemetryOn}
            disabled={isSaving}
            onClick={onToggle}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
              telemetryOn ? 'bg-hs-accent' : 'bg-hs-card'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                telemetryOn ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`}
            />
          </button>
        </div>

        {stats.telemetry && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {stats.telemetry.installId && (
              <>
                <div className="text-hs-text-faint">Install ID</div>
                <div className="text-hs-text-muted font-mono text-[11px] truncate">
                  {stats.telemetry.installId}
                </div>
              </>
            )}
            <div className="text-hs-text-faint">Last beacon</div>
            <div className="text-hs-text-muted">
              {stats.telemetry.lastBeaconAt
                ? new Date(stats.telemetry.lastBeaconAt).toLocaleString()
                : 'Never'}
            </div>
          </div>
        )}

        <button
          onClick={() => setShowTelemetryDetails(!showTelemetryDetails)}
          className="flex items-center gap-1 text-[11px] text-hs-accent hover:text-hs-accent-hover"
        >
          {showTelemetryDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          What we collect
        </button>

        {showTelemetryDetails && (
          <div className="rounded-md bg-hs-hover border border-hs-border-strong p-3 text-xs text-hs-text-muted space-y-2">
            <p className="text-hs-text-secondary font-medium">Data sent once daily:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Anonymous install ID (random UUID)</li>
              <li>App version and platform (OS, architecture)</li>
              <li>Display resolution and orientation</li>
              <li>Number of screens, modules, and profiles</li>
              <li>Module types in use (e.g. clock, weather)</li>
              <li>Weather provider and transition effect</li>
              <li>Whether sleep, alerts, and auth are enabled</li>
              <li>Whether calendar integrations are configured</li>
              <li>Number of installed plugins</li>
            </ul>
            <p className="text-hs-text-faint mt-2">
              We never collect: IP addresses, location, calendar events, API keys,
              module content, hostnames, or any personally identifiable information.
              All of the code is Open Source and can be verified.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
