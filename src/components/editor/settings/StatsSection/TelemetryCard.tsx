'use client';

import { useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslate } from '@/i18n';
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
  const t = useTranslate('editor');
  const [showTelemetryDetails, setShowTelemetryDetails] = useState(false);

  return (
    <section>
      <SectionHeading icon={BarChart3} title={t('settings.statsSection.telemetryTitle')} />
      <div className="space-y-3">
        <p className="text-xs text-hs-text-muted leading-relaxed">
          {t('settings.statsSection.telemetryDescription')}
        </p>

        <div className="flex items-center justify-between">
          <label htmlFor="telemetry-toggle" className="text-sm text-hs-text-secondary">
            {t('settings.statsSection.telemetryToggle')}
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
                <div className="text-hs-text-faint">{t('settings.statsSection.installId')}</div>
                <div className="text-hs-text-muted font-mono text-[11px] truncate">
                  {stats.telemetry.installId}
                </div>
              </>
            )}
            <div className="text-hs-text-faint">{t('settings.statsSection.lastBeacon')}</div>
            <div className="text-hs-text-muted">
              {stats.telemetry.lastBeaconAt
                ? new Date(stats.telemetry.lastBeaconAt).toLocaleString()
                : t('settings.statsSection.never')}
            </div>
          </div>
        )}

        <button
          onClick={() => setShowTelemetryDetails(!showTelemetryDetails)}
          className="flex items-center gap-1 text-[11px] text-hs-accent hover:text-hs-accent-hover"
        >
          {showTelemetryDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {t('settings.statsSection.whatWeCollect')}
        </button>

        {showTelemetryDetails && (
          <div className="rounded-md bg-hs-hover border border-hs-border-strong p-3 text-xs text-hs-text-muted space-y-2">
            <p className="text-hs-text-secondary font-medium">{t('settings.statsSection.telemetryDataDaily')}</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>{t('settings.statsSection.telemetryItem1')}</li>
              <li>{t('settings.statsSection.telemetryItem2')}</li>
              <li>{t('settings.statsSection.telemetryItem3')}</li>
              <li>{t('settings.statsSection.telemetryItem4')}</li>
              <li>{t('settings.statsSection.telemetryItem5')}</li>
              <li>{t('settings.statsSection.telemetryItem6')}</li>
              <li>{t('settings.statsSection.telemetryItem7')}</li>
              <li>{t('settings.statsSection.telemetryItem8')}</li>
              <li>{t('settings.statsSection.telemetryItem9')}</li>
            </ul>
            <p className="text-hs-text-faint mt-2">
              {t('settings.statsSection.telemetryDisclaimer')}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
