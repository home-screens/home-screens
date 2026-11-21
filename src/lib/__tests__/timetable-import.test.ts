import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TIMETABLE_LIMITS, type TimetableSubject } from '@/types/timetables';

// The fetch helper is replaced wholesale: the real one resolves DNS before it
// goes anywhere, and no test here may reach the network, let alone Google.
vi.mock('@/lib/guarded-fetch', () => ({
  fetchWithAllowedRedirects: vi.fn(),
}));

import { fetchWithAllowedRedirects } from '@/lib/guarded-fetch';
import {
  buildExportUrl,
  buildTabListUrl,
  fetchSheetCsv,
  fetchSheetTabs,
  parseSheetLink,
  parseTabs,
  parseTimetableCsv,
  readTimetableCsv,
  tabNameFromDisposition,
  type ImportedRow,
} from '../timetable-import';

const fetchMock = vi.mocked(fetchWithAllowedRedirects);

const FILE_ID = '1JKPUNp8Y_8Aigq7eGJXtWT6nZFhd31k2Ht3AjC-i-Q8';
const PUBLISH_ID = '2PACX-1vSxf9M4hKKQdF8OhetmnA8eaBYXFpUqX0dTjjVMubKaQCB_CNtRgTgysg8tFZe_rw';

const HTMLVIEW_FIXTURE = readFileSync(
  path.resolve(__dirname, 'fixtures/google-sheet-htmlview.html'),
  'utf-8',
);

// ---------------------------------------------------------------------------
// Test doubles for the fetch helper
// ---------------------------------------------------------------------------

function answer(options: {
  body: string;
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
}) {
  return {
    ok: true as const,
    url: 'https://doc-08-4o-sheets.googleusercontent.com/export/abc/',
    status: options.status ?? 200,
    contentType: options.contentType ?? 'text/csv; charset=utf-8',
    responseHeaders: new Headers(options.headers ?? {}),
    body: new TextEncoder().encode(options.body),
  };
}

function refusal(reason: 'timeout' | 'too-large' | 'not-allowed' | 'unreachable' | 'invalid-url') {
  return { ok: false as const, reason, url: 'https://docs.google.com/spreadsheets/d/x/export' };
}

/** The URL the library asked for, which must always be one it built itself. */
function requestedUrl(): string {
  return fetchMock.mock.calls[0][0];
}

// ---------------------------------------------------------------------------
// Subjects a household already has
// ---------------------------------------------------------------------------

const DE_SUBJECTS: TimetableSubject[] = [
  { id: 'deu', code: 'Deu', name: 'Deutsch', color: '#f26363', icon: 'book' },
  { id: 'ma', code: 'Ma', name: 'Mathe', color: '#4f8ef7', icon: 'triangle' },
  { id: 'eng', code: 'Eng', name: 'Englisch', color: '#f2c94c', icon: 'speech' },
  { id: 'bio', code: 'Bio', name: 'Biologie', color: '#43c07e', icon: 'leaf' },
  { id: 'ge', code: 'Ge', name: 'Geschichte', color: '#e0a86e', icon: 'castle' },
  { id: 'ku', code: 'Ku', name: 'Kunst', color: '#ee6fd8', icon: 'palette' },
  { id: 'sp', code: 'Sp', name: 'Sport', color: '#8fdc4e', icon: 'ball' },
  { id: 'if', code: 'If', name: 'Informatik', color: '#8ea3c0', icon: 'chip' },
  { id: 'wipo', code: 'WiPo', name: 'Wirtschaft-Politik', color: '#7c8cf8', icon: 'people' },
];

const EN_SUBJECTS: TimetableSubject[] = [
  { id: 'math', code: 'Ma', name: 'Math', color: '#4f8ef7', icon: 'triangle' },
  { id: 'english', code: 'En', name: 'English', color: '#f26363', icon: 'book' },
  { id: 'science', code: 'Sc', name: 'Science', color: '#43c07e', icon: 'flask' },
  { id: 'pe', code: 'PE', name: 'PE', color: '#8fdc4e', icon: 'ball' },
  { id: 'art', code: 'Ar', name: 'Art', color: '#ee6fd8', icon: 'palette' },
  { id: 'history', code: 'Hi', name: 'History', color: '#e0a86e', icon: 'castle' },
];

/** The periods of a parsed grid, which is what most assertions are about. */
function periods(rows: ImportedRow[]) {
  return rows.filter((row): row is Extract<ImportedRow, { kind: 'period' }> => row.kind === 'period');
}

beforeEach(() => {
  fetchMock.mockReset();
});

// ---------------------------------------------------------------------------

describe('parseSheetLink', () => {
  it('reads a normal share link with the tab in the fragment', () => {
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${FILE_ID}/edit#gid=1734448653`)).toEqual({
      kind: 'file',
      spreadsheetId: FILE_ID,
      gid: '1734448653',
    });
  });

  it('reads the tab out of a query string as well as a fragment', () => {
    expect(
      parseSheetLink(`https://docs.google.com/spreadsheets/d/${FILE_ID}/edit?gid=42#gid=42`),
    ).toEqual({ kind: 'file', spreadsheetId: FILE_ID, gid: '42' });
  });

  it('leaves the tab unset when the link does not name one', () => {
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${FILE_ID}/edit?usp=sharing`)).toEqual({
      kind: 'file',
      spreadsheetId: FILE_ID,
    });
  });

  it('reads an export link a user copied out of the address bar', () => {
    expect(
      parseSheetLink(`https://docs.google.com/spreadsheets/d/${FILE_ID}/export?format=csv&gid=7`),
    ).toEqual({ kind: 'file', spreadsheetId: FILE_ID, gid: '7' });
  });

  // The trap: /d/e/<pubid> also matches the file pattern, capturing "e".
  it('reads a publish-to-web link as published, not as a file called "e"', () => {
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/e/${PUBLISH_ID}/pubhtml`)).toEqual({
      kind: 'published',
      publishId: PUBLISH_ID,
    });
  });

  it('reads the published CSV form with its tab', () => {
    const link = `https://docs.google.com/spreadsheets/d/e/${PUBLISH_ID}/pub?output=csv&gid=1016667073&single=true`;
    expect(parseSheetLink(link)).toEqual({
      kind: 'published',
      publishId: PUBLISH_ID,
      gid: '1016667073',
    });
  });

  it('accepts a link pasted without its scheme', () => {
    expect(parseSheetLink(`docs.google.com/spreadsheets/d/${FILE_ID}/edit`)).toEqual({
      kind: 'file',
      spreadsheetId: FILE_ID,
    });
  });

  it('accepts a link pasted with whitespace around it', () => {
    expect(parseSheetLink(`  https://docs.google.com/spreadsheets/d/${FILE_ID}/edit\n`)).toEqual({
      kind: 'file',
      spreadsheetId: FILE_ID,
    });
  });

  it('refuses a look-alike host', () => {
    expect(parseSheetLink(`https://docs.google.com.evil.example/spreadsheets/d/${FILE_ID}/edit`)).toBeNull();
    expect(parseSheetLink(`https://evil.example/spreadsheets/d/${FILE_ID}/edit`)).toBeNull();
  });

  it('refuses anything that is not a sheet link', () => {
    expect(parseSheetLink('')).toBeNull();
    expect(parseSheetLink('   ')).toBeNull();
    expect(parseSheetLink('my kid timetable')).toBeNull();
    expect(parseSheetLink('https://docs.google.com/document/d/abc123/edit')).toBeNull();
    expect(parseSheetLink('ftp://docs.google.com/spreadsheets/d/abc123/edit')).toBeNull();
  });
});

describe('buildTabListUrl and buildExportUrl', () => {
  it('lists a file link on htmlview and a published link on pubhtml', () => {
    expect(buildTabListUrl({ kind: 'file', spreadsheetId: FILE_ID })).toBe(
      `https://docs.google.com/spreadsheets/d/${FILE_ID}/htmlview`,
    );
    expect(buildTabListUrl({ kind: 'published', publishId: PUBLISH_ID })).toBe(
      `https://docs.google.com/spreadsheets/d/e/${PUBLISH_ID}/pubhtml`,
    );
  });

  it('exports a file link through /export', () => {
    expect(buildExportUrl({ kind: 'file', spreadsheetId: FILE_ID }, '1734448653')).toBe(
      `https://docs.google.com/spreadsheets/d/${FILE_ID}/export?format=csv&gid=1734448653`,
    );
  });

  it('exports a published link through /pub with single=true', () => {
    expect(buildExportUrl({ kind: 'published', publishId: PUBLISH_ID }, '0')).toBe(
      `https://docs.google.com/spreadsheets/d/e/${PUBLISH_ID}/pub?output=csv&gid=0&single=true`,
    );
  });

  it('falls back to the tab the link itself named', () => {
    expect(buildExportUrl({ kind: 'file', spreadsheetId: FILE_ID, gid: '9' })).toContain('&gid=9');
  });

  it('prefers the tab it is asked for over the one in the link', () => {
    expect(buildExportUrl({ kind: 'file', spreadsheetId: FILE_ID, gid: '9' }, '3')).toContain('&gid=3');
  });

  it('leaves the tab out when nothing named one', () => {
    expect(buildExportUrl({ kind: 'file', spreadsheetId: FILE_ID })).toBe(
      `https://docs.google.com/spreadsheets/d/${FILE_ID}/export?format=csv`,
    );
  });
});

describe('parseTabs', () => {
  it('lists every tab of a saved htmlview page, in tab order', () => {
    expect(parseTabs(HTMLVIEW_FIXTURE)).toEqual([
      { name: 'Web', gid: '0' },
      { name: 'Web Unnamed', gid: '1734448653' },
      { name: 'Web Identifiers', gid: '1104710817' },
    ]);
  });

  it('decodes the escapes a JavaScript string literal can carry', () => {
    const html =
      'items.push({name: "Klasse 7\\/8 \\"A\\"", gid: "5"});' +
      'items.push({name: "\\u00dcbung \\x26 Wiederholung", gid: "6"});';
    expect(parseTabs(html)).toEqual([
      { name: 'Klasse 7/8 "A"', gid: '5' },
      { name: 'Übung & Wiederholung', gid: '6' },
    ]);
  });

  it('does not care what order the fields come in, or how many there are', () => {
    const html =
      'items.push({initialSheet: ("7" == gid), gid: "7", theme: "x", name: "Leon"});';
    expect(parseTabs(html)).toEqual([{ name: 'Leon', gid: '7' }]);
  });

  it('skips an entry that is missing a field, and keeps the first of a repeated gid', () => {
    const html =
      'items.push({name: "No gid here"});' +
      'items.push({gid: "3"});' +
      'items.push({name: "First", gid: "4"});' +
      'items.push({name: "Second", gid: "4"});';
    expect(parseTabs(html)).toEqual([{ name: 'First', gid: '4' }]);
  });

  it('finds nothing in a page that is not a sheet', () => {
    expect(parseTabs('<html><body>Sign in to your Google Account</body></html>')).toEqual([]);
    expect(parseTabs('')).toEqual([]);
  });
});

describe('tabNameFromDisposition', () => {
  it('takes the tab name off the end of the filename', () => {
    const header =
      "attachment; filename=\"ExampleSpreadsheet-ClassData.csv\"; filename*=UTF-8''Example%20Spreadsheet%20-%20Class%20Data.csv";
    expect(tabNameFromDisposition(header)).toBe('Class Data');
  });

  it('keeps the accents the plain filename throws away', () => {
    const header =
      "attachment; filename*=UTF-8''Stundenplan%20-%20Sch%C3%BCler%20BS.csv";
    expect(tabNameFromDisposition(header)).toBe('Schüler BS');
  });

  it('uses the whole name when the sheet title is not in front of it', () => {
    expect(tabNameFromDisposition("attachment; filename*=UTF-8''Tabellenblatt1.csv")).toBe(
      'Tabellenblatt1',
    );
  });

  it('gives nothing back when there is no name to read', () => {
    expect(tabNameFromDisposition(null)).toBeUndefined();
    expect(tabNameFromDisposition('attachment')).toBeUndefined();
    expect(tabNameFromDisposition("attachment; filename*=UTF-8''%E0%A4%A.csv")).toBeUndefined();
  });
});

describe('fetchSheetTabs', () => {
  it('asks the page the hub built and returns the tabs it lists', async () => {
    fetchMock.mockResolvedValue(answer({ body: HTMLVIEW_FIXTURE, contentType: 'text/html' }));

    const result = await fetchSheetTabs({ kind: 'file', spreadsheetId: FILE_ID });

    expect(requestedUrl()).toBe(`https://docs.google.com/spreadsheets/d/${FILE_ID}/htmlview`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      allowHosts: ['docs.google.com', '*.googleusercontent.com'],
      maxHops: 5,
      maxBytes: 1_000_000,
      timeoutMs: 15_000,
    });
    expect(result).toEqual({
      ok: true,
      tabs: [
        { name: 'Web', gid: '0' },
        { name: 'Web Unnamed', gid: '1734448653' },
        { name: 'Web Identifiers', gid: '1104710817' },
      ],
    });
  });

  // A page we could read that lists no tabs is not a failure and carries no
  // message: the household pastes one link per tab instead, on the same
  // screen, so the caller has to branch on the shape rather than on wording.
  it('treats a page with no tabs in it as its own outcome', async () => {
    fetchMock.mockResolvedValue(
      answer({ body: '<html><body>Before you continue</body></html>', contentType: 'text/html' }),
    );
    expect(await fetchSheetTabs({ kind: 'file', spreadsheetId: FILE_ID })).toEqual({
      ok: false,
      reason: 'no-tab-list',
    });
  });

  it('says not found when the sheet is gone', async () => {
    fetchMock.mockResolvedValue(answer({ body: 'error', status: 404, contentType: 'text/html' }));
    expect(await fetchSheetTabs({ kind: 'file', spreadsheetId: FILE_ID })).toEqual({
      ok: false,
      reason: 'failed',
      messageKey: 'sheetNotFound',
    });
  });

  it('says not shared for the sign-in page, whichever status it carries', async () => {
    for (const status of [401, 403, 410]) {
      fetchMock.mockResolvedValue(answer({ body: 'sign in', status, contentType: 'text/html' }));
      expect(await fetchSheetTabs({ kind: 'published', publishId: PUBLISH_ID })).toEqual({
        ok: false,
        reason: 'failed',
        messageKey: 'sheetNotShared',
      });
    }
  });

  it('says not shared when a hop leaves the hosts we allow', async () => {
    fetchMock.mockResolvedValue(refusal('not-allowed'));
    expect(await fetchSheetTabs({ kind: 'file', spreadsheetId: FILE_ID })).toEqual({
      ok: false,
      reason: 'failed',
      messageKey: 'sheetNotShared',
    });
  });

  it('says unreachable when Google does not answer', async () => {
    fetchMock.mockResolvedValue(refusal('timeout'));
    expect(await fetchSheetTabs({ kind: 'file', spreadsheetId: FILE_ID })).toEqual({
      ok: false,
      reason: 'failed',
      messageKey: 'sheetUnreachable',
    });
  });

  it('says too big when the page runs past the cap', async () => {
    fetchMock.mockResolvedValue(refusal('too-large'));
    expect(await fetchSheetTabs({ kind: 'file', spreadsheetId: FILE_ID })).toEqual({
      ok: false,
      reason: 'failed',
      messageKey: 'sheetTooBig',
    });
  });
});

describe('fetchSheetCsv', () => {
  const CSV = 'Std,Zeit,Mo\n1,08:00,Ma\n';

  it('downloads the tab it was asked for and names it from the download', async () => {
    fetchMock.mockResolvedValue(
      answer({
        body: CSV,
        headers: {
          'content-disposition':
            "attachment; filename*=UTF-8''Stundenplan%20-%20Leon%207c.csv",
        },
      }),
    );

    const result = await fetchSheetCsv({ kind: 'file', spreadsheetId: FILE_ID }, '1734448653');

    expect(requestedUrl()).toBe(
      `https://docs.google.com/spreadsheets/d/${FILE_ID}/export?format=csv&gid=1734448653`,
    );
    expect(result).toEqual({ ok: true, text: CSV, tabName: 'Leon 7c' });
  });

  it('downloads a published tab through /pub', async () => {
    fetchMock.mockResolvedValue(answer({ body: CSV }));
    const result = await fetchSheetCsv({ kind: 'published', publishId: PUBLISH_ID }, '0');
    expect(requestedUrl()).toBe(
      `https://docs.google.com/spreadsheets/d/e/${PUBLISH_ID}/pub?output=csv&gid=0&single=true`,
    );
    expect(result).toEqual({ ok: true, text: CSV });
  });

  it('refuses an HTML answer, which is the sign-in page wearing a 200', async () => {
    fetchMock.mockResolvedValue(
      answer({ body: '<html><body>You must sign in</body></html>', contentType: 'text/html' }),
    );
    expect(await fetchSheetCsv({ kind: 'file', spreadsheetId: FILE_ID }, '0')).toEqual({
      ok: false,
      messageKey: 'sheetNotShared',
    });
  });

  it('refuses an HTML answer even when it claims to be a CSV', async () => {
    fetchMock.mockResolvedValue(
      answer({ body: '<!DOCTYPE html>\n<html><head></head></html>', contentType: 'text/csv' }),
    );
    expect(await fetchSheetCsv({ kind: 'file', spreadsheetId: FILE_ID }, '0')).toEqual({
      ok: false,
      messageKey: 'sheetNotShared',
    });
  });

  it('says the tab is gone when a bad gid answers 400', async () => {
    fetchMock.mockResolvedValue(answer({ body: 'error', status: 400, contentType: 'text/html' }));
    expect(await fetchSheetCsv({ kind: 'file', spreadsheetId: FILE_ID }, '999999999')).toEqual({
      ok: false,
      messageKey: 'tabNotFound',
    });
  });

  it('says not found when the sheet is gone', async () => {
    fetchMock.mockResolvedValue(answer({ body: 'error', status: 404, contentType: 'text/html' }));
    expect(await fetchSheetCsv({ kind: 'file', spreadsheetId: FILE_ID }, '0')).toEqual({
      ok: false,
      messageKey: 'sheetNotFound',
    });
  });

  it('says too big when the rows run past the cap', async () => {
    fetchMock.mockResolvedValue(refusal('too-large'));
    expect(await fetchSheetCsv({ kind: 'file', spreadsheetId: FILE_ID }, '0')).toEqual({
      ok: false,
      messageKey: 'sheetTooBig',
    });
  });

  it('says unreachable when the connection fails', async () => {
    fetchMock.mockResolvedValue(refusal('unreachable'));
    expect(await fetchSheetCsv({ kind: 'file', spreadsheetId: FILE_ID }, '0')).toEqual({
      ok: false,
      messageKey: 'sheetUnreachable',
    });
  });
});

describe('parseTimetableCsv, a German grid', () => {
  const CSV = [
    'Stundenplan Klasse 7c,,,,,,',
    'Std.,Zeit,Mo,Di,Mi,Do,Fr',
    '1,08:00 - 08:45,Ma / A107,Deu,Eng,Sp,Ma',
    '2,08:45 - 09:30,Deu,Ma,Info,Sp,Bio',
    'Pause,09:30 - 09:50,,,,,',
    '3,09:50 - 10:35,Eng,,Ku (R12),Ge,Deu',
    'Mittag,12:30 - 13:15,,,,,',
    '7,13:15 - 14:00,WiPo,,,Info,',
  ].join('\n');

  const grid = () => readTimetableCsv(CSV, DE_SUBJECTS);

  it('finds the weekday header and lines the days up with their columns', () => {
    const result = grid();
    expect(result.headerRow).toBe(1);
    expect(result.days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    // Which column each day was found in is only visible through the cells it
    // produced, so the first lesson row is what proves the alignment.
    const first = periods(result.rows)[0];
    expect(
      result.days.map((day) => first.cells[day]?.code),
    ).toEqual(['Ma', 'Deu', 'Eng', 'Sp', 'Ma']);
  });

  it('numbers the lesson rows from the period column', () => {
    expect(periods(grid().rows).map((row) => row.n)).toEqual([1, 2, 3, 7]);
  });

  it('reads the start and end times', () => {
    const first = periods(grid().rows)[0];
    expect(first.start).toBe('08:00');
    expect(first.end).toBe('08:45');
  });

  it('makes a break row out of a word in the period column', () => {
    const breaks = grid().rows.filter((row) => row.kind === 'break');
    expect(breaks).toEqual([
      { kind: 'break', label: 'Pause', start: '09:30', end: '09:50' },
      { kind: 'break', label: 'Mittag', start: '12:30', end: '13:15' },
    ]);
  });

  it('matches a known code to the household subject and splits the room off', () => {
    expect(periods(grid().rows)[0].cells.mon).toEqual({
      text: 'Ma / A107',
      code: 'Ma',
      subjectId: 'ma',
      room: 'A107',
    });
  });

  it('leaves a blank cell out, because a blank cell is a free period', () => {
    const third = periods(grid().rows)[2];
    expect(third.cells.tue).toBeUndefined();
    expect(third.cells.mon?.subjectId).toBe('eng');
  });

  it('reads a room in brackets', () => {
    expect(periods(grid().rows)[2].cells.wed).toEqual({
      text: 'Ku (R12)',
      code: 'Ku',
      subjectId: 'ku',
      room: 'R12',
    });
  });

  it('does not mistake a hyphen inside a subject name for a room', () => {
    expect(periods(grid().rows)[3].cells.mon).toEqual({
      text: 'WiPo',
      code: 'WiPo',
      subjectId: 'wipo',
    });
  });

  it('gathers the codes it does not know, with a suggestion by name', () => {
    expect(grid().unknownCodes).toEqual([
      {
        code: 'Info',
        count: 2,
        // 'info' shares four letters with 'informatik', which is enough to be
        // offered as the answer rather than only as a hint.
        suggestion: { subjectId: 'if', code: 'If', name: 'Informatik', confident: true },
      },
    ]);
  });

  it('reads the same grid when Excel wrote it with semicolons', () => {
    const semicolons = CSV.split('\n')
      .map((line) => line.replace(/,/g, ';'))
      .join('\r\n');
    const result = readTimetableCsv(semicolons, DE_SUBJECTS);
    expect(result.headerRow).toBe(1);
    expect(periods(result.rows).map((row) => row.n)).toEqual([1, 2, 3, 7]);
    expect(periods(result.rows)[0].cells.mon?.room).toBe('A107');
  });
});

describe('parseTimetableCsv, an English grid', () => {
  const CSV = [
    'Period,From,To,Mon,Tue,Wed,Thu,Fri',
    '1,8.00,8.45,Math,English,Science,PE,Math',
    '2,9.00,9.45,Art - Room 12,Math,Comp,History,English',
    'Lunch,12.00,12.45,,,,,',
    '3,13.00,13.45,Science,,PE,Math,Comp',
  ].join('\n');

  const grid = () => readTimetableCsv(CSV, EN_SUBJECTS);

  // "To" is Thursday in Danish, so a language that scores one column must
  // never beat the language that scores five.
  it('does not read an end-time column called "To" as Thursday', () => {
    const result = grid();
    expect(result.days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    // Thursday has to come from the column headed "Thu", not the one headed
    // "To": PE is the Thursday lesson, and 8.45 is the end time.
    const first = periods(result.rows)[0];
    expect(first.cells.thu?.code).toBe('PE');
    expect(first.end).toBe('08:45');
  });

  it('reads a start and an end kept in columns of their own', () => {
    const first = periods(grid().rows)[0];
    expect(first.start).toBe('08:00');
    expect(first.end).toBe('08:45');
  });

  it('matches a subject by its full name', () => {
    expect(periods(grid().rows)[0].cells.mon).toEqual({
      text: 'Math',
      code: 'Math',
      subjectId: 'math',
    });
  });

  it('splits a room off a spaced hyphen', () => {
    expect(periods(grid().rows)[1].cells.mon).toEqual({
      text: 'Art - Room 12',
      code: 'Art',
      subjectId: 'art',
      room: 'Room 12',
    });
  });

  it('makes the lunch row a break', () => {
    expect(grid().rows.filter((row) => row.kind === 'break')).toEqual([
      { kind: 'break', label: 'Lunch', start: '12:00', end: '12:45' },
    ]);
  });

  it('offers no suggestion for a code nothing looks like', () => {
    expect(grid().unknownCodes).toEqual([{ code: 'Comp', count: 2 }]);
  });
});

describe('parseTimetableCsv, the shapes a sheet can take', () => {
  it('finds the header in every language the app ships', () => {
    const headers: Record<string, string> = {
      de: 'Stunde,Zeit,Mo,Di,Mi,Do,Fr',
      en: 'Period,Time,Monday,Tuesday,Wednesday,Thursday,Friday',
      fr: 'Heure,Horaire,Lundi,Mardi,Mercredi,Jeudi,Vendredi',
      es: 'Hora,Horario,Lunes,Martes,Miércoles,Jueves,Viernes',
      nl: 'Uur,Tijd,Ma,Di,Wo,Do,Vr',
      pt: 'Aula,Hora,Segunda-feira,Terça-feira,Quarta-feira,Quinta-feira,Sexta-feira',
      da: 'Time,Tid,Man,Tir,Ons,Tor,Fre',
    };
    for (const [language, header] of Object.entries(headers)) {
      const result = readTimetableCsv(`${header}\n1,08:00,Ma,Ma,Ma,Ma,Ma\n`, DE_SUBJECTS);
      expect({ language, days: result.days }).toEqual({
        language,
        days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      });
    }
  });

  it('reads a Brazilian header written as ordinals', () => {
    const result = readTimetableCsv('Aula,Hora,2ª,3ª,4ª,5ª,6ª\n1,08:00,Ma,,,,\n', DE_SUBJECTS);
    expect(result.days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
  });

  it('reads a header that carries the date beside the day', () => {
    const result = readTimetableCsv(
      'Std,Zeit,Montag 14.09.,Dienstag 15.09.,Mittwoch 16.09.,Donnerstag 17.09.,Freitag 18.09.\n1,08:00,Ma,,,,\n',
      DE_SUBJECTS,
    );
    expect(result.days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
  });

  it('reads times whether they are written with a colon, a dot or an en dash', () => {
    const result = readTimetableCsv(
      [
        'Std,Zeit,Mo,Di,Mi,Do,Fr',
        '1,08:00 - 08:45,Ma,,,,',
        '2,8.50-9.35,Deu,,,,',
        '3,09:40 – 10:25,Eng,,,,',
      ].join('\n'),
      DE_SUBJECTS,
    );
    expect(periods(result.rows).map((row) => [row.start, row.end])).toEqual([
      ['08:00', '08:45'],
      ['08:50', '09:35'],
      ['09:40', '10:25'],
    ]);
  });

  it('reads a period written out in words next to its number', () => {
    const result = readTimetableCsv('Std,Zeit,Mo,Di,Mi,Do,Fr\n4. Stunde,11:00,Ma,,,,\n', DE_SUBJECTS);
    expect(periods(result.rows)[0].n).toBe(4);
  });

  it('numbers the rows itself when the grid starts at the first column', () => {
    const result = readTimetableCsv('Mo,Di,Mi,Do,Fr\nMa,Deu,,Eng,Sp\nDeu,,Ma,,Bio\n', DE_SUBJECTS);
    expect(result.days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(periods(result.rows).map((row) => row.n)).toEqual([1, 2]);
  });

  it('splits a room off a slash with or without spaces, and off a line break', () => {
    const result = readTimetableCsv(
      ['Std,Zeit,Mo,Di,Mi,Do,Fr', '1,08:00,Ma / A107,Ma/A107,"Ma\nA107",Ma|A107,"Ma, A107"'].join('\n'),
      DE_SUBJECTS,
    );
    const cells = periods(result.rows)[0].cells;
    for (const cell of [cells.mon, cells.tue, cells.wed, cells.thu, cells.fri]) {
      expect(cell?.code).toBe('Ma');
      expect(cell?.room).toBe('A107');
    }
  });

  it('matches codes and names whatever case or accents they are written in', () => {
    const result = readTimetableCsv(
      'Std,Zeit,Mo,Di,Mi,Do,Fr\n1,08:00,MA,deutsch,ENGLISCH,bio,Kunst\n',
      DE_SUBJECTS,
    );
    const cells = periods(result.rows)[0].cells;
    expect([cells.mon, cells.tue, cells.wed, cells.thu, cells.fri].map((cell) => cell?.subjectId)).toEqual([
      'ma',
      'deu',
      'eng',
      'bio',
      'ku',
    ]);
    expect(result.unknownCodes).toEqual([]);
  });

  it('suggests the subject a longer spelling belongs to', () => {
    const result = readTimetableCsv(
      'Std,Zeit,Mo,Di,Mi,Do,Fr\n1,08:00,Mathematik,Sportunterricht,,,\n',
      DE_SUBJECTS,
    );
    expect(result.unknownCodes.map((entry) => [entry.code, entry.suggestion?.subjectId])).toEqual([
      ['Mathematik', 'ma'],
      ['Sportunterricht', 'sp'],
    ]);
  });

  it('puts the busiest unknown code first', () => {
    const result = readTimetableCsv(
      ['Std,Zeit,Mo,Di,Mi,Do,Fr', '1,08:00,Chor,Info,Info,Info,Chor', '2,09:00,,,Info,,'].join('\n'),
      DE_SUBJECTS,
    );
    expect(result.unknownCodes.map((entry) => entry.code)).toEqual(['Info', 'Chor']);
  });

  it('says it found nothing when the sheet has no weekday row', () => {
    const result = readTimetableCsv('Name,Telefon\nLeon,0221\nEmma,0221\n', DE_SUBJECTS);
    expect(result).toEqual({ headerRow: -1, days: [], rows: [], unknownCodes: [] });
  });

  it('reads an empty sheet without complaining', () => {
    expect(readTimetableCsv('', DE_SUBJECTS)).toEqual({
      headerRow: -1,
      days: [],
      rows: [],
      unknownCodes: [],
    });
  });

  it('takes rows straight from the CSV reader too', () => {
    const rows = [
      ['Std', 'Zeit', 'Mo', 'Di', 'Mi', 'Do', 'Fr'],
      ['1', '08:00 - 08:45', 'Ma', '', '', '', ''],
    ];
    expect(periods(parseTimetableCsv(rows, DE_SUBJECTS).rows)[0]?.n).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Weekday names that mean different days in different languages
// ---------------------------------------------------------------------------
//
// The short forms schools write collide badly across languages, which is why a
// header row is scored one language at a time instead of against one big pile
// of tokens. Each of these is a case where the pile would be wrong.

describe('parseTimetableCsv, weekday names that collide across languages', () => {
  it('reads Danish "to" as Thursday on a Danish sheet', () => {
    const result = readTimetableCsv(
      ['Lektion,Tid,ma,ti,on,to,fr', '1,08:00 - 08:45,Ma,Deu,Eng,Sp,Bio'].join('\n'),
      DE_SUBJECTS,
    );
    expect(result.days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    // The "to" column is Thursday's, so Thursday's lesson is the one under it.
    expect(periods(result.rows)[0].cells.thu?.code).toBe('Sp');
  });

  it('does not read the German month "Mär" as Spanish Tuesday', () => {
    const result = readTimetableCsv(
      [
        'Monat,Jan,Mär,Apr,Mai,Jun,Jul',
        'Std,Zeit,Mo,Di,Mi,Do,Fr',
        '1,08:00 - 08:45,Ma,Deu,Eng,Sp,Bio',
      ].join('\n'),
      DE_SUBJECTS,
    );
    // The German row explains five days; the month row explains one, so it is
    // never mistaken for the header.
    expect(result.headerRow).toBe(1);
    expect(result.days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(periods(result.rows)[0].cells.tue?.code).toBe('Deu');
  });

  it('needs three weekday names before it calls a row the header', () => {
    const two = readTimetableCsv('Wer,Mo,Di\nLeon,Ma,Deu\n', DE_SUBJECTS);
    expect(two.headerRow).toBe(-1);
    expect(two.days).toEqual([]);

    const three = readTimetableCsv('Wer,Mo,Di,Mi\nLeon,Ma,Deu,Eng\n', DE_SUBJECTS);
    expect(three.headerRow).toBe(0);
    expect(three.days).toEqual(['mon', 'tue', 'wed']);
  });
});

// ---------------------------------------------------------------------------
// The example sheet the import screen hands out
// ---------------------------------------------------------------------------
//
// The download under public/ is the answer to "what is this supposed to look
// like?", so it is only worth having if this reader can actually read it. It
// is parsed here exactly as a downloaded tab would be, and every shape it is
// meant to demonstrate is asserted, so editing the file to show something new
// cannot quietly leave a household with an example that does not import.

describe('the sample sheet offered on the import screen', () => {
  const SAMPLE = readFileSync(
    path.resolve(__dirname, '../../../public/samples/timetable-example.csv'),
    'utf-8',
  );

  const grid = () => readTimetableCsv(SAMPLE, EN_SUBJECTS);

  it('finds the week under the line of instructions at the top', () => {
    const result = grid();
    // Row 0 tells whoever opens the file what to do, which is exactly the kind
    // of title a real school sheet carries above its grid.
    expect(result.headerRow).toBe(1);
    expect(result.days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
  });

  it('numbers every lesson row from its period column', () => {
    expect(periods(grid().rows).map((row) => row.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('reads the start and end out of the time column', () => {
    const first = periods(grid().rows)[0];
    expect(first.start).toBe('07:50');
    expect(first.end).toBe('08:35');
  });

  it('reads both named rows as breaks rather than lessons', () => {
    expect(grid().rows.filter((row) => row.kind === 'break')).toEqual([
      { kind: 'break', label: 'Break', start: '09:25', end: '09:45' },
      { kind: 'break', label: 'Lunch', start: '11:20', end: '12:00' },
    ]);
  });

  it('splits the room off the one cell that names one', () => {
    expect(periods(grid().rows)[0].cells.mon).toEqual({
      text: 'Math / A107',
      code: 'Math',
      subjectId: 'math',
      room: 'A107',
    });
  });

  it('leaves the blank cells out, because a blank cell is a free period', () => {
    const last = periods(grid().rows)[5];
    expect(last.cells.wed).toBeUndefined();
    expect(last.cells.fri).toBeUndefined();
    expect(last.cells.mon?.code).toBe('Geography');
  });

  it('matches the subjects a household already has and offers the rest', () => {
    const result = grid();
    expect(periods(result.rows)[0].cells.thu).toEqual({
      text: 'Math',
      code: 'Math',
      subjectId: 'math',
    });
    // Nothing in the example is silently dropped: a code the household does
    // not have comes back to be picked or added.
    expect(result.unknownCodes.map((code) => code.code).sort()).toEqual([
      'Biology',
      'Chemistry',
      'Geography',
      'Music',
    ]);
  });
});

/**
 * The reader has to hand the store something the store will take. A refusal is
 * not a local failure: the document is saved whole, so one bad cell costs the
 * household every other week in it, and on the hourly check it also costs the
 * "we looked" timestamp, which turns an hourly check into a per-poll one.
 */
describe('parseTimetableCsv, rows the store would refuse', () => {
  const header = ['Std', 'Zeit', 'Mo', 'Di', 'Mi', 'Do', 'Fr'];
  const subjects: TimetableSubject[] = [
    { id: 'ch', code: 'Ch', name: 'Chemie', color: '#43c07e', icon: 'flask' },
    { id: 'de', code: 'De', name: 'Deutsch', color: '#f26363', icon: 'book' },
  ];
  const periodRows = (rows: string[][]) =>
    parseTimetableCsv(rows, subjects).rows.filter((row) => row.kind === 'period');

  it('trims a room too long for the store instead of handing it one it refuses', () => {
    const rows = [header, ['1', '07:50-08:35', 'Chemie (Naturwissenschaftsraum)', '', '', '', '']];
    const cell = parseTimetableCsv(rows, subjects).rows[0];
    const room = cell.kind === 'period' ? cell.cells.mon?.room : undefined;
    expect(room).toBeDefined();
    expect(room!.length).toBeLessThanOrEqual(TIMETABLE_LIMITS.maxRoomLength);
    // Still says which room, rather than saying nothing.
    expect(room).toBe('Naturwissenschaf');
  });

  it('stops numbering at the highest period the store holds', () => {
    // A sheet with the grid at the top and a long tail of content rows under it
    // used to walk the continuation counter past 99, and the store then refused
    // the whole document over "a lesson in a period that is not numbered".
    const rows = [header, ...Array.from({ length: 140 }, () => ['', '', 'De', '', '', '', ''])];
    const numbers = periodRows(rows).map((row) => (row.kind === 'period' ? row.n : 0));
    expect(Math.max(...numbers)).toBeLessThanOrEqual(99);
    expect(numbers).toHaveLength(99);
  });

  it('leaves a nullte Stunde out rather than renumbering it onto first period', () => {
    const rows = [
      header,
      ['0', '07:00-07:45', 'Ch', '', '', '', ''],
      ['1', '07:50-08:35', 'De', '', '', '', ''],
    ];
    const rowsOut = periodRows(rows);
    // One row survives, and it is the one the sheet actually numbered: the 0th
    // hour cannot be stored, and renumbering it to 1 destroyed first period.
    expect(rowsOut).toHaveLength(1);
    expect(rowsOut[0].kind === 'period' && rowsOut[0].n).toBe(1);
    expect(rowsOut[0].kind === 'period' && rowsOut[0].cells.mon?.code).toBe('De');
  });

  it('never lets two rows claim one period', () => {
    const rows = [
      header,
      ['3', '', 'Ch', '', '', '', ''],
      ['3', '', 'De', '', '', '', ''],
    ];
    const rowsOut = periodRows(rows);
    expect(rowsOut).toHaveLength(1);
    // The first one stands; the duplicate used to overwrite it.
    expect(rowsOut[0].kind === 'period' && rowsOut[0].cells.mon?.code).toBe('Ch');
  });
});

describe('parseTimetableCsv, telling a header from a legend', () => {
  const subjects: TimetableSubject[] = [];

  it('keeps the grid under the real header when a legend spells the days out lower down', () => {
    // Spelt-out day names score higher than abbreviations, so a legend block
    // below the grid used to win - and everything above the chosen header row is
    // discarded, so the whole week went with it.
    const rows = [
      ['Std', 'Zeit', 'Mo', 'Di', 'Mi', 'Do', 'Fr'],
      ['1', '07:50-08:35', 'Ma', 'De', 'En', 'Bio', 'Ge'],
      ['2', '08:40-09:25', 'Ma', 'De', 'En', 'Bio', 'Ge'],
      [''],
      ['Legende', '', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'],
    ];
    const result = parseTimetableCsv(rows, subjects);
    expect(result.headerRow).toBe(0);
    expect(result.rows.filter((row) => row.kind === 'period')).toHaveLength(2);
    // And the legend itself is not read as a sixth lesson row whose subjects are
    // the words Montag through Freitag.
    expect(result.unknownCodes.map((code) => code.code)).not.toContain('Montag');
  });
});

describe('parseTimetableCsv, a break word in a teaching row', () => {
  const subjects: TimetableSubject[] = [
    { id: 'de', code: 'De', name: 'Deutsch', color: '#f26363', icon: 'book' },
  ];

  it('keeps the lessons in a row whose name happens to contain one', () => {
    // A "Mittagsband" is a midday band with teaching in it. Matching the break
    // word alone threw its five lessons away without even counting their codes.
    const rows = [
      ['Std', 'Zeit', 'Mo', 'Di', 'Mi', 'Do', 'Fr'],
      ['Mittagsband', '12:00-12:45', 'De', 'De', 'De', 'De', 'De'],
    ];
    const result = parseTimetableCsv(rows, subjects);
    const row = result.rows[0];
    expect(row.kind).toBe('period');
    expect(row.kind === 'period' && Object.keys(row.cells)).toHaveLength(5);
  });

  it('still reads a genuine break row, which has nothing in its day columns', () => {
    const rows = [
      ['Std', 'Zeit', 'Mo', 'Di', 'Mi', 'Do', 'Fr'],
      ['Mittagspause', '11:20-12:00', '', '', '', '', ''],
    ];
    const result = parseTimetableCsv(rows, subjects);
    expect(result.rows[0].kind).toBe('break');
  });
});
