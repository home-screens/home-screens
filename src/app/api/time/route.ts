import { NextResponse } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { readConfig } from '@/lib/config';
import { DEFAULT_LOCALE } from '@/i18n/manifest';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async () => {
  const now = new Date();
  // Resolve the formatting locale via the standard cascade so the
  // returned `formatted` string honors `globalSettings.formattingLocale`
  // when set, otherwise falls through to `globalSettings.locale`, and
  // finally to en-US. `readConfig` failures (missing/corrupt config)
  // are swallowed — the en-US default always works.
  const config = await readConfig().catch(() => null);
  const locale =
    config?.settings?.formattingLocale ?? config?.settings?.locale ?? DEFAULT_LOCALE;
  return NextResponse.json({
    iso: now.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    // Omit `hour12` so the locale's natural convention wins (24h in
    // de-DE / fr-FR / nl-NL, 12h in en-US). Forcing a fixed value here
    // would defeat the locale resolution above.
    formatted: now.toLocaleTimeString(locale, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }),
  });
}, 'Failed to get server time');
