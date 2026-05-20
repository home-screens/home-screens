/**
 * Convert numeric time to phrased text for the "word" and "fuzzy" clock views.
 *
 * Pure helpers — both `timeToWords` and `timeToFuzzy` accept a translator
 * function so the per-locale phrasing comes out of the i18n dictionary
 * (`modules.clock.word.*` / `modules.clock.fuzzy.*`) rather than English
 * arrays in this file. The view components bind the translator via
 * `useTranslate('modules')` and pass it in.
 *
 * ## Standalone vs compound numerals
 *
 * Some languages (notably German) inflect a numeral differently when it
 * appears inside a compound word vs when it appears on its own. For the
 * digit "1":
 *   - Standalone: German "eins" — "Es ist eins" (it is one).
 *   - Compound:   German "ein"  — "einundzwanzig" (twenty-one), NOT
 *                 "einsundzwanzig". Same vowel softens the same way as
 *                 English "twenty-one" vs the bare "one".
 *
 * To support that without baking locale knowledge into this helper, the
 * dictionary exposes two parallel keysets:
 *   - `clock.word.hours.<n>`         — used when the digit stands on its own
 *                                       (the bare hour, the bare minute 1–9
 *                                       when no tens are concatenated).
 *   - `clock.word.onesCompound.<n>`  — used as the `{ones}` slot of the
 *                                       `minuteJoin` template (21, 35, 47…).
 *
 * For locales where the two forms are identical (English, French, Spanish,
 * etc.), the dictionaries copy the same string into both keysets. For
 * German, only `<n> = 1` differs ("eins" standalone, "ein" compound).
 *
 * ## Standalone vs next hour in fuzzy templates
 *
 * Every fuzzy template receives BOTH `{hour}` (current 12-hour) and
 * `{next}` (the following 12-hour). Locales pick whichever they need:
 *   - English `halfPast` reads "half past {hour}"  — uses current.
 *   - German  `halfPast` reads "halb {next}"       — uses NEXT, because
 *     "halb drei" means 2:30, half-on-the-way-to-three.
 *
 * Keeping the helper locale-unaware (it always passes both) means new
 * locales can be added by editing only the JSON file.
 */

import type { TranslateFn } from '@/i18n/types';

/**
 * Build a spoken-form hour word from `modules.clock.word.hours.<n>`.
 * Falls back to the digit string if the dictionary entry is missing.
 *
 * Used for the bare hour ("Es ist drei Uhr") and for digit-only minute
 * lookups (1–9). Compound minutes (21, 35…) go through
 * `compoundOnesWord` instead so per-locale "ein/eins" inflection works.
 */
function hourWord(t: TranslateFn, h12: number): string {
  const w = t(`clock.word.hours.${h12}`);
  return w === `clock.word.hours.${h12}` ? String(h12) : w;
}

/**
 * Build the compound-context ones word from
 * `modules.clock.word.onesCompound.<n>`. Used only as the `{ones}` slot
 * of the `minuteJoin` template — see the file-header comment for why
 * this is separate from `hourWord`. Falls back to `hourWord` if the
 * compound-specific keyset is missing (so locales that haven't been
 * updated yet still produce something readable).
 */
function compoundOnesWord(t: TranslateFn, n: number): string {
  const key = `clock.word.onesCompound.${n}`;
  const w = t(key);
  if (w !== key) return w;
  return hourWord(t, n);
}

/**
 * Build a spoken-form minute word — handles 0–9 (looked up via the
 * hour map for digit names), 10–19 (special "teens" entries), and
 * 20/30/40/50 (tens). Other values combine tens+ones via the
 * `minuteJoin` template ("twenty-three" → "{tens}-{ones}" with
 * tens="twenty" and ones="three"; for German "einundzwanzig" via
 * "{ones}und{tens}").
 *
 * The compound `{ones}` slot uses `compoundOnesWord` so locales that
 * inflect "1" differently in compounds (German "ein" vs "eins") render
 * correctly without locale awareness in this helper.
 */
function minuteWord(t: TranslateFn, n: number): string {
  if (n === 0) return t('clock.word.minutes.0');
  if (n < 10) return hourWord(t, n);
  if (n < 20) return t(`clock.word.minutes.${n}`);
  const tens = Math.floor(n / 10) * 10;
  const ones = n % 10;
  if (ones === 0) return t(`clock.word.minutes.${tens}`);
  return t('clock.word.minuteJoin', {
    tens: t(`clock.word.minutes.${tens}`),
    ones: compoundOnesWord(t, ones),
  });
}

/**
 * Exact word time: "It is ten twenty-three" (en-US).
 */
export function timeToWords(t: TranslateFn, hours: number, minutes: number): string {
  const h12 = hours % 12 || 12;
  const hour = hourWord(t, h12);
  if (minutes === 0) return t('clock.word.oclock', { hour });
  return t('clock.word.atMinute', { hour, minute: minuteWord(t, minutes) });
}

/**
 * Fuzzy time: "almost half past two", "quarter to three" (en-US),
 * "halb drei", "viertel vor drei" (de-DE). Updates roughly every 5
 * minutes.
 *
 * Every template receives both `hour` (current 12-hour) and `next`
 * (the following 12-hour). Locales pick whichever produces natural
 * phrasing — English templates predominantly use `{hour}` for "past"
 * and `{next}` for "to"; German `halbPast` uses `{next}` because
 * "halb drei" means 2:30. See the file-header comment for the
 * rationale.
 */
export function timeToFuzzy(t: TranslateFn, hours: number, minutes: number): string {
  const h12 = hours % 12 || 12;
  const nextH12 = (hours + 1) % 12 || 12;
  const hour = hourWord(t, h12);
  const next = hourWord(t, nextH12);

  // Every template receives BOTH `{hour}` (always the current 12-hour)
  // and `{next}` (always the following 12-hour). Locales pick whichever
  // produces natural phrasing:
  //   - en-US "past" templates use `{hour}` (current).
  //   - en-US "to"   templates use `{next}` ("quarter to four" at 3:45).
  //   - de-DE `halfPast` uses `{next}` ("halb drei" at 2:30 → next = 3).
  // The helper itself stays locale-unaware — only the JSON file changes.
  if (minutes <= 2) return t('clock.fuzzy.oclock', { hour, next });
  if (minutes <= 7) return t('clock.fuzzy.justPast', { hour, next });
  if (minutes <= 12) return t('clock.fuzzy.tenPast', { hour, next });
  if (minutes <= 17) return t('clock.fuzzy.quarterPast', { hour, next });
  if (minutes <= 22) return t('clock.fuzzy.twentyPast', { hour, next });
  if (minutes <= 27) return t('clock.fuzzy.twentyFivePast', { hour, next });
  if (minutes <= 32) return t('clock.fuzzy.halfPast', { hour, next });
  if (minutes <= 37) return t('clock.fuzzy.twentyFiveTo', { hour, next });
  if (minutes <= 42) return t('clock.fuzzy.twentyTo', { hour, next });
  if (minutes <= 47) return t('clock.fuzzy.quarterTo', { hour, next });
  if (minutes <= 52) return t('clock.fuzzy.tenTo', { hour, next });
  if (minutes <= 57) return t('clock.fuzzy.almost', { hour, next });
  // The :58–:59 bucket reads as the NEXT hour ("It's three o'clock"
  // when the wall clock says 2:58). Both English and German use `{next}`
  // here.
  return t('clock.fuzzy.oclock', { hour: next, next });
}
