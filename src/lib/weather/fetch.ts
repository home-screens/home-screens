import { createTTLCache, fetchWithTimeout } from '@/lib/api-utils';
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

/**
 * One upstream answer per key, shared by everyone who asks while it is
 * loading and, with a TTL, by everyone who asks until it expires.
 *
 * The weather route asks a provider for its hours and its days at the same
 * moment, and for most providers both come out of one upstream document.
 * Without this the two calls each start their own request: a cache alone
 * does not help, because both look before either has stored anything.
 * `ttlMs: 0` keeps nothing once the answer lands, which is the plain
 * "one request per refresh". A failed load is never kept, so the next
 * refresh asks again.
 */
export function createProviderFetch<T>({ ttlMs = 0 }: { ttlMs?: number } = {}) {
  const cache = ttlMs > 0 ? createTTLCache<{ value: T }>(ttlMs) : null;
  const inFlight = new Map<string, Promise<T>>();
  const fetchOnce = (key: string, load: () => Promise<T>): Promise<T> => {
    const cached = cache?.get(key);
    if (cached) return Promise.resolve(cached.value);
    const existing = inFlight.get(key);
    if (existing) return existing;
    const promise = load()
      .then((value) => {
        cache?.set(key, { value });
        return value;
      })
      .finally(() => {
        inFlight.delete(key);
      });
    inFlight.set(key, promise);
    return promise;
  };
  /** Forget everything kept and in flight (tests). */
  fetchOnce.clear = () => {
    cache?.clear();
    inFlight.clear();
  };
  return fetchOnce;
}
