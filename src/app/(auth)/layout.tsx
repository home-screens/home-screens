import type { Metadata } from 'next';
import { readConfig } from '@/lib/config';
import { I18nProvider, preloadDateLocale } from '@/i18n';
import { DEFAULT_LOCALE } from '@/i18n/manifest';

export const metadata: Metadata = {
  title: 'Login — Home Screens',
};

// Reads `data/config.json` for `globalSettings.locale` so the login page
// renders in the active language. Opt out of static prerender — the locale
// changes at runtime.
export const dynamic = 'force-dynamic';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const config = await readConfig().catch(() => null);
  const locale = config?.settings?.locale ?? DEFAULT_LOCALE;
  await preloadDateLocale(locale);

  return (
    <I18nProvider locale={locale} namespaces={['core']}>
      <div className="bg-hs-body text-hs-text-body font-sans antialiased h-screen overflow-hidden">
        {children}
      </div>
    </I18nProvider>
  );
}
