import { readConfig } from '@/lib/config';
import { I18nProvider } from '@/i18n';
import { buildLocaleBlob } from '@/i18n/server-blob';
import { DEFAULT_LOCALE } from '@/i18n/manifest';
import { resolveChoreModuleConfig } from '@/lib/chore-module-config';
import RootLauncher from '@/components/RootLauncher';

// Reads `data/config.json` for the active locale, which changes at runtime.
export const dynamic = 'force-dynamic';

/**
 * `/` — the editor on a laptop, a launcher on a phone. Only the viewport can
 * tell the two apart (a client hint says "desktop" for a narrow desktop
 * window and for emulated phones alike), so the page is served the same to
 * everyone: the launcher server-rendered, and `RootLauncher` forwarding wide
 * viewports to the editor from the client.
 */
export default async function Home() {
  const config = await readConfig().catch(() => null);
  const locale = config?.settings?.locale ?? DEFAULT_LOCALE;
  const blob = await buildLocaleBlob(locale, ['core']);
  // /chores is only offered once a chore chart is on a screen — the same gate
  // the remote's Chores tab and the "On your phone" page use. Before that the
  // page is an empty state a phone visitor cannot act on.
  const hasChoreChart = config ? resolveChoreModuleConfig(config) !== null : false;
  return (
    <I18nProvider locale={locale} blob={blob}>
      <RootLauncher showChores={hasChoreChart} />
    </I18nProvider>
  );
}
