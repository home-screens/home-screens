import { NextResponse } from 'next/server';
import { createWeatherProvider } from '@/lib/weather';
import { SetupError, withAuth, parseJsonBody, SMALL_BODY_BYTES } from '@/lib/api-utils';
import { weatherProviderName } from '@/lib/weather-provider-names';

export const dynamic = 'force-dynamic';

/** Providers that take a household API key, and so can reject one. */
const KEYED_PROVIDERS = new Set(['openweathermap', 'weatherapi', 'pirateweather', 'metoffice']);

// London: inside every keyed provider's coverage (the Met Office only
// answers for the UK), so a rejection here is about the key, not the place.
const PROBE_LAT = 51.5074;
const PROBE_LON = -0.1278;

export type WeatherKeyCheck =
  | { ok: true }
  /** `rejected`: the provider answered 401/403 for this key. `unreachable`: no verdict (outage, timeout, other error). */
  | { ok: false; reason: 'rejected' | 'unreachable'; provider: string; detail?: string };

/**
 * Try a weather API key against its provider before the editor saves it, so
 * a mistyped key is caught in the form instead of showing as a green
 * "Configured" badge with empty weather on the wall. The key is used for one
 * hourly request and never stored here. Editor session only.
 */
export const POST = withAuth(async (request) => {
  const body = await parseJsonBody<{ provider?: string; key?: string }>(request, { maxBytes: SMALL_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  const provider = typeof body.provider === 'string' ? body.provider : '';
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!KEYED_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: `Unknown keyed weather provider: ${provider}` }, { status: 400 });
  }
  if (!key) {
    return NextResponse.json({ error: 'Missing required field: key' }, { status: 400 });
  }

  const name = weatherProviderName(provider);
  try {
    await createWeatherProvider(provider, key).getHourly(PROBE_LAT, PROBE_LON, 'metric');
    return NextResponse.json({ ok: true } satisfies WeatherKeyCheck);
  } catch (err) {
    const detail = err instanceof Error ? err.message : undefined;
    const rejected = err instanceof SetupError && err.needs === 'invalidKey';
    return NextResponse.json({
      ok: false,
      reason: rejected ? 'rejected' : 'unreachable',
      provider: name,
      ...(detail ? { detail } : {}),
    } satisfies WeatherKeyCheck);
  }
}, 'Failed to check the weather key');
