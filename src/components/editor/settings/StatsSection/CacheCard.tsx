'use client';

import { useState } from 'react';
import { Database } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { formatAge } from '@/lib/time-format';
import type { CacheStats } from '@/lib/display-cache';
import type { DisplayNode } from '@/types/config';
import type { DisplayStatus } from '@/lib/display-commands';
import { SectionHeading } from './shared/SectionHeading';
import { CacheStatTile } from './shared/CacheStatTile';
import { ThinBar } from './shared/ThinBar';
import { formatDuration, percentColor, shortenUrl } from './shared/formatters';
import type { SemanticColor } from './shared/types';

export function CacheCard({
  displayStatus,
  displayConnected,
  activeDisplay,
}: {
  displayStatus: DisplayStatus | null;
  displayConnected: boolean;
  activeDisplay: DisplayNode | null;
}) {
  const t = useTranslate('editor');
  const [showCacheDetails, setShowCacheDetails] = useState(false);

  // Guard against malformed cacheStats from older display clients.
  const rawCache = displayStatus?.cacheStats;
  const cacheStats: CacheStats | undefined = rawCache?.details
    ? rawCache
    : rawCache ? { ...rawCache, details: [] } : undefined;
  const cachePercent = cacheStats ? (cacheStats.entries / cacheStats.maxEntries) * 100 : 0;
  const hitRate = cacheStats && (cacheStats.hits + cacheStats.misses) > 0
    ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100
    : 0;
  const hitRateColor: SemanticColor =
    hitRate >= 90 ? 'success' : hitRate >= 70 ? 'warning' : 'danger';

  return (
    <section>
      <SectionHeading
        icon={Database}
        title={t('settings.statsSection.cacheTitle')}
        trailing={cacheStats && cacheStats.details.length > 0 ? (
          <button
            onClick={() => setShowCacheDetails(!showCacheDetails)}
            className="text-[11px] text-hs-accent hover:text-hs-accent-hover"
          >
            {showCacheDetails ? t('settings.statsSection.hideDetails') : t('settings.statsSection.showDetails')}
          </button>
        ) : null}
      />
      {displayConnected && cacheStats ? (
        <div className="space-y-3">
          {/* Column on narrow viewports (hit-rate above, mini-stats below),
              row once there's enough room for the 160px card + 2×2 grid. */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-5 sm:items-center">
            {/* Headline hit rate */}
            <div className="rounded-lg bg-hs-hover border border-hs-border-strong px-5 py-4 w-full sm:w-[160px] text-center shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-hs-text-faint">{t('settings.statsSection.hitRate')}</div>
              <div className={`text-[34px] font-semibold leading-none mt-1 tabular-nums ${
                hitRateColor === 'success' ? 'text-hs-success' :
                hitRateColor === 'warning' ? 'text-hs-warning' : 'text-hs-danger'
              }`}>
                {hitRate > 0 ? hitRate.toFixed(1) : '—'}
                {hitRate > 0 && <span className="text-hs-text-faint text-lg">%</span>}
              </div>
              <div className="text-[11px] text-hs-text-faint mt-1.5 font-mono tabular-nums">
                {cacheStats.hits.toLocaleString()} / {(cacheStats.hits + cacheStats.misses).toLocaleString()}
              </div>
            </div>
            {/* Mini stats — 1 col on phones, 2 cols once there's room. gap-x-2
                between label and value so they never butt up against each
                other, and both pieces are `whitespace-nowrap` + `min-w-0` so
                long compound values like "25 / 100" can't wrap onto their
                own lines the way they did before. */}
            <div className="grid grid-cols-2 gap-2 flex-1 min-w-0 self-stretch sm:self-start">
              <CacheStatTile label={t('settings.statsSection.entries')}  value={`${cacheStats.entries} / ${cacheStats.maxEntries}`} />
              <CacheStatTile label={t('settings.statsSection.fresh')}    value={String(cacheStats.fresh)}    tone="success" />
              <CacheStatTile label={t('settings.statsSection.stale')}    value={String(cacheStats.stale)}    tone={cacheStats.stale > 0 ? 'warning' : 'neutral'} />
              <CacheStatTile label={t('settings.statsSection.inflight')} value={String(cacheStats.inflight)} />
            </div>
          </div>
          {/* Entries fill bar */}
          <div>
            <div className="flex flex-wrap items-center justify-between text-[11px] mb-1 gap-x-3 gap-y-0.5">
              <span className="text-hs-text-faint">{t('settings.statsSection.entriesFill')}</span>
              <span className="text-hs-text-secondary font-mono tabular-nums whitespace-nowrap">
                {cacheStats.entries} / {cacheStats.maxEntries}
              </span>
            </div>
            <ThinBar percent={cachePercent} color={percentColor(cachePercent)} />
          </div>
          {cacheStats.evictions > 0 && (
            <p className="text-xs text-hs-text-faint">
              {t('settings.statsSection.evictions', { count: cacheStats.evictions })}
            </p>
          )}

          {showCacheDetails && cacheStats.details.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-md border border-hs-border-strong">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-hs-text-faint border-b border-hs-border-strong">
                    <th className="text-left px-2 py-1.5 font-medium">{t('settings.statsSection.cacheUrl')}</th>
                    <th className="text-right px-2 py-1.5 font-medium">{t('settings.statsSection.cacheAge')}</th>
                    <th className="text-right px-2 py-1.5 font-medium">{t('settings.statsSection.cacheTtl')}</th>
                    <th className="text-right px-2 py-1.5 font-medium">{t('settings.statsSection.cacheState')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hs-border">
                  {cacheStats.details.map((d) => (
                    <tr key={d.url} className="hover:bg-hs-hover">
                      <td className="px-2 py-1.5 text-hs-text-secondary font-mono truncate max-w-[200px]">
                        {shortenUrl(d.url)}
                      </td>
                      <td className="px-2 py-1.5 text-hs-text-muted text-right whitespace-nowrap">
                        {formatAge(d.ageMs)}
                      </td>
                      <td className="px-2 py-1.5 text-hs-text-muted text-right whitespace-nowrap">
                        {formatDuration(d.ttlMs)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          d.stale
                            ? 'bg-hs-warning/20 text-hs-warning'
                            : 'bg-hs-success/20 text-hs-success'
                        }`}>
                          {d.stale ? t('settings.statsSection.cacheStaleLabel') : t('settings.statsSection.cacheFreshLabel')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-hs-text-faint">
          {activeDisplay
            ? t('settings.statsSection.cacheNoDisplayForName', { name: activeDisplay.name })
            : t('settings.statsSection.cacheNoDisplay')}
        </p>
      )}
    </section>
  );
}
