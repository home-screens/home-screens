import { test, expect } from '../fixtures';
import { LOCALES } from '@/i18n/manifest';
import { putConfig } from '../helpers/api';
import { baseConfig, choreChartModule, makeScreen } from '../helpers/config-fixtures';

/**
 * /chores (kid view) locale matrix — one translated chrome assertion per
 * manifest locale (remote.json `choresTab.subNav.today`, the sub-nav pill the
 * kid view always shows). Kid-copy matters here: this surface is used by
 * children, so the translated string rendering is part of the contract.
 *
 * Values verified against src/translations/<locale>/remote.json; each differs
 * from the en-US "Today" so a fallback-to-English regression fails.
 */
const LOCALE_TODAY: Record<string, string> = {
  'en-US': 'Today',
  'de-DE': 'Heute',
  'fr-FR': "Aujourd'hui",
  'es-ES': 'Hoy',
  'nl-NL': 'Vandaag',
  'pt-BR': 'Hoje',
  'da-DK': 'I dag',
};

const CHORE_DATA = {
  members: [{ id: 'm1', name: 'Avery', emoji: '🦊', color: '#f59e0b' }],
  chores: [{
    id: 'c1', name: 'Feed the dog', emoji: '🐶', points: 1, frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['m1'], rotation: 'fixed',
  }],
};

for (const locale of Object.keys(LOCALES)) {
  test(`/chores kid view renders translated chrome in ${locale}`, async ({ page, request }) => {
    const today = LOCALE_TODAY[locale];
    expect(today, `add a LOCALE_TODAY entry for ${locale}`).toBeDefined();

    await putConfig(request, baseConfig({
      screens: [makeScreen('s1', 'S1', [choreChartModule()])],
      settings: { locale },
    }));
    const seeded = await request.put('/api/chores/data', { data: CHORE_DATA });
    expect(seeded.ok()).toBe(true);

    await page.goto('/chores');
    // The seeded chore renders (page is alive) and the sub-nav pill reads in
    // the target tongue.
    await expect(page.getByText('Feed the dog')).toBeVisible();
    await expect(page.getByText(today, { exact: true }).first()).toBeVisible();
    if (locale !== 'en-US') {
      await expect(page.getByText(LOCALE_TODAY['en-US'], { exact: true })).toHaveCount(0);
    }
  });
}
