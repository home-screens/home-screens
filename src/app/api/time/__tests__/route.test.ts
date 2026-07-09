/**
 * Route-level tests for `GET /api/time`.
 *
 * Covers the server clock payload shape and the formatting-locale cascade
 * (`formattingLocale` → `locale` → en-US), plus the swallow-on-error path
 * when `readConfig` throws.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return { ...actual, withDisplayAuth: (handler: unknown) => handler };
});

vi.mock('@/lib/config', () => ({ readConfig: vi.fn() }));

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { readConfig } from '@/lib/config';

const mockReadConfig = vi.mocked(readConfig);

const req = () => new NextRequest('http://localhost/api/time');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function configWith(settings: Record<string, unknown>): any {
  return { settings };
}

describe('GET /api/time', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns iso, timezone, and a formatted time', async () => {
    mockReadConfig.mockResolvedValue(configWith({ locale: 'en-US' }));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.iso).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(typeof body.timezone).toBe('string');
    expect(typeof body.formatted).toBe('string');
    expect(body.formatted.length).toBeGreaterThan(0);
  });

  it('prefers formattingLocale over locale for the formatted string', async () => {
    // de-DE formats time in 24h with a period separator; en-US uses AM/PM.
    mockReadConfig.mockResolvedValue(configWith({ locale: 'en-US', formattingLocale: 'de-DE' }));
    const res = await GET(req());
    const body = await res.json();
    expect(body.formatted).not.toMatch(/[AP]M/i);
  });

  it('falls back to en-US when config read fails', async () => {
    mockReadConfig.mockRejectedValue(new Error('corrupt config'));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.iso).toMatch(/Z$/);
    expect(typeof body.formatted).toBe('string');
  });
});
