'use client';

import { useTranslate } from '@/i18n';
import { MODULE_PALETTE, MODULE_OTHER_COLOR } from './metadata';
import type { SystemStats } from '@/lib/system-stats-types';

export function ModulesCard({ stats }: { stats: SystemStats }) {
  const t = useTranslate('editor');
  // Module breakdown: top 7 by count, rest bucketed into "other".
  const moduleEntries = Object.entries(stats.app.moduleTypes)
    .sort(([, a], [, b]) => b - a);
  const topTypes = moduleEntries.slice(0, 7);
  const restTypes = moduleEntries.slice(7);
  const restTotal = restTypes.reduce((sum, [, n]) => sum + n, 0);
  const moduleSegments: Array<{ label: string; count: number; color: string }> = [
    ...topTypes.map(([type, count], i) => ({
      label: type,
      count,
      color: MODULE_PALETTE[i % MODULE_PALETTE.length],
    })),
    ...(restTotal > 0
      ? [{ label: t('settings.statsSection.moduleOther'), count: restTotal, color: MODULE_OTHER_COLOR }]
      : []),
  ];
  const moduleTotal = stats.app.modules || moduleSegments.reduce((s, seg) => s + seg.count, 0);
  const moduleTypeCount = Object.keys(stats.app.moduleTypes).length;

  if (moduleSegments.length === 0 || moduleTotal === 0) return null;

  return (
    <div className="mt-4">
      {/* gap-x + flex-wrap means the summary wraps to two lines
          cleanly when the viewport's too narrow, instead of the
          mid-dot breaking "· 37 types" mid-phrase. */}
      <div className="flex flex-wrap items-center justify-between text-[11px] mb-1.5 gap-x-3 gap-y-0.5">
        <span className="text-hs-text-faint">{t('settings.statsSection.moduleBreakdown')}</span>
        <span className="text-hs-text-faint font-mono tabular-nums whitespace-nowrap">
          {t('settings.statsSection.moduleSummary', { count: moduleTotal, types: moduleTypeCount })}
        </span>
      </div>
      <div className="flex h-2.5 rounded-md overflow-hidden bg-hs-card border border-hs-border-strong">
        {moduleSegments.map((seg) => (
          <span
            key={seg.label}
            title={`${seg.label} ×${seg.count}`}
            style={{ background: seg.color, width: `${(seg.count / moduleTotal) * 100}%` }}
            className="transition-[filter] hover:brightness-125"
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 text-[11px]">
        {moduleSegments.map((seg) => (
          <span key={seg.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: seg.color }} />
            <span className="text-hs-text-muted">{seg.label}</span>
            <span className="text-hs-text-faint tabular-nums">{seg.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
