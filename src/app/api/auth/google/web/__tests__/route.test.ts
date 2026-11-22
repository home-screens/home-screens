import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const mockLink = vi.fn();
const mockExchange = vi.fn();
vi.mock('@/lib/google-auth', () => ({
  getCalendarWebAuthUrl: (...args: unknown[]) => mockLink(...args),
  exchangeCalendarWebCode: (...args: unknown[]) => mockExchange(...args),
}));

const post = (body: unknown) => new NextRequest('http://localhost/api/auth/google/web', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('/api/auth/google/web', () => {
  beforeEach(() => {
    vi.resetModules();
    mockLink.mockReset();
    mockExchange.mockReset();
  });
  const route = () => import('@/app/api/auth/google/web/route');

  it('GET answers the link, with the hub address only when it names this host', async () => {
    mockLink.mockResolvedValue({ url: 'https://accounts.google.com/x', returnsToHub: true });
    const { GET } = await route();
    const res = await GET(new NextRequest('http://localhost:3000/api/auth/google/web?origin=http%3A%2F%2Flocalhost%3A3000', { headers: { host: 'localhost:3000' } }));
    expect(await res.json()).toEqual({ url: 'https://accounts.google.com/x', returnsToHub: true });
    expect(mockLink).toHaveBeenCalledWith('http://localhost:3000');
    await GET(new NextRequest('http://localhost:3000/api/auth/google/web?origin=http%3A%2F%2Fevil.example', { headers: { host: 'localhost:3000' } }));
    expect(mockLink).toHaveBeenLastCalledWith(null);
  });

  it('POST redeems a pasted code and says whether events can be added', async () => {
    mockExchange.mockResolvedValue({ ok: true, canAddEvents: false });
    const { POST } = await route();
    const res = await POST(post({ code: '4/abc' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connected: true, canAddEvents: false });
    expect(mockExchange).toHaveBeenCalledWith('4/abc');
  });

  it('POST turns down a missing code and passes an expired sign-in on', async () => {
    const { POST } = await route();
    expect((await POST(post({}))).status).toBe(400);
    mockExchange.mockResolvedValue({ ok: false, error: 'That sign-in has expired.', expired: true });
    const res = await POST(post({ code: '4/old' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'That sign-in has expired.', expired: true });
  });
});
