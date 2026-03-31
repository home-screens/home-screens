import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/holidays', () => ({
  fetchAvailableCountries: vi.fn(),
  fetchHolidayEvents: vi.fn(),
}));

import { GET } from '@/app/api/holidays/route';
import { fetchAvailableCountries, fetchHolidayEvents } from '@/lib/holidays';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/holidays', () => {
  describe('countries list', () => {
    it('returns available countries when ?countries param is present', async () => {
      const countries = [
        { countryCode: 'US', name: 'United States' },
        { countryCode: 'DE', name: 'Germany' },
      ];
      vi.mocked(fetchAvailableCountries).mockResolvedValue(countries);

      const req = new NextRequest('http://localhost/api/holidays?countries');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual(countries);
    });

    it('returns 500 when fetchAvailableCountries fails', async () => {
      vi.mocked(fetchAvailableCountries).mockRejectedValue(new Error('network error'));

      const req = new NextRequest('http://localhost/api/holidays?countries');
      const res = await GET(req);

      expect(res.status).toBe(500);
    });
  });

  describe('country parameter validation', () => {
    it('returns 400 when country param is missing', async () => {
      const req = new NextRequest('http://localhost/api/holidays');
      const res = await GET(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('country');
    });

    it('returns 400 when country is not a 2-letter code', async () => {
      const req = new NextRequest('http://localhost/api/holidays?country=USA');
      const res = await GET(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('country');
    });

    it('returns 400 when country contains numbers', async () => {
      const req = new NextRequest('http://localhost/api/holidays?country=U1');
      const res = await GET(req);

      expect(res.status).toBe(400);
    });

    it('accepts valid 2-letter country code', async () => {
      vi.mocked(fetchHolidayEvents).mockResolvedValue([]);

      const req = new NextRequest('http://localhost/api/holidays?country=US');
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(fetchHolidayEvents).toHaveBeenCalled();
    });

    it('accepts lowercase 2-letter country code', async () => {
      vi.mocked(fetchHolidayEvents).mockResolvedValue([]);

      const req = new NextRequest('http://localhost/api/holidays?country=us');
      const res = await GET(req);

      expect(res.status).toBe(200);
    });
  });

  describe('year parameter', () => {
    it('uses current year when year param is omitted', async () => {
      vi.mocked(fetchHolidayEvents).mockResolvedValue([]);

      const req = new NextRequest('http://localhost/api/holidays?country=US');
      await GET(req);

      const call = vi.mocked(fetchHolidayEvents).mock.calls[0];
      const currentYear = new Date().getFullYear();
      expect(call[1]).toBe(`${currentYear}-01-01`);
      expect(call[2]).toBe(`${currentYear}-12-31`);
    });

    it('uses provided year parameter', async () => {
      vi.mocked(fetchHolidayEvents).mockResolvedValue([]);

      const req = new NextRequest('http://localhost/api/holidays?country=US&year=2025');
      await GET(req);

      const call = vi.mocked(fetchHolidayEvents).mock.calls[0];
      expect(call[1]).toBe('2025-01-01');
      expect(call[2]).toBe('2025-12-31');
    });

    it('returns 400 for invalid year parameter', async () => {
      const req = new NextRequest('http://localhost/api/holidays?country=US&year=abc');
      const res = await GET(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('year');
    });
  });

  describe('holiday events', () => {
    it('returns holiday events for valid request', async () => {
      const events = [
        { id: 'holiday-US-2026-01-01', title: "New Year's Day", start: '2026-01-01', allDay: true },
      ];
      vi.mocked(fetchHolidayEvents).mockResolvedValue(events as never);

      const req = new NextRequest('http://localhost/api/holidays?country=US&year=2026');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual(events);
    });

    it('returns 500 when fetchHolidayEvents fails', async () => {
      vi.mocked(fetchHolidayEvents).mockRejectedValue(new Error('API down'));

      const req = new NextRequest('http://localhost/api/holidays?country=US&year=2026');
      const res = await GET(req);

      expect(res.status).toBe(500);
    });
  });
});
