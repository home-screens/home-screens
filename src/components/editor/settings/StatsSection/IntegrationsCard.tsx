'use client';

import { useTranslate } from '@/i18n';
import { INTEGRATION_META } from './metadata';
import type { SystemStats } from '@/lib/system-stats-types';

export function IntegrationsCard({ stats }: { stats: SystemStats }) {
  const t = useTranslate('editor');
  // Only count secrets that map to a known integration tile — otherwise an
  // unrelated secret (e.g. a password hash) inflates the numerator past the
  // denominator and we display the nonsense "10 / 9 configured".
  const integrationKeys = Object.keys(INTEGRATION_META).filter(k => k !== 'google_client_secret');
  const configuredIntegrationKeys = stats.app.configuredSecrets.filter(
    k => k !== 'google_client_secret' && k in INTEGRATION_META,
  );

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between text-[11px] mb-2 gap-x-3 gap-y-0.5">
        <span className="text-hs-text-faint">{t('settings.statsSection.integrations')}</span>
        <span className="text-hs-text-faint font-mono tabular-nums whitespace-nowrap">
          {t('settings.statsSection.integrationsConfigured', { count: configuredIntegrationKeys.length, total: integrationKeys.length })}
        </span>
      </div>
      {/* 2 cols on narrow, 3 on sm+. `min-w-0` on each row + `truncate`
          on the label prevents a long single-word name like
          "OpenWeatherMap" from bleeding into the next column (it has no
          space to break on, so without truncate it just overflows). */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5">
        {integrationKeys.map((key) => {
          const meta = INTEGRATION_META[key];
          const configured = configuredIntegrationKeys.includes(key);
          return (
            <div key={key} className="flex items-center gap-2 text-xs min-w-0">
              <span className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-md text-[10px] font-semibold font-mono border shrink-0 ${
                configured
                  ? 'bg-hs-success/20 text-hs-success border-hs-success/35'
                  : 'bg-hs-card text-hs-text-muted border-hs-border-strong'
              }`}>
                {meta.initials}
              </span>
              <span
                title={meta.label}
                className={`truncate ${configured ? 'text-hs-text-secondary' : 'text-hs-text-faint'}`}
              >
                {meta.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
