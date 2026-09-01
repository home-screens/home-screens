'use client';

import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import type { WeatherViewProps } from './types';

const SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  Extreme: { bg: 'rgba(220, 38, 38, 0.15)', border: 'rgba(220, 38, 38, 0.5)', icon: 'text-red-400' },
  Severe:  { bg: 'rgba(234, 88, 12, 0.15)', border: 'rgba(234, 88, 12, 0.5)', icon: 'text-orange-400' },
  Moderate: { bg: 'rgba(202, 138, 4, 0.15)', border: 'rgba(202, 138, 4, 0.5)', icon: 'text-yellow-400' },
  Minor:   { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.5)', icon: 'text-blue-400' },
  Unknown: { bg: 'rgba(115, 115, 115, 0.15)', border: 'rgba(115, 115, 115, 0.5)', icon: 'text-neutral-400' },
};

export default function WeatherAlertsView({ alerts, scaledFontSize, timezone }: WeatherViewProps) {
  const locale = useFormattingLocale();
  const t = useTranslate('modules');
  const now = Math.floor(Date.now() / 1000);
  const active = (alerts ?? []).filter((a) => a.expires > now);

  return (
    <div className="w-full h-full flex flex-col" style={{ fontSize: `${scaledFontSize}px` }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2" style={{ flex: '0 0 auto' }}>
        <AlertTriangle size="1.5em" style={{ opacity: TEXT_OPACITY.secondary }} aria-hidden="true" />
        <span className="font-medium" style={{ fontSize: '1em' }}>{t('weather.weatherAlerts')}</span>
        {active.length > 0 && (
          <span style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.dim }}>{t('weather.alertCount', { count: active.length })}</span>
        )}
      </div>

      {active.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <ShieldCheck size="2.5em" style={{ opacity: TEXT_OPACITY.tertiary }} aria-hidden="true" />
          <p style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.tertiary }}>
            {alerts !== undefined ? t('weather.noActiveAlerts') : t('weather.alertDataRequires')}
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-2 overflow-y-auto min-h-0">
          {active.map((alert, i) => {
            const style = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.Unknown;
            const expiresDate = new Date(alert.expires * 1000);
            const expiresStr = expiresDate.toLocaleString(locale, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              ...(timezone ? { timeZone: timezone } : {}),
            });
            const severityLabel = t(`weather.severity.${alert.severity}`);

            return (
              <div
                key={i}
                className="rounded-lg p-3"
                style={{
                  backgroundColor: style.bg,
                  borderLeft: `3px solid ${style.border}`,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size="1em" className={style.icon} aria-hidden="true" />
                  <span className="font-semibold capitalize" style={{ fontSize: '0.85em' }}>
                    {alert.title}
                  </span>
                </div>
                <div className="mb-1" style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.secondary }}>
                  {t('weather.alertSeverityExpires', { severity: severityLabel, expires: expiresStr })}
                </div>
                <p className="line-clamp-3" style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.heading }}>
                  {alert.description}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
