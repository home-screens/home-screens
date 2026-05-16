'use client';

import { FolderTree } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { SectionHeading } from './shared/SectionHeading';
import { formatBytes } from './shared/formatters';
import { DATA_DIR_COLORS } from './metadata';
import type { SystemStats } from './types';

export function DataDirCard({ stats }: { stats: SystemStats }) {
  const t = useTranslate('editor');
  const dataDirTotal = stats.disk.dataDir.total;
  const dataSegments = [
    { label: t('settings.statsSection.dataBackgrounds'),  size: stats.disk.dataDir.backgrounds, color: DATA_DIR_COLORS.backgrounds },
    { label: t('settings.statsSection.dataBackups'),      size: stats.disk.dataDir.backups,     color: DATA_DIR_COLORS.backups },
    { label: t('settings.statsSection.dataConfiguration'), size: stats.disk.dataDir.config,      color: DATA_DIR_COLORS.config },
  ].filter(s => s.size > 0);

  return (
    <section>
      <SectionHeading icon={FolderTree} title={t('settings.statsSection.dataDirTitle')} />
      {dataDirTotal > 0 ? (
        <div>
          <div className="flex flex-wrap items-center justify-between text-[11px] mb-1.5 gap-x-3 gap-y-0.5">
            <span className="text-hs-text-faint">{t('settings.statsSection.totalAppData')}</span>
            <span className="text-hs-text-secondary font-mono tabular-nums whitespace-nowrap">
              {formatBytes(dataDirTotal)}
            </span>
          </div>
          <div className="flex h-2.5 rounded-md overflow-hidden bg-hs-card border border-hs-border-strong">
            {dataSegments.map((seg) => (
              <span
                key={seg.label}
                title={`${seg.label} ${formatBytes(seg.size)}`}
                style={{ background: seg.color, width: `${(seg.size / dataDirTotal) * 100}%` }}
                className="transition-[filter] hover:brightness-125"
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px]">
            {dataSegments.map((seg) => (
              <span key={seg.label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ background: seg.color }} />
                <span className="text-hs-text-muted">{seg.label}</span>
                <span className="text-hs-text-faint font-mono tabular-nums">
                  {formatBytes(seg.size)}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-hs-text-faint">{t('settings.statsSection.noAppData')}</p>
      )}
    </section>
  );
}
