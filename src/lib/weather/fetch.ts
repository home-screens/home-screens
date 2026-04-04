import { fetchWithTimeout } from '@/lib/api-utils';

export async function fetchWeatherJSON<T>(url: string, provider: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${provider} API error ${res.status}: ${body}`);
  }
  return res.json();
}
