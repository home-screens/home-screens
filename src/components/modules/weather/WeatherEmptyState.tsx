'use client';

import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate } from '@/i18n';

interface WeatherEmptyStateProps {
  message?: string;
}

/** Placeholder shown when weather/forecast data is unavailable. */
export function WeatherEmptyState({ message }: WeatherEmptyStateProps) {
  const t = useTranslate('modules');
  const text = message ?? t('weather.noWeatherData');
  return <p style={{ fontSize: '0.875em', opacity: TEXT_OPACITY.dim }}>{text}</p>;
}
