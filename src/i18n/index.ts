/**
 * Public i18n barrel: what components and the plugin host import from
 * `@/i18n`. The loader, manifest and formatter modules are imported directly
 * by the few server and test callers that need their internals.
 */

export { I18nProvider, useTranslate, useLocale, useFormattingLocale } from './provider';
export { dayMonthPattern, dayOfMonthPattern, formatDayRange, fullDateHeading, fullDatePattern, formatDateSync, formatNumber, formatRelativeTime } from './formatters';
export { LOCALES, FALLBACK_LOCALE, DEFAULT_LOCALE } from './manifest';
export { resolveLocaleChain, resolveShippedLocale, lookupKey, tOrFallback } from './fallback';
export { getCachedNamespace, registerPluginNamespace, revalidateLoaderCache } from './loader';
export { BUILT_IN_NAMESPACES } from './types';

export type { Dictionary, Namespace, TranslateFn } from './types';
