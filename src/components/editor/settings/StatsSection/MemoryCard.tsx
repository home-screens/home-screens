'use client';

import { Cpu } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { SectionIcon } from './shared/SectionIcon';
import { RingProgress } from './shared/RingProgress';
import { formatBytes, splitBytes, percentColor } from './shared/formatters';
import type { SystemStats } from './types';

export function MemoryCard({ stats }: { stats: SystemStats }) {
  const t = useTranslate('editor');
  const memPercent = stats.memory.total > 0 ? (stats.memory.used / stats.memory.total) * 100 : 0;
  const memColor = percentColor(memPercent);

  return (
    <div className="rounded-xl bg-hs-panel border border-hs-border-strong p-4 min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <SectionIcon icon={Cpu} />
        <span className="text-[10px] uppercase tracking-[0.08em] text-hs-text-faint">{t('settings.statsSection.memoryTitle')}</span>
      </div>
      <div className="flex items-center gap-3">
        <RingProgress percent={memPercent} color={memColor}>
          <span className="text-[18px] font-semibold text-hs-text-primary leading-none tabular-nums">
            {Math.round(memPercent)}
            <span className="text-hs-text-faint text-[11px]">%</span>
          </span>
        </RingProgress>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-hs-text-faint uppercase tracking-wider">{t('settings.statsSection.inUse')}</div>
          <div className="text-sm text-hs-text-body font-mono tabular-nums flex flex-wrap items-baseline gap-x-1">
            <span className="whitespace-nowrap">
              {splitBytes(stats.memory.used).value} / {splitBytes(stats.memory.total).value}
            </span>
            <span className="text-hs-text-faint">{splitBytes(stats.memory.total).unit}</span>
          </div>
          <div className="text-[11px] text-hs-text-faint mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
            <span className={`w-1 h-1 rounded-full self-center ${
              memColor === 'success' ? 'bg-hs-success' :
              memColor === 'warning' ? 'bg-hs-warning' : 'bg-hs-danger'
            }`} />
            <span className="font-mono tabular-nums text-hs-text-muted whitespace-nowrap">
              {formatBytes(stats.memory.free)}
            </span>
            <span>{t('settings.statsSection.free')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
