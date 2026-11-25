'use client';

import { Thermometer } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useHouseholdTimeFormat } from '@/hooks/useHouseholdTimeFormat';
import { formatDateInTZ, formatTimeOfDay } from '@/lib/timezone';
import { useEditorStore } from '@/stores/editor-store';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import type { DisplayStatus } from '@/lib/display-commands';
import type { HardwareStats } from '@/lib/hardware-stats';
import { SectionHeading } from './shared/SectionHeading';
import StatusPill from '@/components/ui/StatusPill';
import type { SemanticColor } from './shared/types';

export function HardwareCard({
  displayStatus,
  hubHardware,
}: {
  displayStatus: DisplayStatus | null;
  hubHardware: HardwareStats | null;
}) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  const timezone = useEditorHouseholdTimezone();
  const timeFormat = useHouseholdTimeFormat(useEditorStore((s) => s.config?.settings?.timeFormat));
  // Pick best hardware source: reporter > hub fallback.
  const reporterStats = displayStatus?.hwStats ?? null;
  const hubStats = hubHardware;
  const hwStats = reporterStats ?? hubStats;
  const hwSource: 'reporter' | 'hub' | null = reporterStats ? 'reporter' : hubStats ? 'hub' : null;

  // On the household's clock and in its date style, like every other time the
  // editor shows, not the laptop's zone and browser language.
  const checkedAtText = (at: Date) =>
    `${formatDateInTZ(at, timezone, { dateStyle: 'medium' }, formattingLocale)}, ${formatTimeOfDay(at, { timeFormat, locale: formattingLocale, timezone })}`;
  // "Chromium 154.0.8037.92 · labwc 0.20.2": the upstream version without
  // the epoch and Debian revision, which say nothing to a person.
  const programs = hwStats?.packages
    ? Object.entries(hwStats.packages)
      .map(([name, version]) => `${name === 'chromium' ? 'Chromium' : name} ${version.replace(/^\d+:/, '').replace(/-[^-]*$/, '')}`)
      .join(' · ')
    : null;

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
                  <StatusPill tone="danger" dot>
                    {t('settings.statsSection.throttleActive', { raw: hwStats.throttled.raw })}
                  </StatusPill>
                ) : hwStats.throttled.previouslyThrottled ? (
                  <StatusPill tone="warning" dot>
                    {t('settings.statsSection.previouslyThrottled')}
                  </StatusPill>
                ) : (
                  <StatusPill tone="success" dot>
                    {t('settings.statsSection.throttleOk')}
                  </StatusPill>
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
                      ? 'text-hs-warning-ink bg-hs-warning/12 border-hs-warning/25'
                      : 'text-hs-success bg-hs-success/12 border-hs-success/25'
                }`}>
                  <span>{hwStats.cpuTempC.toFixed(1)}</span>
                  <span className="text-[11px] font-normal">°C</span>
                </span>
              ) : (
                <span className="text-hs-text-faint">{t('settings.statsSection.unavailable')}</span>
              )}
            </div>

            {programs && (
              <>
                <div className="text-hs-text-faint">{t('settings.statsSection.displayPrograms')}</div>
                <div className="text-hs-text-secondary text-right truncate" title={programs}>{programs}</div>
              </>
            )}
            {hwStats.packagesCheckedAt && (
              <>
                <div className="text-hs-text-faint">{t('settings.statsSection.programsChecked')}</div>
                <div className="text-hs-text-secondary text-right tabular-nums">
                  {checkedAtText(new Date(hwStats.packagesCheckedAt))}
                </div>
              </>
            )}
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
