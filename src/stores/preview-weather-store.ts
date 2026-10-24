import { create } from 'zustand';

/**
 * What the editor's weather preview learned about each source, kept where
 * the property panel can read it. `usePreviewData` fetches every source the
 * canvas needs and writes the forecast lengths here, so a days or hours field
 * can say "WeatherAPI.com sends 3 days" or "Pirate Weather sends 48 hours"
 * from the real answer for the real key instead of a table that would be
 * wrong for a paid plan or a generous source.
 */
export interface PreviewForecastLengths {
  /** Forecast days each source sent on its latest preview fetch, by provider id. */
  days: Record<string, number>;
  /** Forecast hours each source sent on its latest preview fetch, by provider id. */
  hours: Record<string, number>;
}

interface PreviewWeatherState {
  forecastDays: Record<string, number>;
  forecastHours: Record<string, number>;
  setForecastLengths: (lengths: PreviewForecastLengths) => void;
}

export const usePreviewWeatherStore = create<PreviewWeatherState>((set) => ({
  forecastDays: {},
  forecastHours: {},
  setForecastLengths: ({ days, hours }) => set({ forecastDays: days, forecastHours: hours }),
}));

/**
 * How many forecast days `provider` sent the preview, or null while nothing
 * has landed or the fetch failed. Null means "say nothing", never a guess.
 */
export function useForecastDaysSent(provider: string): number | null {
  return usePreviewWeatherStore((s) => s.forecastDays[provider] ?? null);
}

/** How many forecast hours `provider` sent the preview, or null while unknown. */
export function useForecastHoursSent(provider: string): number | null {
  return usePreviewWeatherStore((s) => s.forecastHours[provider] ?? null);
}
