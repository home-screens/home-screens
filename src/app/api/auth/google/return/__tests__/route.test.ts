import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const mockCalendar = vi.fn();
const mockPhotos = vi.fn();
let purpose: 'photos' | 'calendar' | null = null;
vi.mock('@/lib/google-auth', () => ({ exchangeCalendarWebCode: (...a: unknown[]) => mockCalendar(...a) }));
vi.mock('@/lib/google-picker', () => ({ exchangePickerCode: (...a: unknown[]) => mockPhotos(...a) }));
vi.mock('@/lib/google-web-sign-in', () => ({ signInPurpose: () => purpose }));

const post = (body: unknown) => new NextRequest('http://localhost/api/auth/google/return', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('/api/auth/google/return', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCalendar.mockReset();
    mockPhotos.mockReset();
    purpose = null;
  });
  const route = () => import('@/app/api/auth/google/return/route');

  it('redeems a Calendar sign-in into the calendar grant', async () => {
    purpose = 'calendar';
    mockCalendar.mockResolvedValue({ ok: true, canAddEvents: true });
    const { POST } = await route();
    const res = await POST(post({ code: '4/abc', state: 'nonce.aGk' }));
    expect(await res.json()).toEqual({ connected: true, purpose: 'calendar', canAddEvents: true });
    expect(mockCalendar).toHaveBeenCalledWith('4/abc', 'nonce.aGk');
    expect(mockPhotos).not.toHaveBeenCalled();
  });

  it('leaves everything else to Photos, which answers an expired sign-in as before', async () => {
    mockPhotos.mockResolvedValue({ ok: false, error: 'That sign-in has expired.', expired: true });
    const { POST } = await route();
    const res = await POST(post({ code: '4/abc', state: 'gone' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'That sign-in has expired.', expired: true });
    purpose = 'photos';
    mockPhotos.mockResolvedValue({ ok: true });
    expect(await (await POST(post({ code: '4/abc', state: 's' }))).json()).toEqual({ connected: true, purpose: 'photos' });
  });

  it('turns down a request without a code or a state', async () => {
    const { POST } = await route();
    expect((await POST(post({ state: 's' }))).status).toBe(400);
    expect((await POST(post({ code: '4/abc' }))).status).toBe(400);
  });
});
