import { describe, it, expect } from 'vitest';
import { loadDict } from './helpers/dict';

/**
 * The house style of the English dictionaries, checked so new keys cannot
 * drift back: sentence case, "…" rather than "...", no "+ " typed at the start
 * of a label (the button draws a Plus icon), and "Back up" for the verb with
 * "backup" kept for the noun. `src/translations/GLOSSARY.md` has the words
 * themselves.
 *
 * Only en-US is checked. The other locales already write sentence case, and
 * each translates the English it is given.
 */

const NAMESPACES = ['core', 'editor', 'modules', 'remote', 'weather'] as const;

function strings(node: unknown, path: string, out: Array<[string, string]>) {
  if (typeof node === 'string') out.push([path, node]);
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) strings(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

function allValues(): Array<[string, string]> {
  return NAMESPACES.flatMap((ns) => {
    const dict = loadDict('en-US', ns);
    if (!dict) throw new Error(`no en-US ${ns} dictionary`);
    return strings(dict, '', []).map(([key, value]): [string, string] => [`${ns}:${key}`, value]);
  });
}

/** Names, not words: module type names, template names and the moon's phases. */
const NAME_KEYS = [
  /^editor:registry\.types\./,
  /^editor:templatePicker\.templates\.[^.]+\.name$/,
  /^modules:[a-z-]+\.name$/,
  /^modules:moon-phase\.phases\./,
  /^modules:fullscreen-weather\.moon\./,
];

/** Capitalised wherever they appear. Matched before the words are split. */
const PROPER_PHRASES = [
  'Home Screens', 'Home Assistant', 'Google Calendar', 'Google Photos', 'Google Sheets', 'Google Sheet', 'Google Maps',
  'Google Cloud Console', 'iCloud Calendar', 'Apple Calendar', 'Met Office', 'Environment Canada', 'Pirate Weather',
  'Visual Crossing', 'Dark Sky', 'Font Awesome', 'Ken Burns', 'Van Gogh', 'Dutch Golden Age', 'Picture of the Day',
  'Public Website', 'Most Compatible', 'Raspberry Pi', 'Open-Meteo', 'OpenWeatherMap',
  // Settings page names, written as the sidebar writes them.
  'Pictures & videos', 'Location & language',
];

const PROPER_WORDS = new Set([
  'Google', 'iCloud', 'Apple', 'iPhone', 'iPad', 'Mac', 'macOS', 'Windows', 'Linux', 'Mealie', 'Todoist', 'OneDrive',
  'Immich', 'Unsplash', 'NASA', 'Wi-Fi', 'Pi', 'Chromium', 'Chrome', 'Firefox', 'Safari', 'YouTube', 'ESPN', 'GitHub',
  'Garmin', 'Strava', 'Celsius', 'Fahrenheit', 'Microsoft', 'DataHub', 'TomTom', 'Vite', 'CoinGecko', 'OpenStreetMap',
  'OpenHolidays', 'Wikipedia', 'Unicode', 'WeatherAPI', 'NOAA', 'SMHI', 'LibreWXR', 'RainViewer', 'Markdown', 'CalDAV',
  'WebDAV', 'iCal', 'Outlook', 'Bluetooth', 'HDMI', 'Docker', 'English', 'Norway', 'Nordic', 'Dutch', 'Monet', 'Claude',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec',
  'Ctrl', 'Cmd', 'Enter', 'Esc', 'Escape', 'Shift', 'Alt', 'Option', 'Tab',
  'NFL', 'NBA', 'MLB', 'NHL', 'MLS', 'WNBA', 'NCAA', 'UEFA', 'FIFA', 'I', 'OK',
]);

/** Kept capitalised on purpose, each for the reason given. */
const CAPITALS_KEPT: Record<string, string> = {
  'editor:settings.dataPage.autoBackup.keys.setEditorPassword': 'names the Security page',
  'editor:settings.securityPage.grownUpPointerSuffix': 'names the Family page',
  'editor:timetableModal.rail.footerLink': 'names the Family page',
  'editor:timetableModal.fromFamily': 'names the Family page',
  'editor:timetableModal.import.addPerson': 'names the Family page',
  'editor:configSections.timetable.fromFamily': 'names the Family page',
  'editor:firstRun.steps.familyLink': 'names the Family page',
  'editor:firstRun.steps.passwordLink': 'names the Security page',
  'editor:configSections.fullscreen-calendar.themeDefault': 'names Settings',
  'editor:configSections.fullscreen-chore-chart.themeDefault': 'names Settings',
  'editor:configSections.fullscreen-meal-planner.themeDefault': 'names Settings',
  'editor:configSections.fullscreen-photo.themeDefault': 'names Settings',
  'editor:configSections.fullscreen-weather.themeDefault': 'names Settings',
  'editor:configSections.fullscreen-news.themeDefault': 'names Settings',
  'editor:configSections.weather.providers.global': 'names Settings',
  'editor:configSections.rain-map.rainLikely.edit': 'names the Conditions section of the panel',
  'editor:configSections.weather.showRelativeDayLabels': 'quotes the Today and Tmrw labels',
  'editor:settings.calendarPage.adding.fromContacts': "Apple's Contacts app",
  'editor:settings.integrationsPage.google.description': "Google's Calendar, Maps and Photos",
  'editor:settings.integrationsPage.microsoft.clientIdPlaceholder': "Microsoft's own field name, Application (client) ID",
  'editor:configSections.clock.formatWordsTitle': 'shows the capitalised format it offers',
  'editor:configSections.countdown.formatWordsTitle': 'shows the capitalised format it offers',
  'editor:configSections.todoist.filterProjectsPlaceholder': 'example project names',
  'editor:modals.icalFeeds.newFeedNamePlaceholder': 'example feed names',
  'editor:configSections.calendarRules.artNames.new-year': 'a holiday name',
  'editor:choreChartModal.title': 'the module name',
  'editor:mealPlannerModal.title': 'the module name',
  'modules:weather.highLow': 'H and L are abbreviations',
  'modules:notes.masthead': "the notes board's newspaper name",
  'remote:choresTab.goalLine.ariaLabel': 'names the Rewards view',
  'remote:mealsGrocery.openInLists': 'names the Lists tab',
  'remote:timers.waitForTap': 'names the Done button',
};

const isAcronym = (word: string) =>
  /^[A-Z0-9][A-Z0-9/&+-]*[A-Z0-9]s?$/.test(word) && /[A-Z]/.test(word) && word.replace(/s$/, '').length >= 2;

/**
 * The capitalised words in a 2 to 6 word value that sentence case writes in
 * lower case: any word past the start of a sentence, a line or a quote, and
 * the second half of a hyphenated or slashed word ("Full-Screen", "Since/Until").
 */
function titleCaseWords(value: string): string[] {
  let v = value;
  for (const phrase of PROPER_PHRASES) v = v.split(phrase).join('§');
  v = v.replace(/\{[^}]*\}/g, '§').replace(/`[^`]*`/g, '§').replace(/https?:\/\/\S+/g, '§');
  const words = v.trim().split(/\s+/).flatMap((w) => w.split(/(?<=\p{L})-(?=\p{L})/u)).filter((w) => /\p{L}/u.test(w));
  if (words.length < 2 || words.length > 6) return [];
  const hits: string[] = [];
  for (const line of v.split('\n')) {
    let start = true;
    for (const raw of line.trim().split(/\s+/).filter(Boolean)) {
      const opensQuote = /^[“"‘]/.test(raw);
      const word = raw.replace(/^[("“'‘¿¡«]+/, '').replace(/[)"”'’.,!?:;…»%]+$/, '');
      const atStart = start || opensQuote;
      start = /[.!?:]$/.test(raw) || /^[·|>→]$/.test(raw);
      if (!/\p{L}/u.test(word)) {
        if (atStart) start = true;
        continue;
      }
      if (/^(Cmd|Ctrl|Shift|Alt|Option)\+/.test(word)) continue;
      word.split(/(?<=[\p{L}\d])[-/](?=\p{L})/u).forEach((part, i) => {
        if (i === 0 && atStart) return;
        if (!/^\p{Lu}/u.test(part)) return;
        const bare = part.replace(/['’]s$/, '');
        if (bare === '§' || PROPER_WORDS.has(bare) || PROPER_WORDS.has(word) || isAcronym(bare) || /^\p{Lu}$/u.test(bare)) return;
        hits.push(part);
      });
    }
  }
  return hits;
}

describe('English casing', () => {
  it('spots Title Case and lets names through', () => {
    expect(titleCaseWords('Border Width')).toEqual(['Width']);
    expect(titleCaseWords('Full-Screen Views')).toEqual(['Screen', 'Views']);
    expect(titleCaseWords('Kid-Friendly')).toEqual(['Friendly']);
    expect(titleCaseWords('Open Google Photos')).toEqual([]);
    expect(titleCaseWords('Undo (Cmd+Z)')).toEqual([]);
    expect(titleCaseWords('Saved. Undo')).toEqual([]);
    expect(titleCaseWords('IP settings ({device})')).toEqual([]);
    expect(titleCaseWords('Turn on “Tap on the wall”')).toEqual([]);
    expect(titleCaseWords('A long sentence With Many Capital Words In It')).toEqual([]);
  });

  it('writes 2 to 6 word values in sentence case', () => {
    const offenders = allValues()
      .filter(([id]) => !NAME_KEYS.some((r) => r.test(id)) && !(id in CAPITALS_KEPT))
      .flatMap(([id, value]) => {
        const hits = titleCaseWords(value);
        return hits.length ? [`${id}: "${value}" (${hits.join(', ')})`] : [];
      });
    expect(offenders).toEqual([]);
  });

  it('keeps no stale reason for a capital', () => {
    const values = new Map(allValues());
    const stale = Object.keys(CAPITALS_KEPT).filter((id) => !values.has(id) || titleCaseWords(values.get(id)!).length === 0);
    expect(stale).toEqual([]);
  });
});

/** "..." is only for the end of a URL or a key's shape, where it stands for the rest of it. */
const THREE_DOTS_KEPT = new Set([
  'editor:settings.integrationsPage.google.clientSecretPlaceholder',
  'editor:mealPlannerModal.detail.recipeUrlPlaceholder',
  'remote:mealForm.recipeUrlPlaceholder',
]);

describe('English punctuation', () => {
  it('writes an ellipsis as "…"', () => {
    const offenders = allValues().filter(([id, value]) => value.includes('...') && !THREE_DOTS_KEPT.has(id));
    expect(offenders).toEqual([]);
  });

  it('never leaves a button with nothing but "…"', () => {
    expect(allValues().filter(([, value]) => value.trim() === '…')).toEqual([]);
  });

  it('types no "+ " at the start of a label', () => {
    expect(allValues().filter(([, value]) => /^\+ ?\p{L}/u.test(value))).toEqual([]);
  });

  it('says "Back up" for the verb and keeps "backup" for the noun', () => {
    // A button that says just "Backup" is the verb; "backup" on its own ("Keep 1 backup") is the noun.
    const verb = /\bbackup (now|all|everything|your|this|these|it|them|my)\b|\b(to|will|can|please|you|we|then) backup\b/i;
    expect(allValues().filter(([, value]) => value.trim() === 'Backup' || verb.test(value))).toEqual([]);
  });
});
