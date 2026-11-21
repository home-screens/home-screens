// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { LOCALES } from '@/i18n/manifest';
import enUSModules from '@/translations/en-US/modules.json';
import { ChoreOverspentNotice } from '../ChoreOverspentNotice';

afterEach(cleanup);

function renderNotice(notice: { name: string | null; balance: number; owed: number }) {
  render(
    <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
      <ChoreOverspentNotice notice={notice} accentColor="#f59e0b" />
    </I18nProvider>,
  );
  return screen.getByTestId('chore-overspent-notice').textContent ?? '';
}

describe('the wall says where the tickets went', () => {
  it('names the person, the balance and how many tickets are owed', () => {
    const text = renderNotice({ name: 'Noah', balance: -4, owed: 4 });

    expect(text).toContain('Noah');
    expect(text).toContain('-4');
    expect(text).toContain('4 more tickets');
  });

  it('uses the singular when one ticket is owed', () => {
    const text = renderNotice({ name: 'Noah', balance: -1, owed: 1 });

    expect(text).toContain('1 more ticket to earn');
    expect(text).not.toContain('1 more tickets');
  });

  it('still says something when the roster has nobody by that id', () => {
    const text = renderNotice({ name: null, balance: -2, owed: 2 });

    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).not.toContain('null');
    expect(text).not.toContain('{name}');
  });

  it('is announced, so it is not a silent change on a shared screen', () => {
    renderNotice({ name: 'Noah', balance: -4, owed: 4 });

    expect(screen.getByTestId('chore-overspent-notice').getAttribute('role')).toBe('status');
  });
});

describe('every locale can say it', () => {
  for (const locale of Object.keys(LOCALES)) {
    it(`${locale} has the overspent message, the stand-in name and the hold hint`, async () => {
      const dict = (await import(`../../../../translations/${locale}/modules.json`)).default;
      const chart = dict['chore-chart'];

      expect(typeof chart.overspentSomeone).toBe('string');
      const core = (await import(`../../../../translations/${locale}/core.json`)).default;
      expect(typeof core.chores.holdToUncheck).toBe('string');
      // A plural form, so a locale is never left saying "1 more tickets".
      expect(typeof chart.overspent.one).toBe('string');
      expect(typeof chart.overspent.other).toBe('string');
      expect(chart.overspent.one).toContain('{name}');
      expect(chart.overspent.one).toContain('{balance}');
      expect(chart.overspent.other).toContain('{count}');
    });
  }
});
