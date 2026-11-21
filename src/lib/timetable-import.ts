/**
 * Reading a school timetable out of a Google Sheet.
 *
 * Schools hand out timetables as spreadsheets, so the fastest way into the
 * module is to let a household paste the link it already has instead of typing
 * a grid by hand. This file is the whole server side of that: work out what
 * was pasted, list the tabs, download one tab as CSV, and turn its rows into
 * periods, breaks and lessons. No route and no UI live here.
 *
 * Three rules shape it:
 *
 * - **The server builds every URL it fetches.** The pasted text is only ever
 *   read for an id and a tab number; nothing we fetch comes from it directly,
 *   so a link to somewhere else cannot send the hub there.
 * - **A tab is addressed by gid, never by name.** Google's older `gviz`
 *   endpoint answers a tab name it does not recognise with the *first* tab and
 *   a cheerful 200, which would quietly import the wrong child's week. `gviz`
 *   is not used here at all: on a real school timetable it also dropped 24 of
 *   54 rows and invented its own header row and data range.
 *   `export?format=csv&gid=` is the only reader.
 * - **No sentences.** Failures come back as message keys the editor looks up
 *   in the household's own language, the way a calendar feed check does.
 *
 * The tab list comes from an undocumented block in Google's no-JS fallback
 * page, one `items.push({ name, gid })` per tab, present on `htmlview` for a
 * normal share link and on `pubhtml` for a publish-to-web link. That is an
 * internal detail rather than an API, so the fields are read independently of
 * their order, and "the page was read but carried no tab list" is its own
 * outcome rather than a failure: the household can still paste one link per
 * tab, which is the same screen either way.
 */

import { parseCsv } from '@/lib/csv';
import { foldSheetCode } from '@/lib/timetable-codes';
import { fetchWithAllowedRedirects, type FetchRedirectFailure } from '@/lib/guarded-fetch';
import { TIMETABLE_LIMITS, type DayKey, type TimetableSubject } from '@/types/timetables';

// ---------------------------------------------------------------------------
// What the household pasted
// ---------------------------------------------------------------------------

/**
 * A sheet we know how to read.
 *
 * Google has two separate id namespaces and almost none of the endpoints are
 * shared between them, so which one this is decides every URL built below.
 * `gid` is filled in when the pasted link already pointed at one tab.
 */
export type SheetLink =
  | { kind: 'file'; spreadsheetId: string; gid?: string }
  | { kind: 'published'; publishId: string; gid?: string };

// `/d/e/<id>` is the publish-to-web namespace and has to be tested first: it
// also matches the file pattern, with "e" as the id. `/u/0/` turns up when the
// person is signed in to more than one Google account.
const PUBLISHED_ID_RE = /\/spreadsheets\/(?:u\/\d+\/)?d\/e\/([A-Za-z0-9_-]+)/;
const FILE_ID_RE = /\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)/;
// `#gid=` from a share link, `?gid=` from an export link, `&gid=` from either.
const GID_RE = /[?#&]gid=(-?\d+)/;

/**
 * Work out which sheet, and which tab, a pasted link points at.
 *
 * Accepts everything Google hands out: the share link with `#gid=`, the same
 * link with `?gid=`, the multi-account `/u/0/` form, and the publish-to-web
 * `/pub?output=csv` form. Returns null when the text is not a Google Sheets
 * link at all, which the caller turns into "we do not understand that link"
 * rather than a confusing "we could not find that sheet".
 */
export function parseSheetLink(text: string): SheetLink | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  // Text that names a host at all has to name Google's, over the web. Text
  // with no scheme still goes through the patterns below, so a bare path
  // works too.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.hostname !== 'docs.google.com') return null;
  }

  const gidMatch = GID_RE.exec(trimmed);
  const gid = gidMatch ? gidMatch[1] : undefined;

  const published = PUBLISHED_ID_RE.exec(trimmed);
  if (published) {
    return { kind: 'published', publishId: published[1], ...(gid ? { gid } : {}) };
  }

  const file = FILE_ID_RE.exec(trimmed);
  if (file) {
    return { kind: 'file', spreadsheetId: file[1], ...(gid ? { gid } : {}) };
  }

  return null;
}

/** The page that lists a sheet's tabs, for whichever id namespace this is. */
export function buildTabListUrl(link: SheetLink): string {
  return link.kind === 'published'
    ? `https://docs.google.com/spreadsheets/d/e/${encodeURIComponent(link.publishId)}/pubhtml`
    : `https://docs.google.com/spreadsheets/d/${encodeURIComponent(link.spreadsheetId)}/htmlview`;
}

/**
 * The canonical CSV export for one tab, built here rather than taken from the
 * pasted text. `gid` falls back to the tab the link itself named; with no tab
 * at all Google answers with whichever tab is first.
 */
export function buildExportUrl(link: SheetLink, gid?: string): string {
  const tab = gid ?? link.gid;
  if (link.kind === 'published') {
    const base = `https://docs.google.com/spreadsheets/d/e/${encodeURIComponent(link.publishId)}/pub?output=csv`;
    return tab === undefined
      ? `${base}&single=true`
      : `${base}&gid=${encodeURIComponent(tab)}&single=true`;
  }
  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(link.spreadsheetId)}/export?format=csv`;
  return tab === undefined ? base : `${base}&gid=${encodeURIComponent(tab)}`;
}

// ---------------------------------------------------------------------------
// Listing the tabs
// ---------------------------------------------------------------------------

/** One tab of a sheet. `gid` is the key; `name` is only ever shown. */
export interface SheetTab {
  name: string;
  gid: string;
}

const NAME_RE = /\bname:\s*"((?:[^"\\]|\\.)*)"/;
const GID_FIELD_RE = /\bgid:\s*"(-?\d+)"/;

const JS_ESCAPES: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
};

/** Turn the escapes in a JavaScript string literal back into their characters. */
function decodeJsString(raw: string): string {
  return raw.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, escape: string) => {
    if (escape[0] === 'u' || escape[0] === 'x') {
      return String.fromCharCode(parseInt(escape.slice(1), 16));
    }
    // Anything else stands for itself, which covers \" \\ \/ and \'.
    return JS_ESCAPES[escape] ?? escape;
  });
}

/**
 * Read the tab list out of a saved `htmlview` or `pubhtml` page.
 *
 * Fields are matched one at a time inside each `items.push({ ... })` call, so
 * Google reordering them or adding another one does not break the parse. Tabs
 * come back in the order the page lists them, which is the order they sit in
 * along the bottom of the sheet.
 *
 * An empty result is meaningful rather than empty-handed: the page was read
 * but carried no tab list, most likely because a cookie-consent page answered
 * instead. `fetchSheetTabs` reports that as its own outcome.
 */
export function parseTabs(html: string): SheetTab[] {
  // Built per call so a previous parse can never leave `lastIndex` behind.
  const itemRe = /items\.push\(\s*\{([\s\S]{0,2000}?)\}\s*\)/g;
  const tabs: SheetTab[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(html)) !== null) {
    const name = NAME_RE.exec(match[1]);
    const gid = GID_FIELD_RE.exec(match[1]);
    if (!name || !gid || seen.has(gid[1])) continue;
    seen.add(gid[1]);
    tabs.push({ name: decodeJsString(name[1]), gid: gid[1] });
  }
  return tabs;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/**
 * What went wrong, as the key of the sentence the editor shows. The wording
 * lives in the translations; keeping it out of here means a failure reads in
 * the household's own language and can be reworded without touching this file.
 */
export type TimetableImportMessageKey =
  /** The pasted text is not a Google Sheets link. */
  | 'linkNotUnderstood'
  /** Google has no sheet with that id: a typo, or the sheet was deleted. */
  | 'sheetNotFound'
  /** The sheet exists but is not shared with anyone who has the link. */
  | 'sheetNotShared'
  /** That tab is not in the sheet any more. */
  | 'tabNotFound'
  /** Nothing answered in time. */
  | 'sheetUnreachable'
  /** The download is larger than the importer will read. */
  | 'sheetTooBig';

export type SheetTabsResult =
  | { ok: true; tabs: SheetTab[] }
  /**
   * The sheet answered and the page was read, but it carried no tab list.
   * This is not a failure and must not be shown as one: the household pastes
   * one link per tab instead, on the same screen.
   */
  | { ok: false; reason: 'no-tab-list' }
  | { ok: false; reason: 'failed'; messageKey: TimetableImportMessageKey };

export type SheetCsvResult =
  | {
      ok: true;
      text: string;
      /** The tab's name, when the download named it. */
      tabName?: string;
    }
  | { ok: false; messageKey: TimetableImportMessageKey };

// A redirect off these hosts is how a sheet that is not shared shows up: the
// export bounces to accounts.google.com for a sign-in instead of answering.
const SHEET_HOSTS = ['docs.google.com', '*.googleusercontent.com'];

const FETCH_OPTIONS = {
  allowHosts: SHEET_HOSTS,
  // An export answers 307 to googleusercontent before it answers with rows;
  // the rest of the hops are slack.
  maxHops: 5,
  // A tab list is about 55 KB and a timetable a few KB, so anything near a
  // megabyte holds something other than a timetable.
  maxBytes: 1_000_000,
  timeoutMs: 15_000,
  // One retry, because a single slow answer from Google is common and cheap
  // to ask for again.
  retries: 1,
} as const;

function failureMessageKey(reason: FetchRedirectFailure): TimetableImportMessageKey {
  switch (reason) {
    case 'invalid-url':
      return 'linkNotUnderstood';
    // The only way off the allowlist is Google's sign-in redirect.
    case 'not-allowed':
      return 'sheetNotShared';
    case 'too-large':
      return 'sheetTooBig';
    default:
      return 'sheetUnreachable';
  }
}

/**
 * Map the HTTP result Google gave us. 401, 403 and 410 are all the same thing
 * to a household: the sheet is not shared. A sheet that was published and then
 * unpublished answers 401 rather than the 410 you would expect, so they are
 * read together. `badRequest` is what a 400 means for this particular request:
 * a tab list has no gid to get wrong, an export does.
 */
function httpMessageKey(
  status: number,
  badRequest: TimetableImportMessageKey,
): TimetableImportMessageKey | null {
  if (status >= 200 && status < 300) return null;
  if (status === 404) return 'sheetNotFound';
  if (status === 401 || status === 403 || status === 410) return 'sheetNotShared';
  if (status === 400) return badRequest;
  return 'sheetUnreachable';
}

function decodeBody(body: Uint8Array): string {
  return new TextDecoder('utf-8').decode(body);
}

/** True when what came back is a web page rather than the file we asked for. */
function looksLikeHtml(contentType: string, text: string): boolean {
  if (contentType.includes('text/html')) return true;
  return /^\s*(?:<!doctype\s+html|<html\b)/i.test(text.slice(0, 200));
}

/**
 * The tab's name as the download itself gives it.
 *
 * Google sends `content-disposition: attachment; filename="...";
 * filename*=UTF-8''...`, where the starred form is the one that survives
 * umlauts and accents; the plain one has them stripped out entirely, so the
 * starred one is read first. The filename is "<sheet title> - <tab name>.csv",
 * so the part after the last " - " is the tab. It is only ever displayed: the
 * gid stays the key, since a sheet title that itself contains " - " would
 * split in the wrong place.
 */
export function tabNameFromDisposition(header: string | null | undefined): string | undefined {
  if (!header) return undefined;

  let filename: string | null = null;
  const starred = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (starred) {
    try {
      filename = decodeURIComponent(starred[1].trim());
    } catch {
      filename = null;
    }
  }
  if (filename === null) {
    const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header);
    if (quoted) filename = quoted[1].trim();
    else {
      const bare = /filename\s*=\s*([^;]+)/i.exec(header);
      if (bare) filename = bare[1].trim();
    }
  }
  if (filename === null || filename === '') return undefined;

  const withoutExtension = filename.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const separator = withoutExtension.lastIndexOf(' - ');
  const name = (separator === -1 ? withoutExtension : withoutExtension.slice(separator + 3)).trim();
  return name === '' ? undefined : name;
}

/**
 * List a sheet's tabs, in the order they sit along the bottom of the sheet.
 * Never throws.
 */
export async function fetchSheetTabs(link: SheetLink): Promise<SheetTabsResult> {
  const result = await fetchWithAllowedRedirects(buildTabListUrl(link), FETCH_OPTIONS);
  if (!result.ok) {
    return { ok: false, reason: 'failed', messageKey: failureMessageKey(result.reason) };
  }

  // A tab list carries no gid, so a 400 here is not a missing tab.
  const statusKey = httpMessageKey(result.status, 'sheetNotFound');
  if (statusKey) return { ok: false, reason: 'failed', messageKey: statusKey };

  const tabs = parseTabs(decodeBody(result.body));
  if (tabs.length === 0) return { ok: false, reason: 'no-tab-list' };
  return { ok: true, tabs };
}

/**
 * Download one tab as CSV. Never throws.
 *
 * Passing a gid is what makes the result trustworthy: without one Google hands
 * back whichever tab is first, which would quietly import the wrong person's
 * week. A web page instead of a file means Google answered with its sign-in
 * screen, so an HTML body is treated exactly like a 401.
 */
export async function fetchSheetCsv(link: SheetLink, gid?: string): Promise<SheetCsvResult> {
  const result = await fetchWithAllowedRedirects(buildExportUrl(link, gid), FETCH_OPTIONS);
  if (!result.ok) return { ok: false, messageKey: failureMessageKey(result.reason) };

  const statusKey = httpMessageKey(result.status, 'tabNotFound');
  if (statusKey) return { ok: false, messageKey: statusKey };

  const text = decodeBody(result.body);
  if (looksLikeHtml(result.contentType, text)) return { ok: false, messageKey: 'sheetNotShared' };

  const tabName = tabNameFromDisposition(result.responseHeaders.get('content-disposition'));
  return tabName ? { ok: true, text, tabName } : { ok: true, text };
}

// ---------------------------------------------------------------------------
// Turning a grid of cells into a week
// ---------------------------------------------------------------------------

/** What one filled cell of the grid says. */
export interface ImportedCell {
  /** The cell exactly as the sheet wrote it, so a preview can show it back. */
  text: string;
  /** The subject part, with any room split off. */
  code: string;
  /** Set when the code already matches one of the household's subjects. */
  subjectId?: string;
  /** The room, when the cell named one. */
  room?: string;
}

/** One row of the grid: a numbered lesson, or a named break between lessons. */
export type ImportedRow =
  | {
      kind: 'period';
      n: number;
      start?: string;
      end?: string;
      /** Only the days that had something in them. A missing day is free. */
      cells: Partial<Record<DayKey, ImportedCell>>;
    }
  | { kind: 'break'; label: string; start?: string; end?: string };

/** A code the sheet uses that the household's subject list does not have. */
export interface ImportedCode {
  /** The code as the sheet spells it. */
  code: string;
  /** How many cells use it, so the busiest ones can be offered first. */
  count: number;
  /**
   * An existing subject it looks like, when one is close enough to offer.
   *
   * `confident` says whether the overlap is strong enough to be the answer as
   * well as the offer. A weak match is still shown - it is usually right, and
   * seeing it is what makes the question easy - but the import screen asks
   * rather than filling it in.
   */
  suggestion?: { subjectId: string; code: string; name: string; confident: boolean };
}

export interface ImportedTimetable {
  /** Which row the weekday names were found in, or -1 when there were none. */
  headerRow: number;
  /** The days that got a column, in the sheet's own left-to-right order. */
  days: DayKey[];
  /** The grid below the header, in sheet order. Empty when no header was found. */
  rows: ImportedRow[];
  /** Every unmatched code, most used first. */
  unknownCodes: ImportedCode[];
}

/**
 * Weekday names, kept one language at a time.
 *
 * Pooling every language into one list and taking the longest match looks
 * simpler and is quietly wrong on real sheets, because the short forms collide
 * across languages: Danish "to" is Thursday but also heads an English column
 * of end times, Spanish and French "mar" is Tuesday but German "Mär" is a
 * month. So a candidate row is scored once per language and the language that
 * explains the most of it wins, which means an English sheet is never read
 * with Danish abbreviations and a German one is never read with Spanish ones.
 */
const DAY_TOKENS: Record<string, Record<DayKey, readonly string[]>> = {
  en: {
    mon: ['mo', 'mon', 'monday'],
    tue: ['tu', 'tue', 'tues', 'tuesday'],
    wed: ['we', 'wed', 'wednesday'],
    thu: ['thu', 'thur', 'thurs', 'thursday'],
    fri: ['fr', 'fri', 'friday'],
  },
  de: {
    mon: ['mo', 'mon', 'montag'],
    tue: ['di', 'die', 'dienstag'],
    wed: ['mi', 'mit', 'mittwoch'],
    thu: ['do', 'don', 'donnerstag'],
    fri: ['fr', 'fre', 'freitag'],
  },
  fr: {
    mon: ['lu', 'lun', 'lundi'],
    tue: ['ma', 'mar', 'mardi'],
    wed: ['me', 'mer', 'mercredi'],
    thu: ['je', 'jeu', 'jeudi'],
    fri: ['ve', 'ven', 'vendredi'],
  },
  es: {
    mon: ['lu', 'lun', 'lunes'],
    tue: ['ma', 'mar', 'martes'],
    wed: ['mi', 'mie', 'miercoles'],
    thu: ['ju', 'jue', 'jueves'],
    fri: ['vi', 'vie', 'viernes'],
  },
  nl: {
    mon: ['ma', 'maa', 'maandag'],
    tue: ['di', 'din', 'dinsdag'],
    wed: ['wo', 'woe', 'woensdag'],
    thu: ['do', 'don', 'donderdag'],
    fri: ['vr', 'vrij', 'vrijdag'],
  },
  // Portuguese also numbers its weekdays: Monday is the second day, so a
  // header can read "2a" through "6a". Those tokens are only ever reached
  // through the ordinal indicator in `matchDayToken`.
  pt: {
    mon: ['seg', 'segunda', 'segundafeira', '2a'],
    tue: ['ter', 'terca', 'tercafeira', '3a'],
    wed: ['qua', 'quarta', 'quartafeira', '4a'],
    thu: ['qui', 'quinta', 'quintafeira', '5a'],
    fri: ['sex', 'sexta', 'sextafeira', '6a'],
  },
  da: {
    mon: ['ma', 'man', 'mandag'],
    tue: ['ti', 'tir', 'tirsdag'],
    wed: ['on', 'ons', 'onsdag'],
    thu: ['to', 'tor', 'torsdag'],
    fri: ['fr', 'fre', 'fredag'],
  },
};

/** One lookup per language, built once, so scoring a row is a map hit per cell. */
const DAY_TOKENS_BY_LANGUAGE: Map<string, Map<string, DayKey>> = new Map(
  Object.entries(DAY_TOKENS).map(([language, days]) => {
    const lookup = new Map<string, DayKey>();
    for (const [day, tokens] of Object.entries(days) as [DayKey, readonly string[]][]) {
      for (const token of tokens) lookup.set(token, day);
    }
    return [language, lookup];
  }),
);

/**
 * The words that make a row a break rather than a lesson. Unlike the weekday
 * names these are long enough not to collide across languages, so they are
 * pooled: a German sheet that writes "Lunch" is still read correctly. Checked
 * as substrings, so "Mittagspause" and "1. Pause" both count, and only ever
 * against the columns left of the first weekday.
 */
const BREAK_WORDS = [
  'pause', 'pauze', 'mittag', 'fruhstuck',
  'break', 'lunch', 'recess',
  'recre', 'descanso', 'almuerzo', 'comida', 'merienda',
  'dejeuner',
  'middag', 'intervalo', 'almoco',
  'frokost', 'frikvarter',
];

/** How far down the sheet to look for the weekday header before giving up. */
const HEADER_SCAN_ROWS = 25;
/**
 * How many weekday names a row needs before it counts as the header. Two is
 * one coincidence away from being wrong, and every real school week has at
 * least three days in it.
 */
const MIN_DAY_COLUMNS = 3;
/** A code has to share at least this much with a subject to be suggested. */
const MIN_SUGGESTION_SCORE = 2;

/**
 * A suggestion is only offered as the *answer* from this much overlap up.
 *
 * Two shared letters is enough to be worth showing and nowhere near enough to
 * accept unasked: "Ge" prefixes both Geografie and Geschichte, and the tiebreak
 * between them is name length, which is not knowledge. Below this the import
 * screen still shows the suggestion and still asks.
 */
const MIN_CONFIDENT_SUGGESTION_SCORE = 4;

/**
 * The period numbers the store will hold (`MAX_PERIOD_NUMBER` in
 * `timetable-data.ts`). A sheet is read here and saved there, so a row the
 * store would refuse must never leave this file: one refusal fails the whole
 * document, which costs the household every other week in it.
 */
const MIN_IMPORT_PERIOD = 1;
const MAX_IMPORT_PERIOD = 99;

const TIME_RANGE_RE = /(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/;
const CLOCK_RE = /^(\d{1,2})[:.](\d{2})$/;
/**
 * Between a subject and its room: a slash, a pipe, a middle dot, a comma, a
 * line break, or a dash with space around it. A bare dash is left alone so
 * "Wirtschaft-Politik" stays one subject.
 */
const CELL_SEPARATOR_RE = /\s*[/|·,]\s*|\s*\n\s*|\s+[-–—]\s+/;

/**
 * Codes and subject names are compared folded: case, accents, ß and spacing do
 * not count. The rule lives in `timetable-codes.ts` because the import screen
 * needs the same one and cannot import from this file, which reaches the
 * network.
 */
const fold = foldSheetCode;

/** Collapse runs of whitespace so a cell's own layout does not reach the UI. */
function tidy(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * A weekday name in this cell, in one language, with how specific the match
 * was. "Mo.", "MO" and "Mo 12.09." all reduce to the same token.
 */
function matchDayToken(cell: string, lookup: Map<string, DayKey>): { day: DayKey; length: number } | null {
  const folded = fold(cell);
  if (folded === '') return null;
  const candidates = new Set<string>();
  // The whole cell as letters, which drops a date written beside the day.
  candidates.add(folded.replace(/[^a-z]/g, ''));
  candidates.add(folded.split(' ')[0].replace(/[^a-z]/g, ''));
  // A Portuguese ordinal weekday. The indicator has to be there, so a class
  // called "2a" is never read as Monday.
  const ordinal = /^\s*([2-6])\s*[ªº]/.exec(cell);
  if (ordinal) candidates.add(`${ordinal[1]}a`);

  for (const candidate of candidates) {
    if (candidate === '') continue;
    const day = lookup.get(candidate);
    if (day) return { day, length: candidate.length };
  }
  return null;
}

/** Which column each day took in one row, read in one language. */
function readDayColumns(
  row: string[],
  lookup: Map<string, DayKey>,
): Map<DayKey, { column: number; length: number }> {
  const byDay = new Map<DayKey, { column: number; length: number }>();
  row.forEach((cell, column) => {
    const hit = matchDayToken(cell, lookup);
    if (!hit) return;
    const held = byDay.get(hit.day);
    // Within one language a longer token is the more specific one, so a sheet
    // that writes both "Mo" and "Montag" settles on the spelt-out column.
    if (held && held.length >= hit.length) return;
    byDay.set(hit.day, { column, length: hit.length });
  });
  return byDay;
}

/**
 * The best reading of one candidate row: the language that explains most of it.
 *
 * Specificity decides between languages for the *same* row, which is what it is
 * for: it prefers the sheet's real language over one that only matched a couple
 * of two-letter abbreviations by chance.
 */
function readHeaderRow(row: string[]): { columns: Map<number, DayKey>; days: number } | null {
  let best: { columns: Map<number, DayKey>; days: number; specificity: number } | null = null;
  for (const lookup of DAY_TOKENS_BY_LANGUAGE.values()) {
    const byDay = readDayColumns(row, lookup);
    if (byDay.size < MIN_DAY_COLUMNS) continue;
    let specificity = 0;
    for (const held of byDay.values()) specificity += held.length;
    if (best && (best.days > byDay.size || (best.days === byDay.size && best.specificity >= specificity))) {
      continue;
    }
    const columns = new Map<number, DayKey>();
    for (const [day, held] of byDay) columns.set(held.column, day);
    best = { columns, days: byDay.size, specificity };
  }
  return best ? { columns: best.columns, days: best.days } : null;
}

/**
 * Find the header row and which column holds which day.
 *
 * Across rows the *earliest* row that explains the most days wins, and
 * specificity is deliberately not consulted here. A timetable often carries a
 * legend or a second block below the grid whose day names are spelt out in
 * full, and spelt-out names always score higher than the abbreviations a real
 * header uses. Letting that win made the grid above it disappear: everything
 * over the header row is discarded, so the whole week went with it.
 */
function findHeader(rows: string[][]): { row: number; columns: Map<number, DayKey> } | null {
  let best: { row: number; columns: Map<number, DayKey>; days: number } | null = null;
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS);
  for (let index = 0; index < limit; index++) {
    const read = readHeaderRow(rows[index]);
    if (!read) continue;
    // Strictly more days to beat a row that came first.
    if (best && best.days >= read.days) continue;
    best = { row: index, columns: read.columns, days: read.days };
  }
  return best ? { row: best.row, columns: best.columns } : null;
}

function clock(hour: string, minute: string): string | null {
  const h = Number(hour);
  const m = Number(minute);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Take the clock times out of a cell so what is left can be read as a label. */
function stripTimes(value: string): string {
  return tidy(
    value
      .replace(/(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/g, ' ')
      .replace(/\b\d{1,2}[:.]\d{2}\b/g, ' '),
  );
}

/**
 * The start and end of a row, from either "08:00 - 08:45" in one cell or a
 * start column and an end column next to each other.
 */
function readTimes(left: string[]): { start?: string; end?: string } {
  for (const cell of left) {
    const range = TIME_RANGE_RE.exec(cell);
    if (!range) continue;
    const start = clock(range[1], range[2]);
    const end = clock(range[3], range[4]);
    if (start && end) return { start, end };
  }
  const clocks: string[] = [];
  for (const cell of left) {
    const one = CLOCK_RE.exec(cell.trim());
    if (!one) continue;
    const value = clock(one[1], one[2]);
    if (value) clocks.push(value);
  }
  const times: { start?: string; end?: string } = {};
  if (clocks.length > 0) times.start = clocks[0];
  if (clocks.length > 1) times.end = clocks[1];
  return times;
}

/**
 * The lesson number, once any clock times in the same cell are out of the way.
 *
 * A `0` is returned as a number rather than as "no number". Some schools run a
 * nullte Stunde before first period, and reading that row as unnumbered used to
 * hand it the continuation counter's next value, which was the real first
 * period's number: the 0th hour was lost and it overwrote period 1 on the way
 * out. The caller decides what to do with a period it cannot store; what it
 * must not do is mistake it for a row that never had a number.
 */
function readPeriodNumber(left: string[]): number | null {
  for (const cell of left) {
    const match = /^(\d{1,2})\b/.exec(stripTimes(cell));
    if (!match) continue;
    return Number(match[1]);
  }
  return null;
}

function hasBreakWord(cell: string): boolean {
  const folded = fold(cell);
  return BREAK_WORDS.some((word) => folded.includes(word));
}

/**
 * A room as the store will take it.
 *
 * The store caps rooms at `TIMETABLE_LIMITS.maxRoomLength` and refuses the whole
 * document over a longer one, and a sheet writes whatever the school calls the
 * place: "Chemie (Naturwissenschaftsraum)" is an ordinary cell and its room half
 * is 22 characters. Refusing the document was the worst of the options, because
 * it also aborted the hourly check's write, which meant no timetable recorded
 * that it had been looked at and every wall poll started another round of
 * downloads. A room trimmed to fit still says which room; a week nobody can save
 * says nothing.
 */
function fitRoom(room: string): string | undefined {
  const trimmed = room.trim();
  if (trimmed === '') return undefined;
  return trimmed.length > TIMETABLE_LIMITS.maxRoomLength
    ? trimmed.slice(0, TIMETABLE_LIMITS.maxRoomLength).trim()
    : trimmed;
}

/** Split "Ma / A107", "Ma (A107)" and "Ma" into a subject and maybe a room. */
function splitCellText(text: string): { code: string; room?: string } {
  const compact = text.replace(/\s*\n\s*/g, '\n').trim();

  const bracketed = /^(.+?)\s*[([]([^()[\]]+)[)\]]\s*$/.exec(compact);
  if (bracketed) {
    const code = tidy(bracketed[1]);
    const room = fitRoom(tidy(bracketed[2]));
    if (code !== '') return room === undefined ? { code } : { code, room };
  }

  const parts = compact
    .split(CELL_SEPARATOR_RE)
    .map(tidy)
    .filter((part) => part !== '');
  // Anything past the room is a teacher or a note, which the importer does
  // not carry.
  if (parts.length >= 2) {
    const room = fitRoom(parts[1]);
    return room === undefined ? { code: parts[0] } : { code: parts[0], room };
  }
  if (parts.length === 1) return { code: parts[0] };
  return { code: tidy(compact) };
}

/** The household subject this code already names, by short code or by name. */
function matchSubject(code: string, subjects: TimetableSubject[]): TimetableSubject | undefined {
  const key = fold(code);
  if (key === '') return undefined;
  return (
    subjects.find((subject) => fold(subject.code) === key) ??
    subjects.find((subject) => fold(subject.name) === key)
  );
}

/** How much two strings share from the start, when one begins with the other. */
function prefixScore(a: string, b: string): number {
  if (a === '' || b === '') return 0;
  if (!a.startsWith(b) && !b.startsWith(a)) return 0;
  return Math.min(a.length, b.length);
}

/**
 * The closest existing subject to an unknown code, so "Info" can offer
 * Informatik instead of adding a second subject that means the same thing.
 * Nothing close enough gets no suggestion, and the editor offers to add it.
 */
function suggestSubject(
  code: string,
  subjects: TimetableSubject[],
): { subject: TimetableSubject; score: number } | undefined {
  const key = fold(code);
  if (key.length < MIN_SUGGESTION_SCORE) return undefined;
  let best: { subject: TimetableSubject; score: number } | undefined;
  for (const subject of subjects) {
    const score = Math.max(
      prefixScore(key, fold(subject.code)),
      prefixScore(key, fold(subject.name)),
    );
    if (score < MIN_SUGGESTION_SCORE) continue;
    if (best) {
      if (best.score > score) continue;
      // On a tie the shorter name wins, so "Info" offers Informatik rather
      // than Informationstechnik.
      if (best.score === score && best.subject.name.length <= subject.name.length) continue;
    }
    best = { subject, score };
  }
  return best;
}

interface UnknownTally {
  code: string;
  count: number;
  order: number;
}

function readCell(
  text: string,
  subjects: TimetableSubject[],
  unknown: Map<string, UnknownTally>,
): ImportedCell {
  const { code, room } = splitCellText(text);
  const subject = matchSubject(code, subjects);
  if (subject) {
    return { text, code, subjectId: subject.id, ...(room ? { room } : {}) };
  }
  const key = fold(code);
  const tally = unknown.get(key);
  if (tally) tally.count += 1;
  else unknown.set(key, { code, count: 1, order: unknown.size });
  return { text, code, ...(room ? { room } : {}) };
}

/**
 * Turn the rows of one tab into periods, breaks and lessons.
 *
 * School timetables are not standardised, so this reads what is there rather
 * than insisting on a layout: it finds the weekday header wherever it sits,
 * treats the columns left of the first weekday as the period and time columns,
 * and reads everything below the header as rows. A row is a break when a left
 * column says so, a numbered period when a left column holds an integer, and
 * otherwise simply the next period in order, which keeps a sheet that leaves
 * the number off a continuation row readable.
 *
 * Nothing is matched to the household's subjects by guesswork: a code either
 * already exists, by short code or by full name, or it comes back as unknown
 * with a suggestion the editor can accept or decline.
 */
export function parseTimetableCsv(
  rows: string[][],
  subjects: TimetableSubject[],
): ImportedTimetable {
  const header = findHeader(rows);
  if (!header) return { headerRow: -1, days: [], rows: [], unknownCodes: [] };

  const columns = [...header.columns.entries()].sort((a, b) => a[0] - b[0]);
  const days = columns.map(([, day]) => day);
  const firstDayColumn = columns[0][0];

  const parsed: ImportedRow[] = [];
  const unknown = new Map<string, UnknownTally>();
  let lastPeriod = 0;

  const used = new Set<number>();

  for (let index = header.row + 1; index < rows.length; index++) {
    const row = rows[index];
    const left = row.slice(0, firstDayColumn).map((cell) => cell.trim());
    const times = readTimes(left);

    // A row that reads as a header is a repeated header or a legend, not a
    // lesson. Sheets put both below the grid, and its day names would otherwise
    // be read as five subject codes the household is then asked to explain.
    // Checked before the cells, because reading them is what tallies a code.
    if (readPeriodNumber(left) === null && readHeaderRow(row)) continue;

    // The day columns are read first, because whether this row is a break is
    // partly a question about them. A break word is matched as a substring, and
    // schools put lessons in rows whose name contains one: a "Mittagsband" is a
    // midday band with teaching in it. Taking the word alone as the answer threw
    // the row's five lessons away without so much as counting their codes.
    const cells: Partial<Record<DayKey, ImportedCell>> = {};
    let filled = 0;
    for (const [column, day] of columns) {
      const text = (row[column] ?? '').trim();
      if (text === '') continue;
      cells[day] = readCell(text, subjects, unknown);
      filled += 1;
    }

    const breakCell = left.find((cell) => cell !== '' && hasBreakWord(cell));
    if (breakCell !== undefined && filled === 0) {
      parsed.push({ kind: 'break', label: stripTimes(breakCell), ...times });
      continue;
    }

    const numbered = readPeriodNumber(left);
    // A row with neither a number nor a lesson in it is a spacer.
    if (numbered === null && filled === 0) continue;


    // A period the store cannot hold is left out rather than renumbered onto
    // one it can: a nullte Stunde renumbered to 1 does not become first period,
    // it destroys it. The continuation counter is not advanced either, so the
    // rows after this one keep the numbers the sheet gave them.
    const n = numbered ?? lastPeriod + 1;
    if (n < MIN_IMPORT_PERIOD || n > MAX_IMPORT_PERIOD) continue;
    // Two rows claiming one period would silently overwrite, and the one that
    // lost would be the one the sheet actually numbered.
    if (used.has(n)) continue;
    used.add(n);
    lastPeriod = n;
    parsed.push({ kind: 'period', n, cells, ...times });
  }

  const unknownCodes: ImportedCode[] = [...unknown.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map((entry) => {
      const found = suggestSubject(entry.code, subjects);
      return found
        ? {
            code: entry.code,
            count: entry.count,
            suggestion: {
              subjectId: found.subject.id,
              code: found.subject.code,
              name: found.subject.name,
              confident: found.score >= MIN_CONFIDENT_SUGGESTION_SCORE,
            },
          }
        : { code: entry.code, count: entry.count };
    });

  return { headerRow: header.row, days, rows: parsed, unknownCodes };
}

// ---------------------------------------------------------------------------
// The whole read, in one call
// ---------------------------------------------------------------------------

/**
 * Caps for a downloaded tab. A timetable grid is tens of rows and a handful of
 * columns; these are loose enough for a sheet with notes underneath it and
 * tight enough that a spreadsheet of something else cannot cost much.
 */
const CSV_MAX_ROWS = 2000;
const CSV_MAX_COLUMNS = 64;

/**
 * Read downloaded CSV text as one person's week: the CSV reader's separator
 * sniffing and caps, then the grid mapping above. Callers that already hold
 * rows use `parseTimetableCsv` directly.
 */
export function readTimetableCsv(text: string, subjects: TimetableSubject[]): ImportedTimetable {
  const { rows } = parseCsv(text, { maxRows: CSV_MAX_ROWS, maxColumns: CSV_MAX_COLUMNS });
  return parseTimetableCsv(rows, subjects);
}
