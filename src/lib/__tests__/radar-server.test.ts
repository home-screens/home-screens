import { describe, it, expect } from 'vitest';
import { DEFAULT_RADAR_SERVER_URL, normalizeRadarServerUrl, resolveRadarServerUrl } from '@/lib/radar-server';

describe('normalizeRadarServerUrl', () => {
  it('keeps a plain origin as-is', () => {
    expect(normalizeRadarServerUrl('https://api.librewxr.net')).toBe('https://api.librewxr.net');
  });

  it('trims whitespace and trailing slashes', () => {
    expect(normalizeRadarServerUrl('  http://nas.local:8080/  ')).toBe('http://nas.local:8080');
    expect(normalizeRadarServerUrl('http://nas.local:8080///')).toBe('http://nas.local:8080');
  });

  it('keeps a base path a reverse proxy mounts the server under', () => {
    expect(normalizeRadarServerUrl('https://home.example.com/radar/')).toBe('https://home.example.com/radar');
  });

  it('drops query strings and fragments', () => {
    expect(normalizeRadarServerUrl('http://nas.local:8080/?x=1#y')).toBe('http://nas.local:8080');
  });

  it('rejects blanks, bare hostnames and non-http schemes', () => {
    expect(normalizeRadarServerUrl('')).toBeNull();
    expect(normalizeRadarServerUrl('   ')).toBeNull();
    expect(normalizeRadarServerUrl(undefined)).toBeNull();
    expect(normalizeRadarServerUrl('nas.local:8080')).toBeNull();
    expect(normalizeRadarServerUrl('ftp://nas.local')).toBeNull();
    expect(normalizeRadarServerUrl('file:///etc/passwd')).toBeNull();
  });
});

describe('resolveRadarServerUrl', () => {
  it('falls back to the public LibreWXR server', () => {
    expect(resolveRadarServerUrl(undefined)).toBe(DEFAULT_RADAR_SERVER_URL);
    expect(resolveRadarServerUrl('')).toBe(DEFAULT_RADAR_SERVER_URL);
    expect(resolveRadarServerUrl('not a url')).toBe(DEFAULT_RADAR_SERVER_URL);
  });

  it('prefers a usable configured server', () => {
    expect(resolveRadarServerUrl('http://nas.local:8080/')).toBe('http://nas.local:8080');
  });
});
