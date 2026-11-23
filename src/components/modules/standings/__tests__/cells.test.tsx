// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key, useFormattingLocale: () => 'en-US' }));

import type { StandingsEntry } from '@/lib/espn-standings';
import { CellValue } from '../TableView';

afterEach(cleanup);

const entry = {
  rank: 1, team: 'Bears', teamAbbr: 'CHI', teamShort: 'Bears', teamLogo: '', teamColor: '#000',
  wins: 5, losses: 3, winPct: 0.625, gamesBack: 1.5,
} as StandingsEntry;
const t = (key: string) => key;

function cell(col: string, locale: string) {
  return render(<CellValue entry={entry} col={col} league="nba" t={t} locale={locale} />).container.textContent;
}

describe('standings numbers', () => {
  it('writes the win percentage and games back in the household numbers', () => {
    expect(cell('pct', 'en-US')).toBe('.625');
    expect(cell('gb', 'en-US')).toBe('1.5');
    cleanup();
    expect(cell('pct', 'de-DE')).toBe(',625');
    expect(cell('gb', 'de-DE')).toBe('1,5');
  });

  it('keeps a perfect record whole', () => {
    expect(render(<CellValue entry={{ ...entry, winPct: 1 }} col="pct" league="nba" t={t} locale="de-DE" />).container.textContent).toBe('1,000');
  });
});
