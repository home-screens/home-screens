import { describe, it, expect } from 'vitest';
import { getColumns, streakLabel } from '../TableView';
import { standingsRowsKey } from '../paging';
import de from '@/translations/de-DE/modules.json';
import en from '@/translations/en-US/modules.json';

type Dict = Record<string, unknown>;
const translator = (dict: Dict) => (key: string) =>
  key.split('.').reduce<unknown>((node, part) => (node as Dict | undefined)?.[part], dict) as string;

describe('standings column headings', () => {
  it('reads as before in English', () => {
    const t = translator(en);
    expect(getColumns('nfl', t).map((c) => c.label)).toEqual(['W-L', 'PCT', 'PF', 'PA', 'DIFF', 'STRK']);
    expect(getColumns('nhl', t).map((c) => c.label)).toEqual(['GP', 'W-L-OT', 'PTS', 'DIFF', 'STRK']);
    expect(getColumns('epl', t).map((c) => c.label)).toEqual(['GP', 'W-D-L', 'PTS', 'GD']);
    expect(getColumns('nba', t).map((c) => c.label)).toEqual(['W-L', 'PCT', 'GB', 'STRK', 'L10']);
  });

  it('heads a German table in German, with the letters the Sports module prints', () => {
    const t = translator(de);
    expect(getColumns('bundesliga', t).map((c) => c.label)).toEqual(['SP', 'S-U-N', 'PKT', 'DIFF']);
  });

  it('keeps the same column keys and widths whatever the language', () => {
    const strip = (cols: ReturnType<typeof getColumns>) => cols.map(({ key, width }) => ({ key, width }));
    for (const league of ['nfl', 'nhl', 'epl', 'nba']) {
      expect(strip(getColumns(league, translator(de)))).toEqual(strip(getColumns(league, translator(en))));
    }
  });
});

describe('standingsRowsKey', () => {
  const group = { league: 'nba', name: 'East', entries: [{ teamAbbr: 'BOS' }, { teamAbbr: 'NYK' }, { teamAbbr: 'MIL' }] };

  it('changes with the teams drawn, the cap and the type size, and with nothing else', () => {
    const key = standingsRowsKey(group, 0, 16);
    expect(standingsRowsKey({ ...group, entries: [...group.entries] }, 0, 16)).toBe(key);
    expect(standingsRowsKey(group, 2, 16)).not.toBe(key);
    expect(standingsRowsKey(group, 0, 20)).not.toBe(key);
    expect(standingsRowsKey({ ...group, name: 'West' }, 0, 16)).not.toBe(key);
  });

  it('is empty for no group', () => {
    expect(standingsRowsKey(undefined, 0, 16)).toBe('');
  });
});

describe('streakLabel', () => {
  it('writes a streak with the letters the record column uses', () => {
    expect(streakLabel('W3', 'S', 'N')).toBe('S3');
    expect(streakLabel('L1', 'S', 'N')).toBe('N1');
    expect(streakLabel('W3', 'W', 'L')).toBe('W3');
  });

  it('leaves anything else as the source sent it', () => {
    expect(streakLabel('T1', 'S', 'N')).toBe('T1');
    expect(streakLabel('', 'S', 'N')).toBe('');
  });
});
