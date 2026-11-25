import { describe, it, expect } from 'vitest';
import { lookupKey } from '@/i18n/fallback';
import type { Dictionary } from '@/i18n/types';
import { loadDict } from '@/i18n/__tests__/helpers/dict';
import { formatQuickName } from '../shared';

/**
 * A quick timer's name and the wall's "Start a ... timer" read with the
 * right word for one minute and for several, in each family's language:
 * "1 Minute" and "5 Minuten", not "1 Minuten" or the "min" the strings used
 * to fall back on.
 */

function translator(locale: string, ns: 'core' | 'remote' | 'modules') {
  const dict = loadDict(locale, ns) as Dictionary;
  return (key: string, vars?: Record<string, string | number>) => lookupKey(dict, key, vars, locale) ?? key;
}

describe('quick timer names', () => {
  it('reads naturally in English for one minute and for several', () => {
    expect(formatQuickName(60, translator('en-US', 'core'), 'timer')).toBe('1 minute timer');
    expect(formatQuickName(300, translator('en-US', 'remote'), 'timers')).toBe('5 minute timer');
  });

  it('says "1 Minute" and "5 Minuten" in German, on the wall and the phone', () => {
    for (const [ns, prefix] of [['core', 'timer'], ['remote', 'timers']] as const) {
      const t = translator('de-DE', ns);
      expect(formatQuickName(60, t, prefix)).toBe('Timer für 1 Minute');
      expect(formatQuickName(300, t, prefix)).toBe('Timer für 5 Minuten');
    }
  });

  it('says "1 minute" and "5 minutes" in French', () => {
    const t = translator('fr-FR', 'core');
    expect(formatQuickName(60, t, 'timer')).toBe('Minuteur de 1 minute');
    expect(formatQuickName(900, t, 'timer')).toBe('Minuteur de 15 minutes');
  });

  it('says "1 minuut" and "10 minuten" in Dutch', () => {
    const t = translator('nl-NL', 'remote');
    expect(formatQuickName(60, t, 'timers')).toBe('Timer van 1 minuut');
    expect(formatQuickName(600, t, 'timers')).toBe('Timer van 10 minuten');
  });

  it('says "1 seconde" and "30 seconden" in Dutch, on the wall and the phone', () => {
    for (const [ns, prefix] of [['core', 'timer'], ['remote', 'timers']] as const) {
      const t = translator('nl-NL', ns);
      expect(formatQuickName(1, t, prefix)).toBe('Timer van 1 seconde');
      expect(formatQuickName(30, t, prefix)).toBe('Timer van 30 seconden');
    }
  });

  it('leaves the seconds and clock names as they were', () => {
    const t = translator('de-DE', 'core');
    expect(formatQuickName(30, t, 'timer')).toBe('30-Sekunden-Timer');
    expect(formatQuickName(90, t, 'timer')).toBe('1:30-Timer');
  });
});

describe('the Quick Timer box\'s spoken length', () => {
  const start = (locale: string, minutes: number) =>
    translator(locale, 'modules')('quick-timer.startAriaLabel', { count: minutes, minutes });

  it('names one minute and several in English, German and Spanish', () => {
    expect(start('en-US', 1)).toBe('Start a 1 minute timer');
    expect(start('en-US', 10)).toBe('Start a 10 minute timer');
    expect(start('de-DE', 1)).toBe('Timer für 1 Minute starten');
    expect(start('de-DE', 5)).toBe('Timer für 5 Minuten starten');
    expect(start('es-ES', 1)).toBe('Empezar un temporizador de 1 minuto');
    expect(start('es-ES', 15)).toBe('Empezar un temporizador de 15 minutos');
  });

  it('has a form for every length the editor offers, in every language', () => {
    for (const locale of ['en-US', 'da-DK', 'de-DE', 'es-ES', 'fr-FR', 'nl-NL', 'pt-BR']) {
      for (const minutes of [1, 2, 3, 5, 10, 15, 20, 30, 45, 60]) {
        const text = start(locale, minutes);
        expect(text, `${locale} ${minutes}`).toContain(String(minutes));
        expect(text, `${locale} ${minutes}`).not.toBe('quick-timer.startAriaLabel');
      }
    }
  });
});
