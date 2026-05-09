import { describe, it, expect } from 'vitest';
import {
  LOCALES,
  FALLBACK_LOCALE,
  DEFAULT_LOCALE,
  isRegisteredLocale,
} from '@/i18n/manifest';

describe('locale manifest', () => {
  it('registers exactly the v1 set of locales', () => {
    expect(Object.keys(LOCALES).sort()).toEqual(
      ['de-DE', 'en-US', 'es-ES', 'fr-FR', 'nl-NL', 'pt-BR'].sort(),
    );
  });

  it('every entry has a tag, native name, and english name', () => {
    for (const [tag, entry] of Object.entries(LOCALES)) {
      expect(entry.tag).toBe(tag);
      expect(entry.nativeName).toBeTruthy();
      expect(entry.englishName).toBeTruthy();
    }
  });

  it('uses native-language labels (not English) for nativeName', () => {
    expect(LOCALES['de-DE'].nativeName).toBe('Deutsch');
    expect(LOCALES['fr-FR'].nativeName).toBe('Français');
    expect(LOCALES['es-ES'].nativeName).toBe('Español');
    expect(LOCALES['nl-NL'].nativeName).toBe('Nederlands');
    expect(LOCALES['pt-BR'].nativeName).toBe('Português');
  });

  it('FALLBACK_LOCALE is en-US and is registered', () => {
    expect(FALLBACK_LOCALE).toBe('en-US');
    expect(LOCALES[FALLBACK_LOCALE]).toBeDefined();
  });

  it('DEFAULT_LOCALE is en-US and is registered', () => {
    expect(DEFAULT_LOCALE).toBe('en-US');
    expect(LOCALES[DEFAULT_LOCALE]).toBeDefined();
  });

  it('isRegisteredLocale recognises every shipped tag', () => {
    expect(isRegisteredLocale('en-US')).toBe(true);
    expect(isRegisteredLocale('de-DE')).toBe(true);
    expect(isRegisteredLocale('pt-BR')).toBe(true);
  });

  it('isRegisteredLocale rejects unregistered tags', () => {
    expect(isRegisteredLocale('xx-YY')).toBe(false);
    expect(isRegisteredLocale('de-AT')).toBe(false);
    expect(isRegisteredLocale('')).toBe(false);
  });
});
