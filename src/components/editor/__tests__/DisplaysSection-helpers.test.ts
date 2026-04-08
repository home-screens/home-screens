import { describe, it, expect } from 'vitest';
import {
  formatClientAddress,
  collapseReports,
  type ViewportReport,
} from '@/components/editor/settings/DisplaysIndexPage';

/* ─── formatClientAddress ─────────────────────── */

describe('formatClientAddress', () => {
  it('returns null for nullish or empty input', () => {
    expect(formatClientAddress(null)).toBeNull();
    expect(formatClientAddress(undefined)).toBeNull();
    expect(formatClientAddress('')).toBeNull();
    expect(formatClientAddress('   ')).toBeNull();
  });

  it('normalizes IPv6 loopback to "localhost"', () => {
    expect(formatClientAddress('::1')).toBe('localhost');
  });

  it('normalizes IPv4 loopback to "localhost"', () => {
    expect(formatClientAddress('127.0.0.1')).toBe('localhost');
  });

  it('passes "localhost" through unchanged', () => {
    expect(formatClientAddress('localhost')).toBe('localhost');
  });

  it('strips the IPv4-mapped-IPv6 prefix', () => {
    expect(formatClientAddress('::ffff:192.168.86.187')).toBe('192.168.86.187');
    // Mixed case is still stripped
    expect(formatClientAddress('::FFFF:10.0.0.5')).toBe('10.0.0.5');
  });

  it('passes plain IPv4 addresses through', () => {
    expect(formatClientAddress('192.168.1.42')).toBe('192.168.1.42');
  });

  it('passes plain IPv6 addresses through', () => {
    expect(formatClientAddress('2001:db8::1')).toBe('2001:db8::1');
  });

  it('trims surrounding whitespace', () => {
    expect(formatClientAddress('  192.168.1.42  ')).toBe('192.168.1.42');
  });
});

/* ─── collapseReports ─────────────────────────── */

function report(
  width: number,
  height: number,
  lastSeen: number,
  clientAddress?: string,
): ViewportReport {
  return { width, height, lastSeen, ...(clientAddress ? { clientAddress } : {}) };
}

describe('collapseReports', () => {
  it('returns an empty array for no reports', () => {
    expect(collapseReports([])).toEqual([]);
  });

  it('passes single-entry reports through unchanged (count = 1)', () => {
    const reports = [report(1920, 1080, 100, '192.168.1.10')];
    const collapsed = collapseReports(reports);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]).toMatchObject({
      width: 1920,
      height: 1080,
      lastSeen: 100,
      clientAddress: '192.168.1.10',
      count: 1,
    });
  });

  it('collapses two reports from the same IP at the same viewport', () => {
    // Two chromium tabs at the same URL on the same hub.
    const reports = [
      report(1440, 2560, 100, '192.168.1.10'),
      report(1440, 2560, 200, '192.168.1.10'),
    ];
    const collapsed = collapseReports(reports);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]).toMatchObject({ width: 1440, height: 2560, count: 2 });
    // Most recent lastSeen wins
    expect(collapsed[0].lastSeen).toBe(200);
  });

  it('collapses `::1` and `127.0.0.1` into one row (they normalize to the same localhost key)', () => {
    const reports = [
      report(1440, 2560, 100, '::1'),
      report(1440, 2560, 150, '127.0.0.1'),
    ];
    const collapsed = collapseReports(reports);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].count).toBe(2);
    expect(collapsed[0].lastSeen).toBe(150);
  });

  it('collapses `::ffff:192.168.1.10` and `192.168.1.10` into one row', () => {
    const reports = [
      report(1440, 2560, 100, '::ffff:192.168.1.10'),
      report(1440, 2560, 150, '192.168.1.10'),
    ];
    const collapsed = collapseReports(reports);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].count).toBe(2);
  });

  it('keeps distinct viewports from the same IP as separate rows', () => {
    const reports = [
      report(1440, 2560, 100, '192.168.1.10'),
      report(1080, 1920, 200, '192.168.1.10'),
    ];
    const collapsed = collapseReports(reports);
    expect(collapsed).toHaveLength(2);
    expect(collapsed.map((r) => `${r.width}x${r.height}`).sort()).toEqual([
      '1080x1920',
      '1440x2560',
    ]);
  });

  it('keeps identical viewports from different IPs as separate rows', () => {
    // Two physical displays at the same resolution but on different devices
    // stay as two rows so the user can see them distinctly.
    const reports = [
      report(1440, 2560, 100, '192.168.1.10'),
      report(1440, 2560, 150, '192.168.1.20'),
    ];
    const collapsed = collapseReports(reports);
    expect(collapsed).toHaveLength(2);
    expect(collapsed.map((r) => r.clientAddress).sort()).toEqual([
      '192.168.1.10',
      '192.168.1.20',
    ]);
  });

  it('sorts rows most-recent-first', () => {
    const reports = [
      report(1920, 1080, 100, '192.168.1.10'),
      report(1080, 1920, 500, '192.168.1.20'),
      report(2560, 1440, 300, '192.168.1.30'),
    ];
    const collapsed = collapseReports(reports);
    expect(collapsed.map((r) => r.lastSeen)).toEqual([500, 300, 100]);
  });

  it('handles reports with no clientAddress (treats missing as "") — still dedups by dims', () => {
    const reports = [
      report(1920, 1080, 100),
      report(1920, 1080, 200),
    ];
    const collapsed = collapseReports(reports);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].count).toBe(2);
  });

  it('does not collapse a report with a clientAddress against one without', () => {
    const reports = [
      report(1920, 1080, 100),
      report(1920, 1080, 200, '192.168.1.10'),
    ];
    const collapsed = collapseReports(reports);
    expect(collapsed).toHaveLength(2);
  });
});
