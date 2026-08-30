import type { Metadata } from 'next';
import { readConfig } from '@/lib/config';
import { I18nProvider, preloadDateLocale } from '@/i18n';
import { buildLocaleBlob } from '@/i18n/server-blob';
import { DEFAULT_LOCALE } from '@/i18n/manifest';

export const metadata: Metadata = {
  title: 'Login — Home Screens',
};

// Reads `data/config.json` for `config.settings.locale` so the login page
// renders in the active language. Opt out of static prerender — the locale
// changes at runtime.
export const dynamic = 'force-dynamic';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const config = await readConfig().catch(() => null);
  const locale = config?.settings?.locale ?? DEFAULT_LOCALE;
  // Inline the dictionary rather than letting the provider fetch it after
  // mount. `translate()` returns the key itself on a miss, and while the
  // login page is checking auth its entire content is one string — so a
  // post-mount fetch renders a blank screen with the literal
  // `login.checkingAuth` centered on it until the request lands. There is no
  // surrounding chrome to hide it behind, and the wait is longest on the Pi.
  // Built in parallel with the date-fns preload — independent disk reads.
  const [blob] = await Promise.all([
    buildLocaleBlob(locale, ['core']),
    preloadDateLocale(locale),
  ]);

  return (
    <I18nProvider locale={locale} blob={blob}>
      <div className="bg-hs-body text-hs-text-body font-sans antialiased h-screen overflow-hidden">
        {children}
      </div>
    </I18nProvider>
  );
}
