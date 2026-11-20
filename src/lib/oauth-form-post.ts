import { fetchWithTimeout } from '@/lib/api-utils';
import { parseDeviceCodeStart, type DeviceCodeStart } from '@/lib/oauth-device-flow';

/**
 * The form POST every OAuth endpoint takes, with an answer that is always
 * safe to read: a provider's error page that is not JSON leaves `data` empty
 * and never throws a parser message at the person signing in. The answer is
 * read as JSON or form-urlencoded by its Content-Type, since some providers
 * still answer urlencoded. Server only
 * (it reaches `fetchWithTimeout`); the pure answer rules live in
 * `oauth-device-flow.ts`, which the editor imports.
 */
export async function postOAuthForm(
  url: string,
  params: Record<string, string>,
  headers: Record<string, string> = {},
  timeout?: number,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...headers },
    body: new URLSearchParams(params),
    ...(timeout !== undefined ? { timeout } : {}),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  const contentType = res.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('json')) {
      data = JSON.parse(text);
    } else {
      data = Object.fromEntries(new URLSearchParams(text));
    }
  } catch {
    // leave data empty; callers treat missing fields as failure
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Start a device-code sign-in: one request, one way of reading the answer,
 * for Google Calendar, OneDrive and OAuth2 plugins alike.
 */
export async function requestDeviceCodeGrant(
  url: string,
  params: Record<string, string>,
  timeout?: number,
): Promise<DeviceCodeStart> {
  const result = await postOAuthForm(url, params, {}, timeout);
  return parseDeviceCodeStart(result.ok, result.status, result.data);
}
