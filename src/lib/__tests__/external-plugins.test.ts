import { describe, it, expect } from 'vitest';
import { resolveTarballUrl, validateExternalUrl } from '@/lib/external-plugins';

describe('resolveTarballUrl', () => {
  it('passes through a literal URL unchanged', () => {
    expect(resolveTarballUrl('https://example.com/p.tar.gz', undefined))
      .toBe('https://example.com/p.tar.gz');
  });

  it('substitutes a single {version} placeholder', () => {
    expect(resolveTarballUrl('https://x.io/v{version}/p.tar.gz', '1.2.3'))
      .toBe('https://x.io/v1.2.3/p.tar.gz');
  });

  it('substitutes multiple {version} occurrences', () => {
    expect(resolveTarballUrl('https://x.io/{version}/p-{version}.tar.gz', '2.0.0'))
      .toBe('https://x.io/2.0.0/p-2.0.0.tar.gz');
  });

  it('throws when {version} is present but version is undefined', () => {
    expect(() => resolveTarballUrl('https://x.io/v{version}/p.tar.gz', undefined))
      .toThrow(/version/i);
  });

  it('throws when {version} is present but version is empty string', () => {
    expect(() => resolveTarballUrl('https://x.io/v{version}/p.tar.gz', ''))
      .toThrow(/version/i);
  });

  it('ignores version when no placeholder is present', () => {
    expect(resolveTarballUrl('https://x.io/latest/p.tar.gz', '1.0.0'))
      .toBe('https://x.io/latest/p.tar.gz');
  });
});

describe('validateExternalUrl', () => {
  it('accepts https URLs', () => {
    expect(() => validateExternalUrl('https://example.com/p.tar.gz')).not.toThrow();
  });

  it('accepts templated https URLs (placeholder intact)', () => {
    expect(() => validateExternalUrl('https://x.io/v{version}/p.tar.gz')).not.toThrow();
  });

  it('accepts http://localhost for local testing', () => {
    expect(() => validateExternalUrl('http://localhost:5173/p.tar.gz')).not.toThrow();
    expect(() => validateExternalUrl('http://localhost/p.tar.gz')).not.toThrow();
  });

  it('accepts http://127.0.0.1 for local testing', () => {
    expect(() => validateExternalUrl('http://127.0.0.1:8080/p.tar.gz')).not.toThrow();
  });

  it('rejects non-localhost http URLs', () => {
    expect(() => validateExternalUrl('http://example.com/p.tar.gz')).toThrow(/HTTPS/);
  });

  it('rejects localhost-prefix subdomain attack URLs', () => {
    expect(() => validateExternalUrl('http://localhost.evil.com/p.tar.gz')).toThrow(/HTTPS/);
  });

  it('rejects file:// URLs', () => {
    expect(() => validateExternalUrl('file:///etc/passwd')).toThrow(/HTTPS/);
  });

  it('rejects empty or junk input', () => {
    expect(() => validateExternalUrl('')).toThrow();
    expect(() => validateExternalUrl('not a url')).toThrow();
  });
});
