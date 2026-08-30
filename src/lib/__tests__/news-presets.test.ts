import { describe, it, expect } from 'vitest';
import {
  NEWS_CATEGORIES,
  NEWS_PRESETS,
  defaultPresetForLocale,
  findPresetByUrl,
  presetsForLocale,
} from '../news-presets';
import { LOCALES } from '@/i18n/manifest';

const SHIPPED_LOCALES = ['en-US', 'de-DE', 'fr-FR', 'es-ES', 'nl-NL', 'pt-BR', 'da-DK'];

describe('NEWS_PRESETS integrity', () => {
  it('has a unique id for every preset', () => {
    const ids = NEWS_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has a unique URL for every preset', () => {
    const urls = NEWS_PRESETS.map((p) => p.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('every preset has an https URL', () => {
    for (const p of NEWS_PRESETS) {
      expect(p.url, p.id).toMatch(/^https:\/\//);
      expect(() => new URL(p.url), p.id).not.toThrow();
    }
  });

  it('every preset uses a known category', () => {
    for (const p of NEWS_PRESETS) {
      expect(NEWS_CATEGORIES, p.id).toContain(p.category);
    }
  });

  it('every preset belongs to one of the seven shipped locales', () => {
    for (const p of NEWS_PRESETS) {
      expect(SHIPPED_LOCALES, p.id).toContain(p.locale);
    }
  });

  it('the shipped locale list matches the i18n manifest', () => {
    expect(Object.keys(LOCALES).sort()).toEqual([...SHIPPED_LOCALES].sort());
  });

  it('every shipped locale has at least one "top" preset', () => {
    for (const locale of SHIPPED_LOCALES) {
      expect(NEWS_PRESETS.some((p) => p.locale === locale && p.category === 'top'), locale).toBe(true);
    }
  });

  it('every preset has a non-empty publisher name and a slug-like id', () => {
    for (const p of NEWS_PRESETS) {
      expect(p.publisher.trim().length, p.id).toBeGreaterThan(0);
      expect(p.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('the first preset is the BBC top feed the migration and registry default depend on', () => {
    expect(NEWS_PRESETS[0]).toMatchObject({ id: 'bbc-top', url: 'https://feeds.bbci.co.uk/news/rss.xml', locale: 'en-US', category: 'top' });
  });
});

describe('presetsForLocale', () => {
  it('returns only that locale\'s presets when it has some', () => {
    const de = presetsForLocale('de-DE');
    expect(de.length).toBeGreaterThan(0);
    expect(de.every((p) => p.locale === 'de-DE')).toBe(true);
  });

  it('matches by language so regional variants share presets', () => {
    expect(presetsForLocale('de-AT')).toEqual(presetsForLocale('de-DE'));
    expect(presetsForLocale('pt')).toEqual(presetsForLocale('pt-BR'));
  });

  it('falls back to en-US for an unknown locale or undefined', () => {
    const en = NEWS_PRESETS.filter((p) => p.locale === 'en-US');
    expect(presetsForLocale('xx-YY')).toEqual(en);
    expect(presetsForLocale(undefined)).toEqual(en);
  });
});

describe('defaultPresetForLocale', () => {
  it('picks a German top preset for de-DE', () => {
    const p = defaultPresetForLocale('de-DE');
    expect(p.locale).toBe('de-DE');
    expect(p.category).toBe('top');
  });

  it('picks the first top preset of each shipped locale', () => {
    for (const locale of SHIPPED_LOCALES) {
      const p = defaultPresetForLocale(locale);
      expect(p.locale, locale).toBe(locale);
      expect(p.category, locale).toBe('top');
    }
  });

  it('falls back to the BBC preset for unknown locales and undefined', () => {
    expect(defaultPresetForLocale('xx-YY').id).toBe('bbc-top');
    expect(defaultPresetForLocale(undefined).id).toBe('bbc-top');
  });
});

describe('findPresetByUrl', () => {
  it('finds a preset by its exact URL', () => {
    expect(findPresetByUrl('https://feeds.bbci.co.uk/news/rss.xml')?.id).toBe('bbc-top');
  });

  it('returns undefined for URLs that are not presets', () => {
    expect(findPresetByUrl('https://example.com/rss')).toBeUndefined();
    expect(findPresetByUrl('https://feeds.bbci.co.uk/news/rss.xml/')).toBeUndefined();
  });
});
