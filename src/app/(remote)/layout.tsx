import type { Metadata, Viewport } from 'next';
import '@/app/globals.css';
import { readConfig } from '@/lib/config';
import { I18nProvider, preloadDateLocale } from '@/i18n';
import { DEFAULT_LOCALE } from '@/i18n/manifest';

export const metadata: Metadata = {
  title: 'Remote Control',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// Reads `data/config.json` to pick up the current `config.settings.locale`,
// which is mutable at runtime — so the layout must opt out of static
// pre-rendering or a build-time snapshot would freeze the locale until
// the next deploy.
export const dynamic = 'force-dynamic';

export default async function RemoteLayout({ children }: { children: React.ReactNode }) {
  const config = await readConfig().catch(() => null);
  const locale = config?.settings?.locale ?? DEFAULT_LOCALE;
  // formattingLocale falls back to locale (cascade also lives in
  // <I18nProvider>; we resolve it here so the server-side preload
  // covers both tags before first paint).
  const formattingLocale = config?.settings?.formattingLocale ?? locale;
  // Preload the date-fns locale(s) server-side so `formatDateSync` (used
  // on hot tick paths) renders day/month names in the active locale on
  // first paint instead of falling through to en-US.
  await Promise.all([
    preloadDateLocale(locale),
    formattingLocale === locale ? Promise.resolve() : preloadDateLocale(formattingLocale),
  ]);

  return (
    <I18nProvider
      locale={locale}
      formattingLocale={formattingLocale}
      namespaces={['core', 'modules', 'remote']}
    >
      {children}
    </I18nProvider>
  );
}
