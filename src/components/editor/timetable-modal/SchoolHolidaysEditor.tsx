'use client';

/**
 * Whose school holidays and public holidays close this school.
 *
 * It sits beside the dated days a school does differently because the two
 * answer the same question between them: these are the days that come in by
 * themselves, those are the days only the school knows about. And it belongs
 * to the school rather than to a module, because a school is in a place: a
 * household with children at schools in two states needs both to be right, and
 * one setting shared by every card on a wall can only ever be right about one
 * of them.
 */

import { useEffect, useId, useState } from 'react';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useEditorData } from '@/hooks/useEditorData';
import { useEditorStore } from '@/stores/editor-store';
import { useLocale, useTranslate } from '@/i18n';
import type {
  HolidayRegion,
  HolidayRegionsResult,
  LocalizedText,
  SchoolHolidaysResponse,
} from '@/lib/school-holidays';
import type { TimetableSchool } from '@/types/timetables';
import { PROSE_CLASS } from './prose';
import { hasValidLocation } from '@/lib/location';

/** The two messages the holiday lookup can attach to an answer. */
const HOLIDAY_MESSAGE_KEYS = ['schoolHolidaysStale', 'schoolHolidaysUnavailable'] as const;

/** Same rule the holiday API applies before it builds a URL. */
const COUNTRY_CODE = /^[A-Z]{2}$/;

/**
 * The two shapes the holiday API will turn into a request, a country on its
 * own and a country with a subdivision, so half a code on its way to being
 * typed is never looked up.
 */
const REGION_CODE = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

/**
 * The example the free-text box offers when the household's own region could
 * not be worked out. A real code, because "XX-YY" reads as something to copy.
 */
const EXAMPLE_REGION = 'DE-NW';

/** What the household's coordinates resolve to. */
interface ResolvedPlace {
  countryCode?: string;
  subdivisionCode?: string;
}

/**
 * Where the household is, remembered for the page session.
 *
 * The answer only changes when they move house, and the lookup leaves the
 * machine: walking through four schools in the rail used to be four live
 * geocoder queries. Remembering it also means the row is right on the first
 * render of every later school instead of resolving itself again in front of
 * the user.
 */
const placeCache = new Map<string, ResolvedPlace>();

/** Exported for tests. */
export function clearResolvedPlaceCache(): void {
  placeCache.clear();
}

/**
 * What the School holidays row is, and therefore what it may claim.
 *
 * One boolean used to stand for all of these and printed the same "try again
 * later" sentence for every one of them, which is true of exactly one: a
 * country nobody publishes school holidays for is not going to start, and
 * "later" cannot help a household whose country was never worked out.
 */
type HolidayState =
  /** The country's own regions are known, with school holiday dates behind them. */
  | 'list'
  /** The same list, but the country publishes no school dates: public holidays only. */
  | 'public-only'
  /** Still working out the country, or still asking about its regions. */
  | 'resolving'
  /** No country set, detected or in the display language: nothing to ask. */
  | 'no-country'
  /** No regions and no dates of any kind, so there is nothing to ask for. */
  | 'no-holidays'
  /** The lookup itself did not answer. */
  | 'failed';

/**
 * One of a row's names in the household's language, falling back to the
 * English one the API always carries. The picker is small enough that reaching
 * for the server-side helper would drag the whole holiday store into the
 * editor bundle.
 */
function pickName(names: LocalizedText[] | undefined, locale: string): LocalizedText | undefined {
  if (!names?.length) return undefined;
  const language = locale.split('-')[0].toUpperCase();
  return names.find((name) => name.language?.toUpperCase() === language)
    ?? names.find((name) => name.language?.toUpperCase() === 'EN')
    ?? names[0];
}

/** A region's name in the household's language. */
function regionName(names: LocalizedText[] | undefined, locale: string): string {
  return pickName(names, locale)?.text ?? '';
}

/**
 * What this country calls one of its regions, in the household's language: a
 * German household is asked about a Bundesland and a Spanish one about a
 * comunidad autónoma, rather than both being asked about an "area".
 *
 * The service's own casing is inconsistent ("federal state" but "Autonomous
 * community"), so the word is capitalized here and every sentence that carries
 * it leads with it. Putting it mid-sentence instead would need an article in
 * six of the seven shipped languages, and no one article fits both "das
 * Bundesland" and "die Region".
 */
function regionWord(category: LocalizedText[] | undefined, locale: string, fallback: string): string {
  const word = pickName(category, locale)?.text?.trim() || fallback;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * A country that publishes one set of school holidays for all of it and lists
 * no regions (Belgium, Luxembourg). Its own code is what the lookup takes, so
 * the country itself is the one thing there is to pick, rather than a code to
 * be guessed at in a text box.
 */
function countryAsRegion(country: string, locale: string): HolidayRegion {
  let label = country;
  try {
    label = new Intl.DisplayNames([locale], { type: 'region' }).of(country) ?? country;
  } catch {
    // An unknown code, or a runtime with no region table: the code still reads.
  }
  return { code: country, label, names: [], shortName: '' };
}

interface SchoolHolidaysEditorProps {
  school: TimetableSchool;
  onChange: (change: (school: TimetableSchool) => TimetableSchool) => void;
}

export default function SchoolHolidaysEditor({ school, onChange }: SchoolHolidaysEditorProps) {
  const t = useTranslate('editor');
  const locale = useLocale();
  const headingId = useId();

  const saved = school.holidayRegion ?? '';
  const set = (region: string | undefined) => onChange((current) => {
    const { holidayRegion: _cleared, ...rest } = current;
    return region ? { ...rest, holidayRegion: region } : rest;
  });

  // Where the household is, not what language the display is in. Deriving the
  // country from the locale meant a German household running the wall in English
  // asked about US school holidays, got nothing back, and was left with no
  // control at all to type DE-NW into.
  //
  // Three sources, best first: the country already set for public holidays, the
  // one the saved location resolves to, and only then the locale's own region as
  // a last guess.
  const holidayCountry = useEditorStore((state) => state.config?.settings?.calendar?.holidayCountry);
  const lat = useEditorStore((state) => state.config?.settings?.latitude);
  const lon = useEditorStore((state) => state.config?.settings?.longitude);
  const placeKey = !holidayCountry && hasValidLocation(lat, lon) ? `${lat},${lon}` : null;
  const cachedPlace = placeKey ? placeCache.get(placeKey) : undefined;
  const { data: fetchedPlace, error: placeError } = useEditorData<ResolvedPlace>(
    placeKey && !cachedPlace ? `/api/geocode?q=${encodeURIComponent(placeKey)}` : null,
  );
  useEffect(() => {
    if (placeKey && fetchedPlace) placeCache.set(placeKey, fetchedPlace);
  }, [placeKey, fetchedPlace]);
  const place = cachedPlace ?? fetchedPlace;
  // "Nothing back yet" has to be asked of the answer, not of the hook's
  // loading flag: that flag is false on the render which starts the request,
  // and reading it there made this row fall through to the display language
  // and look a German household's holidays up under US.
  const placePending = placeKey !== null && !place && !placeError;

  const country = placePending
    ? ''
    : [holidayCountry, place?.countryCode, locale.split('-')[1]]
      .map((value) => (typeof value === 'string' ? value.toUpperCase() : ''))
      .find((value) => COUNTRY_CODE.test(value)) ?? '';

  const regionsUrl = COUNTRY_CODE.test(country) ? `/api/timetables/holidays?country=${country}` : null;
  const { data: regionData, error: regionsError } = useEditorData<HolidayRegionsResult>(regionsUrl);
  // The previous country's answer lingers in the hook for one render after the
  // URL changes, so it only counts while it is about the country being asked
  // about now.
  const regionAnswer = regionData?.country === country ? regionData : null;
  // Whether a country has regions and whether it has school holiday dates are
  // two separate answers. Reading them as one threw Spain's nineteen regions
  // away over a missing school calendar and left a household typing a code the
  // row had already fetched.
  const subdivisions = regionAnswer?.subdivisions ?? [];
  const regions: HolidayRegion[] = subdivisions.length > 0
    ? subdivisions
    : regionAnswer?.hasSchoolHolidays
      ? [countryAsRegion(regionAnswer.country, locale)]
      : [];
  const hasList = regions.length > 0;

  const holidayState: HolidayState =
    placePending || (regionsUrl !== null && !regionAnswer && !regionsError)
      ? 'resolving'
      : regionsError
        ? 'failed'
        : regionsUrl === null
          ? 'no-country'
          : hasList
            ? (regionAnswer?.hasSchoolHolidays ? 'list' : 'public-only')
            : 'no-holidays';

  /** The country's own word for one of those regions, or a plain one. */
  const regionLabel = regionWord(
    regionAnswer?.regionCategory,
    locale,
    t('timetableModal.schools.holidayRegionWord'),
  );

  // What the saved region itself answered, which is where "these are the dates
  // we saved earlier" comes from. The route answers a map whatever it is asked
  // for, so the school's own region is read out of it by name.
  const { data: regionHolidays } = useEditorData<SchoolHolidaysResponse>(
    saved && REGION_CODE.test(saved)
      ? `/api/timetables/holidays?region=${encodeURIComponent(saved)}`
      : null,
  );
  const holidayMessage = HOLIDAY_MESSAGE_KEYS.find(
    (key) => key === regionHolidays?.regions?.[saved]?.messageKey,
  );

  const regionOptions = [
    { value: '', label: t('timetableModal.schools.holidaysNone') },
    ...regions.map((region) => ({
      value: region.code,
      label: regionName(region.names, locale) || region.label || region.code,
    })),
  ];
  // A region saved before the household moved, or while the lookup is down,
  // keeps its place in the list rather than being quietly reset to None.
  if (saved && !regionOptions.some((option) => option.value === saved)) {
    regionOptions.push({ value: saved, label: saved });
  }
  // The region the saved location resolves to, offered so nobody has to find
  // their own state on a list of sixteen.
  const suggestedRegion =
    place?.subdivisionCode && !regionOptions.some((option) => option.value === place.subdivisionCode)
      ? place.subdivisionCode
      : undefined;

  // Keystrokes stay in the box until it is left. Committing each one wrote
  // "D" on the first character of "de-nw", which turned the box into a
  // dropdown holding that one letter and threw the rest of the typing away.
  const [regionDraft, setRegionDraft] = useState(saved);
  const [lastRegion, setLastRegion] = useState(saved);
  if (saved !== lastRegion) {
    setLastRegion(saved);
    setRegionDraft(saved);
  }
  const commitRegion = () => {
    const next = regionDraft.trim().toUpperCase() || undefined;
    if (next !== school.holidayRegion) set(next);
  };

  // A region saved before the household moved, or carried in with an imported
  // document, still drives the wall. A country with nothing of its own gets no
  // control, which would leave that value stuck there for good, so the list
  // comes back for the one job of setting it to None.
  const strandedRegion = holidayState === 'no-holidays' && Boolean(saved);

  // One sentence per state, since only one of them can honestly ask for
  // another try. Nothing at all while it is still resolving: a message that
  // appears and is replaced half a second later reads as a fault.
  const HOLIDAY_NOTES: Record<HolidayState, string> = {
    list: t('timetableModal.schools.holidaysHelp', { area: regionLabel }),
    'public-only': t('timetableModal.schools.holidayPublicOnly', { area: regionLabel }),
    resolving: '',
    'no-country': t('timetableModal.schools.holidayNoCountry'),
    // Named from the section below's own heading, so the two cannot drift apart.
    'no-holidays': t('timetableModal.schools.holidayNoneForCountry', {
      section: t('timetableModal.specialDays.title'),
    }),
    failed: t('timetableModal.schools.holidayListFailed'),
  };

  return (
    // The state is on the row so a test can say which of the six it is looking
    // at without matching prose.
    <div className="space-y-2" data-holiday-state={holidayState}>
      <h3
        id={headingId}
        className="text-[10.5px] font-semibold uppercase tracking-wider text-hs-text-faint"
      >
        {t('timetableModal.schools.holidays')}
      </h3>

      {/* Which control this is turns on what the lookup answered, never on
          what is saved or typed: letting the value decide meant the control
          changed identity under the cursor the moment anything was typed into
          it. A region saved for another country is the one exception, and it
          cannot bring that back, because the state it appears in has no box to
          type into. Nothing at all where the country has neither regions nor
          dates: there is no code a household could type that would ever
          answer, and the sentence below says so. */}
      {hasList || strandedRegion ? (
        <select
          value={saved}
          aria-labelledby={headingId}
          onChange={(event) => set(event.target.value || undefined)}
          className={MODAL_INPUT_CLASS}
        >
          {regionOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : holidayState !== 'no-holidays' ? (
        /* No list to pick from: the lookup did not answer, or no country was
           worked out to ask about. Typing the code is still offered, because
           a bare sentence left a household whose country could not be worked
           out with no way to set a region at all. */
        <input
          type="text"
          value={regionDraft}
          aria-labelledby={headingId}
          disabled={holidayState === 'resolving'}
          placeholder={t('timetableModal.schools.holidayRegionPlaceholder', {
            example: suggestedRegion ?? EXAMPLE_REGION,
          })}
          onChange={(event) => setRegionDraft(event.target.value.toUpperCase())}
          onBlur={commitRegion}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
          className={`${MODAL_INPUT_CLASS} disabled:opacity-50`}
        />
      ) : null}

      {HOLIDAY_NOTES[holidayState] && (
        <p className={`${PROSE_CLASS} text-hs-text-faint`}>{HOLIDAY_NOTES[holidayState]}</p>
      )}
      {holidayMessage && (
        <p className={`${PROSE_CLASS} text-hs-text-faint`}>
          {t(`timetableModal.schools.holidayMessages.${holidayMessage}`)}
        </p>
      )}
    </div>
  );
}
