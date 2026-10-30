import type { Metadata, Viewport } from 'next';
import '@/app/globals.css';
import { readConfig } from '@/lib/config';
import { I18nProvider, resolveShippedLocale } from '@/i18n';
import { buildLocaleBlob } from '@/i18n/server-blob';
import { DEFAULT_LOCALE } from '@/i18n/manifest';
import { isoDateInTZ, resolveHouseholdTimezone } from '@/lib/timezone';
import { hubTimezone } from '@/lib/household-day';
import { settingsTimeFormat } from '@/lib/clock-time';
import { HouseholdClockProvider } from './remote/household-clock';

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
  // <I18nProvider>; resolved here so the server render and the client agree).
  const formattingLocale = config?.settings?.formattingLocale ?? resolveShippedLocale(locale);
  // The phone's own zone is not the household's. With none set, the household
  // runs on the hub's clock, so the phone is handed the hub's zone by name.
  const timezone = resolveHouseholdTimezone(config?.settings?.timezone, hubTimezone());
  // Inline the dictionaries rather than letting the provider fetch them after
  // mount. `translate()` returns the key itself on a miss, so a post-mount
  // fetch renders the whole surface as raw keys until it lands. That covers
  // /chores too — it shares this layout — which is the one that matters most:
  // a kid reading `chores.markDone` has no way to know it is a loading state.
  // ~48 KB for the three namespaces, against the 188 KB the editor layout
  // already inlines.
  const blob = await buildLocaleBlob(locale, ['core', 'modules', 'remote']);

  return (
    <I18nProvider
      locale={locale}
      formattingLocale={formattingLocale}
      blob={blob}
    >
      <HouseholdClockProvider
        timezone={timezone}
        today={isoDateInTZ(new Date(), timezone)}
        timeFormat={settingsTimeFormat(config?.settings)}
      >
        {children}
      </HouseholdClockProvider>
    </I18nProvider>
  );
}
