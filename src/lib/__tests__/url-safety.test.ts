import { describe, it, expect } from 'vitest';
import { isBlockedHost, isSafeExternalUrl } from '@/lib/url-safety';

describe('isBlockedHost', () => {
  it('blocks localhost', () => {
    expect(isBlockedHost('localhost')).toBe(true);
  });

  it('blocks 0.0.0.0', () => {
    expect(isBlockedHost('0.0.0.0')).toBe(true);
  });

  it('blocks IPv6 addresses (bracketed)', () => {
    expect(isBlockedHost('[::1]')).toBe(true);
    expect(isBlockedHost('[::ffff:127.0.0.1]')).toBe(true);
    expect(isBlockedHost('[fe80::1]')).toBe(true);
  });

  it('blocks 127.0.0.0/8 loopback', () => {
    expect(isBlockedHost('127.0.0.1')).toBe(true);
    expect(isBlockedHost('127.255.255.255')).toBe(true);
  });

  it('blocks 10.0.0.0/8 private', () => {
    expect(isBlockedHost('10.0.0.1')).toBe(true);
    expect(isBlockedHost('10.255.255.255')).toBe(true);
  });

  it('blocks 172.16.0.0/12 private', () => {
    expect(isBlockedHost('172.16.0.1')).toBe(true);
    expect(isBlockedHost('172.31.255.255')).toBe(true);
  });

  it('does not block 172 outside /12 range', () => {
    expect(isBlockedHost('172.15.0.1')).toBe(false);
    expect(isBlockedHost('172.32.0.1')).toBe(false);
  });

  it('blocks 192.168.0.0/16 private', () => {
    expect(isBlockedHost('192.168.0.1')).toBe(true);
    expect(isBlockedHost('192.168.255.255')).toBe(true);
  });

  it('blocks full 169.254.0.0/16 link-local range', () => {
    expect(isBlockedHost('169.254.169.254')).toBe(true); // AWS/GCP metadata
    expect(isBlockedHost('169.254.170.2')).toBe(true);   // ECS task metadata
    expect(isBlockedHost('169.254.0.1')).toBe(true);     // link-local gateway
  });

  it('allows public IPs', () => {
    expect(isBlockedHost('8.8.8.8')).toBe(false);
    expect(isBlockedHost('1.1.1.1')).toBe(false);
    expect(isBlockedHost('203.0.113.1')).toBe(false);
  });

  it('allows public hostnames', () => {
    expect(isBlockedHost('api.example.com')).toBe(false);
    expect(isBlockedHost('images.unsplash.com')).toBe(false);
  });
});

describe('isSafeExternalUrl', () => {
  it('allows https URLs to public hosts', () => {
    expect(isSafeExternalUrl('https://api.example.com/data')).toBe(true);
    expect(isSafeExternalUrl('https://images.unsplash.com/photo-123')).toBe(true);
  });

  it('allows http URLs to public hosts', () => {
    expect(isSafeExternalUrl('http://api.example.com/data')).toBe(true);
  });

  it('blocks non-http protocols', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('ftp://example.com/file')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('blocks private/internal hosts', () => {
    expect(isSafeExternalUrl('http://localhost:3000/api/config')).toBe(false);
    expect(isSafeExternalUrl('http://127.0.0.1/admin')).toBe(false);
    expect(isSafeExternalUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSafeExternalUrl('http://10.0.0.1/internal')).toBe(false);
    expect(isSafeExternalUrl('http://192.168.1.1/config')).toBe(false);
  });

  it('returns false for malformed URLs', () => {
    expect(isSafeExternalUrl('')).toBe(false);
    expect(isSafeExternalUrl('not-a-url')).toBe(false);
    expect(isSafeExternalUrl('://missing-scheme')).toBe(false);
  });
});
