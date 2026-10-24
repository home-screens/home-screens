'use client';

import Link from 'next/link';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';
import { settingsPath } from '@/lib/settings-route';
import { weatherProviderName } from '@/lib/weather-provider-names';
import { useForecastDaysSent, useForecastHoursSent } from '@/stores/preview-weather-store';

interface Props {
  /** The source the module actually reads, after `global` is resolved. */
  provider: string;
  /** The number of days or hours the module asks for. */
  requested: number;
  /** Which forecast length the field above asks for. Days unless said otherwise. */
  unit?: 'days' | 'hours';
  /** True while the module follows the household source rather than its own. */
  followsHousehold: boolean;
  /** Point this module at Open-Meteo, the keyless source that sends a full week. */
  onPickOpenMeteo: () => void;
}

/**
 * The line under a "days" or "hours" field that says where the forecast stops.
 *
 * A household that asks for seven days and sees three has no way to learn
 * that the source, not the module, is the limit. The editor preview already
 * fetched that source's forecast, so this reads the real count: a plain
 * caption while the ask fits, and a warning with the fix one click away when
 * it does not. Nothing at all until the count is known, so it never flashes.
 */
export function ForecastDaysHint({ provider, requested, unit = 'days', followsHousehold, onPickOpenMeteo }: Props) {
  const t = useTranslate('editor');
  const daysSent = useForecastDaysSent(provider);
  const hoursSent = useForecastHoursSent(provider);
  const sent = unit === 'hours' ? hoursSent : daysSent;
  if (sent == null || sent === 0) return null;

  const source = weatherProviderName(provider);
  const strings = unit === 'hours' ? 'configSections.weather.forecastHours' : 'configSections.weather.forecastDays';
  if (requested <= sent) {
    return (
      <p className="text-xs text-hs-text-muted" data-testid={`forecast-${unit}-hint`}>
        {t(`${strings}.sends`, { source, count: sent })}
      </p>
    );
  }

  return (
    <div
      className="rounded-md border border-hs-warning/30 bg-hs-warning/10 px-3 py-2 text-xs"
      data-testid={`forecast-${unit}-capped`}
    >
      <p className="text-hs-text-body">{t(`${strings}.capped`, { source, count: sent })}</p>
      {/* The free key's three-day cap is a days limit; its two days of hours are the usual 48. */}
      {provider === 'weatherapi' && unit === 'days' && (
        <p className="mt-1 text-hs-text-body">{t('configSections.weather.forecastDays.weatherApiFree')}</p>
      )}
      {provider !== 'open-meteo' && (
        <Button variant="primary" size="sm" className="mt-2" onClick={onPickOpenMeteo}>
          {t('configSections.weather.forecastDays.useOpenMeteo')}
        </Button>
      )}
      {followsHousehold && (
        <Link
          href={settingsPath({ kind: 'defaults', page: 'weather' })}
          className="mt-1.5 block font-medium text-hs-accent hover:underline"
        >
          {t('configSections.weather.forecastDays.changeHousehold')}
        </Link>
      )}
    </div>
  );
}
