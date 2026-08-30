import type { Metadata, Viewport } from 'next';
import '@/app/globals.css';
import { readConfig } from '@/lib/config';
import { I18nProvider, preloadDateLocale } from '@/i18n';
import { buildLocaleBlob } from '@/i18n/server-blob';
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
  // Inline the dictionaries rather than letting the provider fetch them after
  // mount. `translate()` returns the key itself on a miss, so a post-mount
  // fetch renders the whole surface as raw keys until it lands. That covers
  // /chores too — it shares this layout — which is the one that matters most:
  // a kid reading `chores.markDone` has no way to know it is a loading state.
  // ~48 KB for the three namespaces, against the 188 KB the editor layout
  // already inlines.
  //
  // Built in parallel with the date-fns preload, which keeps `formatDateSync`
  // (used on hot tick paths) in the active locale on first paint instead of
  // falling through to en-US.
  const [blob] = await Promise.all([
    buildLocaleBlob(locale, ['core', 'modules', 'remote']),
    preloadDateLocale(locale),
    formattingLocale === locale ? Promise.resolve() : preloadDateLocale(formattingLocale),
  ]);

  return (
    <I18nProvider
      locale={locale}
      formattingLocale={formattingLocale}
      blob={blob}
    >
      {children}
    </I18nProvider>
  );
}
