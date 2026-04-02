import { TEXT_OPACITY } from '@/lib/constants';

interface WeatherEmptyStateProps {
  message?: string;
}

/** Placeholder shown when weather/forecast data is unavailable. */
export function WeatherEmptyState({ message = 'No weather data' }: WeatherEmptyStateProps) {
  return <p style={{ fontSize: '0.875em', opacity: TEXT_OPACITY.dim }}>{message}</p>;
}
