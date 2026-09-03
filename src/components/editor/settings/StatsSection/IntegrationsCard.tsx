'use client';

import { useTranslate } from '@/i18n';
import { CONNECTABLE_SERVICES, isServiceConnected } from '@/lib/connectable-services';
import type { SystemStats } from '@/lib/system-stats-types';

/**
 * The connected-services grid on the Status page.
 *
 * Built from `CONNECTABLE_SERVICES`, the same list the API keys page renders,
 * so a service is named and grouped identically in both places. Google in
 * particular is one row here now rather than the two ("Google Maps" and
 * "Google OAuth") that its separate credentials used to produce.
 *
 * The old "{count} / {total} configured" fraction is gone. It counted secret
 * keys while the API keys page counted services, which put two different
 * numbers for the same idea on two pages of the same app. This page's job is
 * to show which things are connected, and the ticks do that without asserting
 * a total that only agrees with itself.
 */
export function IntegrationsCard({ stats }: { stats: SystemStats }) {
  const t = useTranslate('editor');
  const configuredKeys = stats.app.configuredSecrets;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between text-[11px] mb-2 gap-x-3 gap-y-0.5">
        <span className="text-hs-text-faint">{t('settings.statsSection.integrations')}</span>
      </div>
      {/* 2 cols on narrow, 3 on sm+. `min-w-0` on each row + `truncate`
          on the label prevents a long single-word name like
          "OpenWeatherMap" from bleeding into the next column (it has no
          space to break on, so without truncate it just overflows). */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5">
        {CONNECTABLE_SERVICES.map((service) => {
          const connected = isServiceConnected(service, configuredKeys);
          return (
            <div key={service.id} className="flex items-center gap-2 text-xs min-w-0">
              <span className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-md text-[10px] font-semibold font-mono border shrink-0 ${
                connected
                  ? 'bg-hs-success/20 text-hs-success border-hs-success/35'
                  : 'bg-hs-card text-hs-text-muted border-hs-border-strong'
              }`}>
                {service.initials}
              </span>
              <span
                title={service.label}
                className={`truncate ${connected ? 'text-hs-text-secondary' : 'text-hs-text-faint'}`}
              >
                {service.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
