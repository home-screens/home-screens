import { describe, expect, it } from 'vitest';
import { formatDateSync } from '@/i18n';
import { dateModulePattern } from '../date-module-format';

const SEPT_29 = new Date(2026, 8, 29, 12);
const write = (pattern: string, locale: string) => formatDateSync(SEPT_29, dateModulePattern(pattern, locale), { locale });

describe('dateModulePattern', () => {
  it('leaves English exactly as the presets are stored', () => {
    for (const preset of ['MMMM d', 'EEEE, MMMM d', 'EEE, MMM d', 'MMMM d, yyyy', 'MMM d, yyyy']) {
      expect(dateModulePattern(preset, 'en-US')).toBe(preset);
    }
  });

  it('writes a preset in the order the language writes dates', async () => {
    expect(write('MMMM d', 'de-DE')).toBe('29. September');
    expect(write('MMMM d', 'fr-FR')).toBe('29 septembre');
    expect(write('MMMM d', 'es-ES')).toBe('29 de septiembre');
    expect(write('EEEE, MMMM d', 'de-DE')).toBe('Dienstag, 29. September');
    expect(write('MMMM d, yyyy', 'nl-NL')).toBe('29 september 2026');
  });

  it('uses a pattern typed by hand, and the all-number presets, as they are', () => {
    for (const pattern of ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', "d 'of' MMMM", 'MMMM do']) {
      expect(dateModulePattern(pattern, 'de-DE')).toBe(pattern);
    }
  });
});
