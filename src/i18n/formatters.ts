/**
 * Locale-aware date / number / relative-time formatters.
 *
 * date-fns drives `formatDate`, with locales lazy-loaded from
 * `date-fns/locale/<tag>` and cached in a Map. `formatNumber` and
 * `formatRelativeTime` use `Intl.NumberFormat` / `Intl.RelativeTimeFormat`
 * directly — no locale data ships with the bundle.
 *
 * `formatDateSync` exists for hot paths where awaiting a dynamic import is
 * not feasible (the clock module's tick handler, for example). It uses the
 * en-US default if the locale's date-fns bundle hasn't been loaded yet —
 * production code should call `preloadDateLocale(tag)` once at provider
 * mount to warm the cache.
 */

import { format as dfFormat } from 'date-fns';
import type { Locale as DateFnsLocale } from 'date-fns';
import { logger } from '@/lib/logger';

const log = logger('i18n');

interface DateFormatOpts {
  locale: string;
}

interface NumberFormatOpts extends Intl.NumberFormatOptions {
  locale: string;
}

interface RelativeTimeOpts {
  locale: string;
  numeric?: 'always' | 'auto';
}

const LOCALE_CACHE = new Map<string, DateFnsLocale>();
const LOCALE_PENDING = new Map<string, Promise<DateFnsLocale>>();

/**
 * date-fns publishes locales as separate entry points (e.g.
 * `date-fns/locale/de`) that export a single named binding. The binding
 * names are camel-cased (`enUS`, `ptBR`, `de`, `fr`…), so we read the
 * matching property out of the namespace object after `await import()`.
 *
 * Vite/Next can't statically analyze a fully dynamic `import()` argument,
 * but an explicit switch keeps each path tree-shakable and lets the
 * bundler emit one chunk per locale.
 */
async function importDateFnsLocale(tag: string): Promise<DateFnsLocale> {
  switch (tag) {
    case 'en-US': {
      const m = await import('date-fns/locale/en-US');
      return m.enUS;
    }
    case 'de':
    case 'de-DE': {
      const m = await import('date-fns/locale/de');
      return m.de;
    }
    case 'fr':
    case 'fr-FR': {
      const m = await import('date-fns/locale/fr');
      return m.fr;
    }
    case 'es':
    case 'es-ES': {
      const m = await import('date-fns/locale/es');
      return m.es;
    }
    case 'nl':
    case 'nl-NL': {
      const m = await import('date-fns/locale/nl');
      return m.nl;
    }
    case 'pt-BR': {
      const m = await import('date-fns/locale/pt-BR');
      return m.ptBR;
    }
    case 'da':
    case 'da-DK': {
      const m = await import('date-fns/locale/da');
      return m.da;
    }
    default: {
      const m = await import('date-fns/locale/en-US');
      return m.enUS;
    }
  }
}

/**
 * Lazily load and cache the date-fns locale object for `tag`.
 * Concurrent calls for the same tag share a single in-flight import.
 */
export async function preloadDateLocale(tag: string): Promise<DateFnsLocale> {
  const cached = LOCALE_CACHE.get(tag);
  if (cached) return cached;

  const pending = LOCALE_PENDING.get(tag);
  if (pending) return pending;

  const promise = importDateFnsLocale(tag).then((locale) => {
    LOCALE_CACHE.set(tag, locale);
    LOCALE_PENDING.delete(tag);
    return locale;
  }).catch((err) => {
    LOCALE_PENDING.delete(tag);
    throw err;
  });

  LOCALE_PENDING.set(tag, promise);
  return promise;
}

/**
 * Return the cached date-fns locale for `tag`, or `undefined` if it hasn't
 * been preloaded. `formatDateSync` consults this before falling back to en-US.
 */
function getCachedDateLocale(tag: string): DateFnsLocale | undefined {
  return LOCALE_CACHE.get(tag);
}

/**
 * Format `date` against `pattern` using the locale-specific date-fns bundle.
 * Awaits the dynamic locale import on first use; subsequent calls are
 * synchronous-fast (just a Map hit + the date-fns format call).
 */
export async function formatDate(
  date: Date | number,
  pattern: string,
  opts: DateFormatOpts,
): Promise<string> {
  const locale = await preloadDateLocale(opts.locale);
  return dfFormat(date, pattern, { locale });
}

// Warn-once-per-locale latch for formatDateSync cache misses. Same
// pattern as the provider's missing-key warning so a hot tick loop
// doesn't drown the dev console.
const SYNC_CACHE_MISS_WARNINGS = new Set<string>();

/**
 * Synchronous variant of `formatDate`. If the requested locale isn't loaded
 * yet, the en-US default is used (which is statically imported by date-fns).
 *
 * Use this on render-hot paths where awaiting an import would tear the UI;
 * call `preloadDateLocale` once at provider mount so the cache is warm
 * before the first tick.
 *
 * In dev mode, warns once per locale when the cache is missed so callers
 * notice when they forgot to preload the locale.
 */
export function formatDateSync(
  date: Date | number,
  pattern: string,
  opts: DateFormatOpts,
): string {
  const locale = getCachedDateLocale(opts.locale);
  if (locale) {
    return dfFormat(date, pattern, { locale });
  }
  if (process.env.NODE_ENV === 'development' && !SYNC_CACHE_MISS_WARNINGS.has(opts.locale)) {
    SYNC_CACHE_MISS_WARNINGS.add(opts.locale);
    log.warn(
      `formatDateSync: locale "${opts.locale}" not preloaded; ` +
        `falling back to en-US. Call preloadDateLocale("${opts.locale}") at startup.`,
    );
  }
  return dfFormat(date, pattern);
}

/**
 * Locale-aware number formatting. Forwards every Intl.NumberFormatOptions
 * field through, so callers can do `{ style: 'currency', currency: 'EUR' }`
 * etc. without the helper getting in the way.
 */
export function formatNumber(n: number, opts: NumberFormatOpts): string {
  const { locale, ...rest } = opts;
  return new Intl.NumberFormat(locale, rest).format(n);
}

/**
 * Render a relative time difference (`from` → `to`) — "in 2 days", "5 hours
 * ago", etc. Picks the largest unit that fits, mirroring how MDN's example
 * works. Defaults to `numeric: 'auto'` so en-US shows "yesterday" instead of
 * "1 day ago".
 */
export function formatRelativeTime(
  from: Date | number,
  to: Date | number,
  opts: RelativeTimeOpts,
): string {
  const fromMs = typeof from === 'number' ? from : from.getTime();
  const toMs = typeof to === 'number' ? to : to.getTime();
  const deltaSec = Math.round((toMs - fromMs) / 1000);

  const rtf = new Intl.RelativeTimeFormat(opts.locale, { numeric: opts.numeric ?? 'auto' });
  const abs = Math.abs(deltaSec);

  // Threshold table — picks the largest sensible unit. Numbers come from
  // average lengths so "in 30 days" rolls over to "next month" cleanly.
  const sec = 1;
  const min = 60;
  const hour = 60 * min;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (abs < min) return rtf.format(Math.round(deltaSec / sec), 'second');
  if (abs < hour) return rtf.format(Math.round(deltaSec / min), 'minute');
  if (abs < day) return rtf.format(Math.round(deltaSec / hour), 'hour');
  if (abs < week) return rtf.format(Math.round(deltaSec / day), 'day');
  if (abs < month) return rtf.format(Math.round(deltaSec / week), 'week');
  if (abs < year) return rtf.format(Math.round(deltaSec / month), 'month');
  return rtf.format(Math.round(deltaSec / year), 'year');
}

/** @internal — for tests. Reset the date-fns locale cache. */
export function __resetFormatterLocaleCacheForTests(): void {
  LOCALE_CACHE.clear();
  LOCALE_PENDING.clear();
  SYNC_CACHE_MISS_WARNINGS.clear();
}
