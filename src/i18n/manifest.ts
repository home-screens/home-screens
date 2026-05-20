/**
 * Registry of locales shipped with Home Screens v1.
 *
 * Adding a locale here is the only source-of-truth change required for the
 * runtime to recognize it; the `validate-config` warning, the API route's
 * fallback chain, and the `<I18nProvider>` all consult this manifest.
 */

import type { LocaleManifest } from './types';

export const LOCALES: LocaleManifest = {
  'en-US': { tag: 'en-US', nativeName: 'English', englishName: 'English (United States)' },
  'de-DE': { tag: 'de-DE', nativeName: 'Deutsch', englishName: 'German (Germany)' },
  'fr-FR': { tag: 'fr-FR', nativeName: 'Français', englishName: 'French (France)' },
  'es-ES': { tag: 'es-ES', nativeName: 'Español', englishName: 'Spanish (Spain)' },
  'nl-NL': { tag: 'nl-NL', nativeName: 'Nederlands', englishName: 'Dutch (Netherlands)' },
  'pt-BR': { tag: 'pt-BR', nativeName: 'Português', englishName: 'Portuguese (Brazil)' },
  'da-DK': { tag: 'da-DK', nativeName: 'Dansk', englishName: 'Danish (Denmark)' },
};

/** Locale used when a key isn't found in the active locale or its language fallback. */
export const FALLBACK_LOCALE = 'en-US';

/** Locale used when the config doesn't specify one. */
export const DEFAULT_LOCALE = 'en-US';

/** Convenience predicate — is this BCP-47 tag a registered locale? */
export function isRegisteredLocale(tag: string): boolean {
  return Object.prototype.hasOwnProperty.call(LOCALES, tag);
}
