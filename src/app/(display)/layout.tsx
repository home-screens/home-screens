import type { Metadata, Viewport } from 'next';
import '@/app/globals.css';
import PluginGlobals from '@/components/PluginGlobals';
import { readConfig } from '@/lib/config';
import { I18nProvider, preloadDateLocale } from '@/i18n';
import { DEFAULT_LOCALE } from '@/i18n/manifest';
import { buildLocaleBlob } from '@/i18n/server-blob';

export const metadata: Metadata = {
  title: 'Home Display',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// Reads `data/config.json` to build the inlined locale blob, which is
// mutable at runtime — so the layout must opt out of static pre-rendering
// or the kiosk would ship the wrong locale until the next deploy.
export const dynamic = 'force-dynamic';

/**
 * The display route ships the merged i18n dictionary inline so the first
 * paint resolves every translation without a `/api/i18n` round-trip.
 * That matters here in a way it does not for the editor:
 *
 *   - The display is a kiosk renderer, not an interactive surface — any
 *     post-mount fetch shows up as visible English-then-localized
 *     flicker (FOUC).
 *   - The display is run on a Pi behind a single hub; fetching the same
 *     locale dictionary once per page load on cold cache is wasted I/O.
 *
 * The blob is handed to `<I18nProvider blob={...}>` so the loader cache
 * is hydrated before first render.
 *
 * The date-fns locale is preloaded server-side too, so `formatDateSync`
 * (used by the clock and date views in their tick handlers) renders
 * day/month names in the active locale on the very first paint instead
 * of falling through to en-US until the dynamic import resolves.
 */
export default async function DisplayLayout({ children }: { children: React.ReactNode }) {
  const config = await readConfig().catch(() => null);
  const locale = config?.settings?.locale ?? DEFAULT_LOCALE;
  // formattingLocale falls back to locale (the cascade also lives in
  // <I18nProvider> for client consumers, but the server preload needs
  // the resolved value here so the cache is warm for first paint).
  const formattingLocale = config?.settings?.formattingLocale ?? locale;
  const [blob] = await Promise.all([
    buildLocaleBlob(locale, ['core', 'modules', 'weather']),
    preloadDateLocale(locale),
    formattingLocale === locale ? Promise.resolve() : preloadDateLocale(formattingLocale),
  ]);

  return (
    <I18nProvider locale={locale} formattingLocale={formattingLocale} blob={blob}>
      {/* Inside the provider so `useLocale()` (captured by SDK.translate)
          sees the active locale, not the default — and before {children}
          so its layout effect installs the SDK before plugins load. */}
      <PluginGlobals />
      {children}
    </I18nProvider>
  );
}
