import { fetchWithTimeout } from '@/lib/api-utils';
import { upstreamError } from '@/lib/upstream-error';

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
  if (!res.ok) throw await upstreamError(res, provider, { page: 'weather' });
  return res.json();
}
