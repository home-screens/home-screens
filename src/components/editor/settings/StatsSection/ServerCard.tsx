'use client';

import { Server } from 'lucide-react';
import { useTranslate } from '@/i18n';
import Button from '@/components/ui/Button';
import { formatUptime } from '@/lib/time-format';
import { SectionHeading } from './shared/SectionHeading';
import type { SystemStats } from '@/lib/system-stats-types';

export function ServerCard({
  stats,
  bundleState,
  bundleError,
  onGenerateBundle,
  onRefresh,
}: {
  stats: SystemStats;
  bundleState: 'idle' | 'generating' | 'error';
  bundleError: string | null;
  onGenerateBundle: () => void;
  onRefresh: () => void;
}) {
  const t = useTranslate('editor');
  return (
    <section>
      <SectionHeading
        icon={Server}
        title={t('settings.statsSection.serverTitle')}
        trailing={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={onGenerateBundle}
              disabled={bundleState === 'generating'}
            >
              {bundleState === 'generating' ? t('settings.statsSection.generatingBundle') : t('settings.statsSection.diagnosticsBundle')}
            </Button>
            <Button variant="secondary" size="sm" onClick={onRefresh}>
              {t('common.refresh')}
            </Button>
          </>
        }
      />
      {bundleState === 'error' && bundleError && (
        <p className="text-xs text-hs-danger mb-2">
          {t('settings.statsSection.bundleFailed', { error: bundleError })}
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        <div className="text-hs-text-faint">{t('settings.statsSection.hostname')}</div>
        <div className="text-hs-text-secondary font-mono">{stats.os.hostname}</div>
        <div className="text-hs-text-faint">{t('settings.statsSection.platform')}</div>
        <div className="text-hs-text-secondary">{stats.os.platform} / {stats.os.arch}</div>
        <div className="text-hs-text-faint">Node.js</div>
        <div className="text-hs-text-secondary font-mono">{stats.os.nodeVersion}</div>
        <div className="text-hs-text-faint">{t('settings.statsSection.uptime')}</div>
        <div className="text-hs-text-secondary">{formatUptime(stats.os.uptime)}</div>
      </div>
    </section>
  );
}
