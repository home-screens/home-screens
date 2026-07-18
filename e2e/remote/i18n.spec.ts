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
