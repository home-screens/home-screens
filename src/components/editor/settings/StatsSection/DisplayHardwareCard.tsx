'use client';

import { Monitor } from 'lucide-react';
import { useTranslate } from '@/i18n';
import type { DisplayNode } from '@/types/config';
import type { DisplayStatus } from '@/lib/display-commands';
import { SectionHeading } from './shared/SectionHeading';

export function DisplayHardwareCard({
  displayStatus,
  activeDisplay,
}: {
  displayStatus: DisplayStatus | null;
  activeDisplay: DisplayNode | null;
}) {
  const t = useTranslate('editor');
  return (
    <section>
      <SectionHeading icon={Monitor} title={t('settings.statsSection.displayHardwareTitle')} />
      {displayStatus?.browserStats ? (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-hs-hover border border-hs-border-strong px-3 py-2.5">
            <div className="text-[10px] text-hs-text-faint uppercase tracking-wider">GPU</div>
            <div className="text-xs text-hs-text-secondary mt-0.5 truncate"
                 title={displayStatus.browserStats.webglRenderer ?? t('settings.statsSection.webglUnavailable')}>
              {displayStatus.browserStats.webglRenderer ?? t('settings.statsSection.webglUnavailable')}
            </div>
          </div>
          <div className="rounded-md bg-hs-hover border border-hs-border-strong px-3 py-2.5">
            <div className="text-[10px] text-hs-text-faint uppercase tracking-wider">{t('settings.statsSection.cpuCoresLabel')}</div>
            <div className="text-xs text-hs-text-secondary mt-0.5 font-mono tabular-nums">
              {displayStatus.browserStats.hardwareConcurrency ?? t('settings.statsSection.unknown')}
            </div>
          </div>
          <div className="rounded-md bg-hs-hover border border-hs-border-strong px-3 py-2.5">
            <div className="text-[10px] text-hs-text-faint uppercase tracking-wider">{t('settings.statsSection.deviceMemoryLabel')}</div>
            <div className="text-xs text-hs-text-secondary mt-0.5 font-mono tabular-nums">
              {displayStatus.browserStats.deviceMemory !== null
                ? t('settings.statsSection.deviceMemoryGb', { gb: displayStatus.browserStats.deviceMemory })
                : t('settings.statsSection.unknown')}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-hs-text-faint">
          {activeDisplay
            ? t('settings.statsSection.noBrowserStatsForName', { name: activeDisplay.name })
            : t('settings.statsSection.noBrowserStats')}
        </p>
      )}
    </section>
  );
}
