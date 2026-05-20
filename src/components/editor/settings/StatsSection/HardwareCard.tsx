'use client';

import { Thermometer } from 'lucide-react';
import { useTranslate } from '@/i18n';
import type { DisplayStatus } from '@/lib/display-commands';
import type { HardwareStats } from '@/lib/hardware-stats';
import { SectionHeading } from './shared/SectionHeading';
import type { SemanticColor } from './shared/types';

export function HardwareCard({
  displayStatus,
  hubHardware,
}: {
  displayStatus: DisplayStatus | null;
  hubHardware: HardwareStats | null;
}) {
  const t = useTranslate('editor');
  // Pick best hardware source: reporter > hub fallback.
  const reporterStats = displayStatus?.hwStats ?? null;
  const hubStats = hubHardware;
  const hwStats = reporterStats ?? hubStats;
  const hwSource: 'reporter' | 'hub' | null = reporterStats ? 'reporter' : hubStats ? 'hub' : null;

  // Temperature semantic color: ≤60 ok, 60–75 warn, >75 danger.
  let tempColor: SemanticColor = 'success';
  if (hwStats?.cpuTempC != null) {
    if (hwStats.cpuTempC > 75) tempColor = 'danger';
    else if (hwStats.cpuTempC > 60) tempColor = 'warning';
  }

  return (
    <section>
      <SectionHeading
        icon={Thermometer}
        title={t('settings.statsSection.hardwareTitle')}
        trailing={hwSource ? (
          <span className="text-[10px] text-hs-text-faint uppercase tracking-wider">
            {hwSource === 'reporter' ? t('settings.statsSection.sourceReporter') : t('settings.statsSection.sourceHub')}
          </span>
        ) : null}
      />
      {hwStats ? (
        <div className="rounded-lg bg-hs-hover border border-hs-border-strong p-3.5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1.5 text-xs items-center">
            <div className="text-hs-text-faint">{t('settings.statsSection.piModel')}</div>
            <div className="text-hs-text-secondary text-right truncate">
              {hwStats.piModel ?? t('settings.statsSection.unavailable')}
            </div>

            <div className="text-hs-text-faint">CPU</div>
            <div className="text-hs-text-secondary text-right truncate">
              {hwStats.cpuModel ?? t('settings.statsSection.unknown')} · {t('settings.statsSection.cores', { count: hwStats.cpuCores })}
            </div>

            <div className="text-hs-text-faint">{t('settings.statsSection.loadLabel')}</div>
            <div className="text-hs-text-secondary text-right font-mono tabular-nums">
              {hwStats.load1.toFixed(2)} / {hwStats.load5.toFixed(2)} / {hwStats.load15.toFixed(2)}
            </div>

            <div className="text-hs-text-faint">{t('settings.statsSection.throttling')}</div>
            <div className="text-right">
              {hwStats.throttled ? (
                hwStats.throttled.active ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-hs-danger bg-hs-danger/15 px-2 py-0.5 rounded-full border border-hs-danger/30">
                    <span className="w-1 h-1 rounded-full bg-hs-danger" />
                    {t('settings.statsSection.throttleActive', { raw: hwStats.throttled.raw })}
                  </span>
                ) : hwStats.throttled.previouslyThrottled ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-hs-warning bg-hs-warning/15 px-2 py-0.5 rounded-full border border-hs-warning/30">
                    <span className="w-1 h-1 rounded-full bg-hs-warning" />
                    {t('settings.statsSection.previouslyThrottled')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-hs-success bg-hs-success/15 px-2 py-0.5 rounded-full border border-hs-success/30">
                    <span className="w-1 h-1 rounded-full bg-hs-success" />
                    {t('settings.statsSection.throttleOk')}
                  </span>
                )
              ) : (
                <span className="text-hs-text-faint">{t('settings.statsSection.unavailable')}</span>
              )}
            </div>

            <div className="text-hs-text-faint">{t('settings.statsSection.temperature')}</div>
            <div className="text-right">
              {hwStats.cpuTempC !== null ? (
                <span className={`inline-flex items-baseline gap-1 text-sm font-semibold px-2.5 py-1 rounded-md border tabular-nums ${
                  tempColor === 'danger'
                    ? 'text-hs-danger bg-hs-danger/12 border-hs-danger/25'
                    : tempColor === 'warning'
                      ? 'text-hs-warning bg-hs-warning/12 border-hs-warning/25'
                      : 'text-hs-success bg-hs-success/12 border-hs-success/25'
                }`}>
                  <span>{hwStats.cpuTempC.toFixed(1)}</span>
                  <span className="text-[11px] font-normal">°C</span>
                </span>
              ) : (
                <span className="text-hs-text-faint">{t('settings.statsSection.unavailable')}</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-hs-text-faint">
          {t('settings.statsSection.noHardwareStats')}
        </p>
      )}
    </section>
  );
}
