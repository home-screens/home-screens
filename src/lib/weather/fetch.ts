import { fetchWithTimeout, SetupError } from '@/lib/api-utils';

export async function fetchWeatherJSON<T>(url: string, provider: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${provider} API error ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * For providers that authenticate with a household API key. A 401/403 from
 * one of these is a rejected key, a setup problem the household can fix on
 * the Weather page, not an outage. Keyless providers (NOAA, Yr.no, SMHI,
 * Open-Meteo, Environment Canada) also answer 403 for throttling or a bad
 * User-Agent, which is why they stay on `fetchWeatherJSON`.
 */
export async function fetchKeyedWeatherJSON<T>(url: string, provider: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) {
    const body = await res.text();
    const message = `${provider} API error ${res.status}: ${body}`;
    if (res.status === 401 || res.status === 403) throw new SetupError(message, 'invalidKey', provider, 'weather');
    throw new Error(message);
  }
  return res.json();
}
