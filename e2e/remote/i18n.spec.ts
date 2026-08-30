import { test, expect } from '../fixtures';
import { LOCALES } from '@/i18n/manifest';
import { putConfig } from '../helpers/api';
import { baseConfig, choreChartModule, makeScreen } from '../helpers/config-fixtures';

/**
 * /remote locale matrix — one translated chrome assertion per manifest locale
 * (remote.json `tabs.chores`, rendered in the tab bar; the config carries a
 * chore-chart module so the Chores tab is present). The meta locale-surface
 * ratchet requires every manifest locale referenced here; the table +
 * `toBeDefined()` guard fail collection for an unlisted new locale.
 *
 * Every value below is verified against src/translations/<locale>/remote.json
 * and differs from the en-US "Chores", so a fallback-to-English regression
 * fails in every non-English locale.
 */
const LOCALE_CHORES_TAB: Record<string, string> = {
  'en-US': 'Chores',
  'de-DE': 'Aufgaben',
  'fr-FR': 'Tâches',
  'es-ES': 'Tareas',
  'nl-NL': 'Klusjes',
  'pt-BR': 'Tarefas',
  'da-DK': 'Pligter',
};

for (const locale of Object.keys(LOCALES)) {
  test(`/remote renders translated chrome in ${locale}`, async ({ page, request }) => {
    const choresTab = LOCALE_CHORES_TAB[locale];
    expect(choresTab, `add a LOCALE_CHORES_TAB entry for ${locale}`).toBeDefined();

    await putConfig(request, baseConfig({
      screens: [makeScreen('s1', 'S1', [choreChartModule()])],
      settings: { locale },
    }));
    await page.goto('/remote');

    await expect(page.getByText(choresTab, { exact: true }).first()).toBeVisible();
    if (locale !== 'en-US') {
      await expect(page.getByText(LOCALE_CHORES_TAB['en-US'], { exact: true })).toHaveCount(0);
    }
  });
}

/**
 * The dictionaries are inlined by the (remote) layout's `buildLocaleBlob`, not
 * fetched after mount. Blocking /api/i18n leaves the blob as the only possible
 * source, so translated copy appearing here proves it shipped with the
 * document. Without it `translate()` returns the key and the whole surface
 * renders as `tabs.chores`-style raw keys until the request lands.
 */
test('/remote renders translated chrome with no i18n fetch available', async ({ page, request }) => {
  await page.route('**/api/i18n/**', (route) => route.abort());

  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [choreChartModule()])],
    settings: { locale: 'de-DE' },
  }));
  await page.goto('/remote');

  await expect(page.getByText(LOCALE_CHORES_TAB['de-DE'], { exact: true }).first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText('tabs.');
});
