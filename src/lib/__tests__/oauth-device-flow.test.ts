import { describe, it, expect } from 'vitest';
import { classifyDeviceTokenAnswer, SLOW_DOWN_STEP_MS } from '@/lib/oauth-device-flow';

describe('classifyDeviceTokenAnswer', () => {
  it('reads the provider\'s own words whatever status they ride on', () => {
    // Google answers 428, Microsoft 400, GitHub 200: the body decides.
    for (const status of [200, 400, 428]) {
      expect(classifyDeviceTokenAnswer(status, { error: 'authorization_pending' })).toEqual({ kind: 'pending' });
      expect(classifyDeviceTokenAnswer(status, { error: 'slow_down' })).toEqual({ kind: 'slowDown' });
      expect(classifyDeviceTokenAnswer(status, { error: 'expired_token' })).toEqual({ kind: 'expired' });
    }
  });

  it('treats slow_down as slow_down even when a provider sends it as a 429', () => {
    expect(classifyDeviceTokenAnswer(429, { error: 'slow_down' })).toEqual({ kind: 'slowDown' });
  });

  it('grants on a 2xx with no error code and leaves the token shape to the provider', () => {
    const tokens = { access_token: 'at', refresh_token: 'rt', expires_in: 3600 };
    expect(classifyDeviceTokenAnswer(200, tokens)).toEqual({ kind: 'granted', tokens });
    // A plugin whose token sits under another key is still a grant.
    const nested = { data: { token: 'nested' } };
    expect(classifyDeviceTokenAnswer(200, nested)).toEqual({ kind: 'granted', tokens: nested });
  });

  it('knows the person said no, with or without a reason, on both spellings', () => {
    expect(classifyDeviceTokenAnswer(403, { error: 'access_denied' }))
      .toEqual({ kind: 'denied', declined: true, detail: undefined });
    expect(classifyDeviceTokenAnswer(400, { error: 'authorization_declined', error_description: 'AADSTS70020: declined' }))
      .toEqual({ kind: 'denied', declined: true, detail: 'AADSTS70020: declined' });
  });

  it.each([
    ['no answer at all', 0, null],
    ['a rate limit', 429, { error: 'rate_limited' }],
    ['the provider down', 503, { error: 'temporarily_unavailable' }],
    ['a gateway page', 502, '<html>Bad gateway</html>'],
    ['an empty 500', 500, {}],
  ])('keeps the flow going through %s', (_, status, body) => {
    expect(classifyDeviceTokenAnswer(status, body)).toEqual({ kind: 'transient' });
  });

  it('ends the flow on any other refusal, carrying the provider\'s reason', () => {
    expect(classifyDeviceTokenAnswer(400, { error: 'invalid_client', error_description: 'AADSTS700016: app not found' }))
      .toEqual({ kind: 'denied', declined: false, detail: 'AADSTS700016: app not found' });
    expect(classifyDeviceTokenAnswer(401, { error: 'invalid_client' }))
      .toEqual({ kind: 'denied', declined: false, detail: 'invalid_client' });
    // A 2xx that carries an unknown error code is a refusal, not a grant.
    expect(classifyDeviceTokenAnswer(200, { error: 'some_weird_error' }))
      .toEqual({ kind: 'denied', declined: false, detail: 'some_weird_error' });
  });

  it('ends the flow on a 4xx that says nothing, with no reason to show', () => {
    expect(classifyDeviceTokenAnswer(400, {})).toEqual({ kind: 'denied', declined: false, detail: undefined });
    expect(classifyDeviceTokenAnswer(400, null)).toEqual({ kind: 'denied', declined: false, detail: undefined });
  });

  it('spaces polls five seconds further apart after a slow_down, as RFC 8628 says', () => {
    expect(SLOW_DOWN_STEP_MS).toBe(5000);
  });
});
