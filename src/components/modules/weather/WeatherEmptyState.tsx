interface WeatherEmptyStateProps {
  message?: string;
}

/** Placeholder shown when weather/forecast data is unavailable. */
export function WeatherEmptyState({ message = 'No weather data' }: WeatherEmptyStateProps) {
  return <p className="opacity-50" style={{ fontSize: '0.875em' }}>{message}</p>;
}
