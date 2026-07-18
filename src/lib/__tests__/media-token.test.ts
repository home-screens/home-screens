import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  signMediaToken,
  verifyMediaToken,
  mintMediaToken,
  DEFAULT_MEDIA_TOKEN_TTL_MS,
} from '@/lib/media-token';

vi.mock('@/lib/auth', () => ({
  getMediaTokenSecret: vi.fn().mockResolvedValue(null),
}));

import { getMediaTokenSecret } from '@/lib/auth';

const SECRET = 'a'.repeat(64);

afterEach(() => {
  vi.useRealTimers();
});

describe('signMediaToken / verifyMediaToken', () => {
  it('round-trips a token for the same resource', () => {
    const token = signMediaToken(SECRET, 'themes/x/clip.mp4');
    expect(verifyMediaToken(SECRET, 'themes/x/clip.mp4', token)).toBe(true);
  });

  it('rejects a token presented for a different resource', () => {
    const token = signMediaToken(SECRET, 'themes/x/clip.mp4');
    expect(verifyMediaToken(SECRET, 'themes/x/other.mp4', token)).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signMediaToken(SECRET, 'clip.mp4');
    expect(verifyMediaToken('b'.repeat(64), 'clip.mp4', token)).toBe(false);
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    const token = signMediaToken(SECRET, 'clip.mp4', 1000);
    vi.advanceTimersByTime(1001);
    expect(verifyMediaToken(SECRET, 'clip.mp4', token)).toBe(false);
  });

  it('accepts a token within its TTL', () => {
    vi.useFakeTimers();
    const token = signMediaToken(SECRET, 'clip.mp4', 1000);
    vi.advanceTimersByTime(999);
    expect(verifyMediaToken(SECRET, 'clip.mp4', token)).toBe(true);
  });

  it('uses a 6h default TTL', () => {
    vi.useFakeTimers();
    const token = signMediaToken(SECRET, 'clip.mp4');
    vi.advanceTimersByTime(DEFAULT_MEDIA_TOKEN_TTL_MS - 1);
    expect(verifyMediaToken(SECRET, 'clip.mp4', token)).toBe(true);
    vi.advanceTimersByTime(2);
    expect(verifyMediaToken(SECRET, 'clip.mp4', token)).toBe(false);
  });

  it('rejects a tampered expiry (signature binds exp)', () => {
    const token = signMediaToken(SECRET, 'clip.mp4', 1000);
    const [, sig] = token.split('.');
    const forged = `${Date.now() + 10 * 60_000}.${sig}`;
    expect(verifyMediaToken(SECRET, 'clip.mp4', forged)).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const token = signMediaToken(SECRET, 'clip.mp4');
    const [exp] = token.split('.');
    expect(verifyMediaToken(SECRET, 'clip.mp4', `${exp}.AAAA`)).toBe(false);
  });

  it('rejects malformed tokens without throwing', () => {
    for (const bad of ['', '.', 'nodot', '123.', '.sig', 'abc.def']) {
      expect(verifyMediaToken(SECRET, 'clip.mp4', bad)).toBe(false);
    }
  });
});

describe('mintMediaToken', () => {
  it('returns null when auth is disabled (no secret)', async () => {
    vi.mocked(getMediaTokenSecret).mockResolvedValueOnce(null);
    expect(await mintMediaToken('clip.mp4')).toBeNull();
  });

  it('returns a verifiable token when auth is enabled', async () => {
    vi.mocked(getMediaTokenSecret).mockResolvedValueOnce(SECRET);
    const token = await mintMediaToken('clip.mp4');
    expect(token).not.toBeNull();
    expect(verifyMediaToken(SECRET, 'clip.mp4', token!)).toBe(true);
  });
});
