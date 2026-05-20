import type { Metadata } from 'next';
import ConfirmModal from '@/components/ui/ConfirmModal';
import PluginGlobalsEditor from '@/components/PluginGlobalsEditor';
import BackupReminderToast from '@/components/editor/BackupReminderToast';
import UpdateAvailableToast from '@/components/editor/UpdateAvailableToast';
import { readConfig } from '@/lib/config';
import { I18nProvider, preloadDateLocale } from '@/i18n';
import { DEFAULT_LOCALE } from '@/i18n/manifest';
import { buildLocaleBlob } from '@/i18n/server-blob';

export const metadata: Metadata = {
  title: 'Home Screen Editor',
};

// Reads `data/config.json` to pick up the current `globalSettings.locale`,
// which is mutable at runtime — so the layout must opt out of static
// pre-rendering or a build-time snapshot would freeze the locale until the
// next deploy.
export const dynamic = 'force-dynamic';

/**
 * Server component that reads `data/config.json` once per request to
 * pick up the active locale and inlines the editor's translation
 * dictionaries as a blob. The blob hydrates the loader cache before
 * first render so the initial paint resolves every `t(...)` call
 * synchronously — without it, the editor briefly flashes raw dotted
 * keys (`settings.sidebar.navLabels.calendar`) while the post-mount
 * `/api/i18n/<locale>` round-trip is in flight.
 *
 * The blob covers the same namespaces the editor surface consumes
 * (core / modules / editor / weather), matching the display route's
 * pattern but tuned to the editor's wider namespace set.
 */
export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  const config = await readConfig().catch(() => null);
  const locale = config?.settings?.locale ?? DEFAULT_LOCALE;
  // formattingLocale falls back to locale (cascade also lives in
  // <I18nProvider>; we resolve it here so the server-side preload
  // covers both tags before first paint).
  const formattingLocale = config?.settings?.formattingLocale ?? locale;
  // Preload the date-fns locale(s) server-side so `formatDateSync` (used
  // on hot tick paths) renders day/month names in the active locale on
  // first paint instead of falling through to en-US. Built in parallel
  // with the dictionary blob — they're independent disk reads.
  const [blob] = await Promise.all([
    buildLocaleBlob(locale, ['core', 'modules', 'editor', 'weather']),
    preloadDateLocale(locale),
    formattingLocale === locale ? Promise.resolve() : preloadDateLocale(formattingLocale),
  ]);

  return (
    <I18nProvider
      locale={locale}
      formattingLocale={formattingLocale}
      blob={blob}
    >
      <div className="bg-hs-body text-hs-text-primary font-sans antialiased h-screen overflow-hidden">
        <PluginGlobalsEditor />
        {children}
        <ConfirmModal />
        <BackupReminderToast />
        <UpdateAvailableToast />
      </div>
    </I18nProvider>
  );
}
