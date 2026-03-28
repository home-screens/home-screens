import { describe, it, expect } from 'vitest';
import { validateSandbox, validateIframeUrl } from '../iframe-validation';

describe('validateSandbox', () => {
  it('accepts valid tokens', () => {
    const result = validateSandbox('allow-scripts allow-forms');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('allow-scripts allow-forms');
    expect(result.unknownTokens).toEqual([]);
    expect(result.dangerousCombination).toBe(false);
  });

  it('accepts an empty string (maximum restriction)', () => {
    const result = validateSandbox('');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('');
    expect(result.unknownTokens).toEqual([]);
  });

  it('detects dangerous allow-same-origin + allow-scripts combination', () => {
    const result = validateSandbox('allow-scripts allow-same-origin');
    expect(result.valid).toBe(false);
    expect(result.dangerousCombination).toBe(true);
    // The tokens themselves are valid, so sanitized should contain them
    expect(result.sanitized).toContain('allow-scripts');
    expect(result.sanitized).toContain('allow-same-origin');
  });

  it('detects the dangerous combination even with other tokens mixed in', () => {
    const result = validateSandbox('allow-forms allow-same-origin allow-popups allow-scripts');
    expect(result.valid).toBe(false);
    expect(result.dangerousCombination).toBe(true);
  });

  it('reports unknown tokens', () => {
    const result = validateSandbox('allow-scripts allow-evil allow-forms');
    expect(result.valid).toBe(false);
    expect(result.unknownTokens).toEqual(['allow-evil']);
    expect(result.sanitized).toBe('allow-scripts allow-forms');
  });

  it('deduplicates tokens', () => {
    const result = validateSandbox('allow-scripts allow-scripts allow-forms');
    expect(result.sanitized).toBe('allow-scripts allow-forms');
  });

  it('handles extra whitespace', () => {
    const result = validateSandbox('  allow-scripts   allow-forms  ');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('allow-scripts allow-forms');
  });

  it('is case-insensitive', () => {
    const result = validateSandbox('Allow-Scripts ALLOW-FORMS');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('allow-scripts allow-forms');
  });

  it('accepts all valid sandbox tokens', () => {
    const allTokens = [
      'allow-downloads', 'allow-forms', 'allow-modals', 'allow-orientation-lock',
      'allow-pointer-lock', 'allow-popups', 'allow-popups-to-escape-sandbox',
      'allow-presentation', 'allow-same-origin', 'allow-scripts',
      'allow-top-navigation', 'allow-top-navigation-by-user-activation',
      'allow-top-navigation-to-custom-protocols',
    ];
    // Test each individually (skip combo of allow-same-origin + allow-scripts)
    for (const token of allTokens) {
      const result = validateSandbox(token);
      expect(result.unknownTokens).toEqual([]);
    }
  });
});

describe('validateIframeUrl', () => {
  it('returns null for valid https URLs', () => {
    expect(validateIframeUrl('https://example.com')).toBeNull();
    expect(validateIframeUrl('https://homeassistant.local:8123')).toBeNull();
  });

  it('returns null for valid http URLs', () => {
    expect(validateIframeUrl('http://192.168.1.100:8080/dashboard')).toBeNull();
  });

  it('returns null for empty URLs', () => {
    expect(validateIframeUrl('')).toBeNull();
  });

  it('blocks javascript: protocol', () => {
    const result = validateIframeUrl('javascript:alert(1)');
    expect(result).not.toBeNull();
    expect(result).toContain('javascript:');
  });

  it('blocks data: protocol', () => {
    const result = validateIframeUrl('data:text/html,<h1>hi</h1>');
    expect(result).not.toBeNull();
    expect(result).toContain('data:');
  });

  it('blocks vbscript: protocol', () => {
    const result = validateIframeUrl('vbscript:MsgBox("hi")');
    expect(result).not.toBeNull();
    expect(result).toContain('vbscript:');
  });

  it('blocks blob: protocol', () => {
    const result = validateIframeUrl('blob:https://example.com/123');
    expect(result).not.toBeNull();
    expect(result).toContain('blob:');
  });

  it('is case-insensitive for protocol detection', () => {
    expect(validateIframeUrl('JAVASCRIPT:alert(1)')).not.toBeNull();
    expect(validateIframeUrl('Data:text/html,test')).not.toBeNull();
  });

  it('handles leading whitespace in malicious URLs', () => {
    expect(validateIframeUrl('  javascript:alert(1)')).not.toBeNull();
  });
});
