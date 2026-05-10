import type { Metadata } from 'next';
import ConfirmModal from '@/components/ui/ConfirmModal';
import PluginGlobalsEditor from '@/components/PluginGlobalsEditor';
import BackupReminderToast from '@/components/editor/BackupReminderToast';
import { readConfig } from '@/lib/config';
import { I18nProvider, preloadDateLocale } from '@/i18n';
import { DEFAULT_LOCALE } from '@/i18n/manifest';

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
 * pick up the active `globalSettings.locale`. The provider runs on the
 * client and lazy-loads each requested namespace via `/api/i18n/<locale>`
 * — no inline blob here because the editor surface is interactive enough
 * that one extra round-trip is invisible.
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
  // first paint instead of falling through to en-US.
  await Promise.all([
    preloadDateLocale(locale),
    formattingLocale === locale ? Promise.resolve() : preloadDateLocale(formattingLocale),
  ]);

  return (
    <I18nProvider
      locale={locale}
      formattingLocale={formattingLocale}
      namespaces={['core', 'modules', 'editor', 'weather']}
    >
      <div className="bg-hs-body text-hs-text-primary font-sans antialiased h-screen overflow-hidden">
        <PluginGlobalsEditor />
        {children}
        <ConfirmModal />
        <BackupReminderToast />
      </div>
    </I18nProvider>
  );
}
