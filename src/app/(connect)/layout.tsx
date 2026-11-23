import type { Metadata } from 'next';
import { readConfig } from '@/lib/config';
import { I18nProvider } from '@/i18n';
import { buildLocaleBlob } from '@/i18n/server-blob';
import { DEFAULT_LOCALE } from '@/i18n/manifest';
import { PRODUCT_NAME } from '@/lib/page-title';

export const metadata: Metadata = {
  title: PRODUCT_NAME,
};

// Reads `data/config.json` for the active locale, which changes at runtime.
export const dynamic = 'force-dynamic';

/**
 * Pages a sign-in elsewhere sends people back to, under /editor so the
 * editor login guards them. Kept out of the editor's own layout: that one
 * loads plugins and the editor's reminder toasts, none of which belongs on a
 * page whose only job is to say the sign-in worked and let the tab close.
 */
export default async function ConnectLayout({ children }: { children: React.ReactNode }) {
  const config = await readConfig().catch(() => null);
  const locale = config?.settings?.locale ?? DEFAULT_LOCALE;
  // Inlined so the first paint is already translated: the page is one short
  // message, with nothing around it to hide raw keys behind.
  const blob = await buildLocaleBlob(locale, ['core', 'editor']);

  return (
    <I18nProvider locale={locale} blob={blob}>
      <div className="bg-hs-body text-hs-text-body font-sans antialiased h-screen overflow-hidden">
        {children}
      </div>
    </I18nProvider>
  );
}
