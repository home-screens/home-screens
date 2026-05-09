/**
 * Public i18n barrel. Importers should reach for `@/i18n` rather than the
 * individual modules — this keeps the surface area small and gives us a
 * single place to evolve the API.
 */

export { I18nProvider, useTranslate, useLocale, useFormattingLocale, translate } from './provider';
export { formatDate, formatDateSync, formatNumber, formatRelativeTime, preloadDateLocale } from './formatters';
export { LOCALES, FALLBACK_LOCALE, DEFAULT_LOCALE, isRegisteredLocale } from './manifest';
export { pluralCategory } from './plural';
export { resolveLocaleChain, lookupKey } from './fallback';
export { loadNamespace, hydrateFromBlob, getCachedNamespace, registerPluginNamespace } from './loader';
export { BUILT_IN_NAMESPACES } from './types';

export type {
  Locale,
  Dictionary,
  Namespace,
  TranslateFn,
  LocaleManifest,
  LocaleManifestEntry,
} from './types';
export type { PluralCategory } from './plural';
