'use client';

import { HardDrive } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { SectionIcon } from './shared/SectionIcon';
import { RingProgress } from './shared/RingProgress';
import { formatBytes, splitBytes, percentColor } from './shared/formatters';
import type { SystemStats } from './types';

export function StorageCard({ stats }: { stats: SystemStats }) {
  const t = useTranslate('editor');
  const diskPercent = stats.disk.total > 0 ? (stats.disk.used / stats.disk.total) * 100 : 0;
  const diskColor = percentColor(diskPercent);

  return (
    <div className="rounded-xl bg-hs-panel border border-hs-border-strong p-4 min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <SectionIcon icon={HardDrive} />
        <span className="text-[10px] uppercase tracking-[0.08em] text-hs-text-faint">{t('settings.statsSection.storageTitle')}</span>
      </div>
      {stats.disk.total > 0 ? (
        <div className="flex items-center gap-3">
          <RingProgress percent={diskPercent} color={diskColor}>
            <span className="text-[18px] font-semibold text-hs-text-primary leading-none tabular-nums">
              {Math.round(diskPercent)}
              <span className="text-hs-text-faint text-[11px]">%</span>
            </span>
          </RingProgress>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-hs-text-faint uppercase tracking-wider">{t('settings.statsSection.used')}</div>
            {/* Flex-wrap so the unit ("GB") can drop to its own line on very
                narrow columns instead of overflowing past the card edge.
                The "value / value" pair stays nowrap to never split. */}
            <div className="text-sm text-hs-text-body font-mono tabular-nums flex flex-wrap items-baseline gap-x-1">
              <span className="whitespace-nowrap">
                {splitBytes(stats.disk.used).value} / {splitBytes(stats.disk.total).value}
              </span>
              <span className="text-hs-text-faint">{splitBytes(stats.disk.total).unit}</span>
            </div>
            <div className="text-[11px] text-hs-text-faint mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
              <span className={`w-1 h-1 rounded-full self-center ${
                diskColor === 'success' ? 'bg-hs-success' :
                diskColor === 'warning' ? 'bg-hs-warning' : 'bg-hs-danger'
              }`} />
              <span className="font-mono tabular-nums text-hs-text-muted whitespace-nowrap">
                {formatBytes(stats.disk.free)}
              </span>
              <span>{t('settings.statsSection.free')}</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-hs-text-faint">{t('settings.statsSection.diskUnavailable')}</p>
      )}
    </div>
  );
}
