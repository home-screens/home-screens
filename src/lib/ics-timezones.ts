/**
 * Repair non-standard timezone IDs before an ICS document reaches node-ical.
 *
 * A `TZID` is supposed to name either a VTIMEZONE in the same document or an IANA
 * zone ("America/Edmonton"). Plenty of real feeds instead emit a bare abbreviation
 * ("MDT", "CST"), and node-ical handles those badly in two different ways:
 *
 *  - ICU still accepts the legacy Java three-letter zone IDs, so node-ical treats
 *    "CST" / "PST" / "AST" / "NST" as valid and hands them to Temporal, which
 *    forbids them and throws `RangeError: Forbidden ICU TimeZone`. That escapes
 *    `parseICS`, so one bad event discards the entire calendar.
 *  - Abbreviations ICU rejects outright ("MDT", "CDT", "EDT", "PDT") silently fall
 *    back to the hub's own local wall clock, putting events at the wrong instant
 *    with no error at all.
 *
 * ICU's guesses are not trustworthy here either: it reads "NST" as Pacific/Auckland
 * and "AST" as America/Anchorage.
 *
 * We resolve each such TZID ourselves and rewrite it in place. Where the document's
 * own VTIMEZONE declares two offsets it is telling us the zone observes DST, so we
 * resolve to a real IANA zone and let the tz database supply the transition dates.
 * Otherwise an abbreviation names a fixed offset by definition, and we rewrite it to
 * `UTC-0600` form, which node-ical parses exactly (including half-hour offsets such
 * as Newfoundland). Well-formed feeds come back untouched.
 */

/** Offset in minutes east of UTC for each abbreviation we are willing to claim. */
const ABBREVIATION_OFFSET_MINUTES: Record<string, number> = {
  // Newfoundland
  NST: -210,
  NDT: -150,
  // Atlantic
  AST: -240,
  ADT: -180,
  // Eastern (EST itself is a real tzdb zone, see SINGLE_NAME_ZONES)
  EDT: -240,
  // Central
  CST: -360,
  CDT: -300,
  // Mountain (MST itself is a real tzdb zone)
  MDT: -360,
  // Pacific
  PST: -480,
  PDT: -420,
  // Alaska
  AKST: -540,
  AKDT: -480,
  // Hawaii-Aleutian (HST itself is a real tzdb zone)
  HDT: -540,
  HAST: -600,
  HADT: -540,
  // Europe (CET/EET/WET themselves are real tzdb zones, see SINGLE_NAME_ZONES)
  WEST: 60,
  CEST: 120,
  EEST: 180,
  MSK: 180,
  // Africa
  WAT: 60,
  CAT: 120,
  SAST: 120,
  EAT: 180,
  // Asia
  IST: 330,
  ICT: 420,
  WIB: 420,
  SGT: 480,
  HKT: 480,
  PHT: 480,
  WITA: 480,
  KST: 540,
  JST: 540,
  WIT: 540,
  // Australia and New Zealand
  AWST: 480,
  ACST: 570,
  ACDT: 630,
  AEST: 600,
  AEDT: 660,
  NZST: 720,
  NZDT: 780,
};

// Where an abbreviation has more than one reading we take the one ICU and the old
// Java zone table took, because that is what feeds emitting abbreviations were
// written against: CST is North American Central rather than China or Cuba, and IST
// is India rather than Ireland or Israel. A feed that means otherwise can say so in
// its own VTIMEZONE, which wins over this table.
//
// Deliberately absent: BST (British Summer +1 vs Bangladesh +6), ART (Argentina -3 vs
// the Java table's Africa/Cairo +2), and AST's Arabia reading (+3). Those splits have
// no dominant answer, so they fall through to the floating-time fallback rather than
// trading a visible failure for a silent several-hour error.

/**
 * Short tzdb zone names that look like abbreviations but really are IANA zones.
 * node-ical resolves each of these to the right fixed offset already, so leave them
 * alone. Compared case-insensitively.
 */
const SINGLE_NAME_ZONES = new Set([
  'utc', 'gmt', 'uct', 'zulu',
  'est', 'mst', 'hst',
  'cet', 'eet', 'met', 'wet',
  'gb', 'nz', 'prc', 'roc', 'rok',
  'cuba', 'egypt', 'eire', 'iran', 'japan', 'libya',
]);

/**
 * `TZID=<value>` parameters, e.g. `DTSTART;TZID=CST:20260811T090000`.
 *
 * The value runs to the next parameter (`;`) or to the colon that starts the
 * property value, which always begins with a `YYYYMMDD` date. Anchoring on that
 * date matters: unquoted values legitimately contain colons of their own, as in
 * Microsoft's `TZID=tzone://Microsoft/Custom`.
 */
const TZID_PARAM = /(^|;)TZID=("?)([^;"\r\n]*?)\2(?=;|:\d{8})/gim;
/** `TZID:<value>` properties, which only appear inside a VTIMEZONE block. */
const TZID_PROPERTY = /^TZID:[ \t]*("?)([^"\r\n]+)\1[ \t]*$/gim;

/**
 * True when a TZID is a bare alphabetic abbreviation rather than a zone identifier
 * node-ical can be trusted with.
 */
function isBareAbbreviation(tzid: string): boolean {
  return /^[A-Za-z]{2,5}$/.test(tzid) && !SINGLE_NAME_ZONES.has(tzid.toLowerCase());
}

/** Every distinct TZID token used anywhere in the document. */
function collectTzids(icsText: string): Set<string> {
  const found = new Set<string>();
  for (const [, , , value] of icsText.matchAll(TZID_PARAM)) found.add(value.trim());
  for (const [, , value] of icsText.matchAll(TZID_PROPERTY)) found.add(value.trim());
  return found;
}

/** Parse a `TZOFFSETTO` value (`+HHMM`, `-HHMMSS`, `+HH:MM`) into minutes east of UTC. */
function parseOffsetToMinutes(raw: string): number | undefined {
  const match = raw.trim().match(/^([+-])(\d{2}):?(\d{2})(?::?\d{2})?$/);
  if (!match) return undefined;
  const [, sign, hours, minutes] = match;
  const total = Number(hours) * 60 + Number(minutes);
  if (!Number.isFinite(total) || total > 14 * 60) return undefined;
  return sign === '-' ? -total : total;
}

/** What a document's own VTIMEZONE block says about a zone. */
interface DeclaredZone {
  /** Set only when every subcomponent agrees on one offset (no DST). */
  single?: number;
  /** Offset of the STANDARD subcomponent, or the first one seen. */
  standard?: number;
  /** Offset of the DAYLIGHT subcomponent, when the block declares one. */
  daylight?: number;
  /** True when daylight time covers July, i.e. a northern-hemisphere zone. */
  northern?: boolean;
}

/** Offsets declared by the VTIMEZONE blocks in the document, keyed by TZID. */
function collectVtimezoneOffsets(icsText: string): Map<string, DeclaredZone> {
  const byTzid = new Map<string, DeclaredZone>();

  for (const block of icsText.split(/^BEGIN:VTIMEZONE[ \t]*$/im).slice(1)) {
    const body = block.split(/^END:VTIMEZONE[ \t]*$/im)[0];
    const tzid = body.match(/^TZID:[ \t]*"?([^"\r\n]+?)"?[ \t]*$/im)?.[1]?.trim();
    if (!tzid) continue;

    const offsets: number[] = [];
    let standard: number | undefined;
    let daylight: number | undefined;
    let daylightMonth: number | undefined;

    for (const sub of body.matchAll(/^BEGIN:(STANDARD|DAYLIGHT)[ \t]*$([\s\S]*?)^END:\1[ \t]*$/gim)) {
      const [, kind, subBody] = sub;
      const offset = parseOffsetToMinutes(subBody.match(/^TZOFFSETTO:[ \t]*(\S+)[ \t]*$/im)?.[1] ?? '');
      if (offset === undefined) continue;
      offsets.push(offset);
      if (kind.toUpperCase() === 'STANDARD') {
        standard ??= offset;
      } else {
        daylight ??= offset;
        // The month daylight time starts in tells us which hemisphere this is,
        // which matters because -04:00/-03:00 fits both Halifax and Santiago.
        daylightMonth ??= Number(
          subBody.match(/^RRULE:.*BYMONTH=(\d{1,2})/im)?.[1]
            ?? subBody.match(/^DTSTART:\d{4}(\d{2})/im)?.[1]
            ?? NaN,
        );
      }
    }
    if (!offsets.length) continue;

    byTzid.set(tzid, {
      single: offsets.every((o) => o === offsets[0]) ? offsets[0] : undefined,
      standard: standard ?? offsets[0],
      daylight,
      northern: Number.isFinite(daylightMonth) ? daylightMonth! >= 1 && daylightMonth! <= 6 : undefined,
    });
  }

  return byTzid;
}

/**
 * The IANA zone each abbreviation names, used when the document declares DST and we
 * therefore need real transition rules rather than a fixed offset. Standard and
 * daylight spellings both point at the same zone.
 */
const ABBREVIATION_ZONES: Record<string, string> = {
  NST: 'America/St_Johns', NDT: 'America/St_Johns',
  AST: 'America/Halifax', ADT: 'America/Halifax',
  EDT: 'America/New_York',
  CST: 'America/Chicago', CDT: 'America/Chicago',
  MDT: 'America/Denver',
  PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
  AKST: 'America/Anchorage', AKDT: 'America/Anchorage',
  HAST: 'America/Adak', HADT: 'America/Adak', HDT: 'America/Adak',
  WEST: 'Europe/Lisbon',
  CEST: 'Europe/Paris',
  EEST: 'Europe/Athens',
  AEST: 'Australia/Sydney', AEDT: 'Australia/Sydney',
  ACST: 'Australia/Adelaide', ACDT: 'Australia/Adelaide',
  NZST: 'Pacific/Auckland', NZDT: 'Pacific/Auckland',
};

/** Offset of `zone` at `date`, in minutes east of UTC. */
function zoneOffsetMinutes(zone: string, date: Date): number | undefined {
  let label: string | undefined;
  try {
    label = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value;
  } catch {
    return undefined;
  }
  if (!label) return undefined;
  if (label === 'GMT' || label === 'UTC') return 0;
  const match = label.match(/^(?:GMT|UTC)([+-])(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const [, sign, hours, minutes] = match;
  const total = Number(hours) * 60 + Number(minutes);
  return sign === '-' ? -total : total;
}

/** The winter/summer offsets a zone actually uses, as (standard, daylight, hemisphere). */
function zoneProfile(zone: string, year: number): DeclaredZone | undefined {
  const january = zoneOffsetMinutes(zone, new Date(Date.UTC(year, 0, 15)));
  const july = zoneOffsetMinutes(zone, new Date(Date.UTC(year, 6, 15)));
  if (january === undefined || july === undefined || january === july) return undefined;
  // Daylight time always moves the clock forward, so it is the larger offset.
  return {
    standard: Math.min(january, july),
    daylight: Math.max(january, july),
    northern: july > january,
  };
}

/** Lazily built index of every DST-observing zone the runtime knows, by offset profile. */
const zoneIndexByYear = new Map<number, Map<string, string[]>>();

function profileKey(standard: number, daylight: number, northern: boolean): string {
  return `${standard}|${daylight}|${northern}`;
}

function dstZoneIndex(year: number): Map<string, string[]> {
  const cached = zoneIndexByYear.get(year);
  if (cached) return cached;

  const index = new Map<string, string[]>();
  for (const zone of Intl.supportedValuesOf('timeZone')) {
    const profile = zoneProfile(zone, year);
    if (!profile) continue;
    const key = profileKey(profile.standard!, profile.daylight!, profile.northern!);
    const zones = index.get(key);
    if (zones) zones.push(zone);
    else index.set(key, [zone]);
  }
  // Sorted so an unrecognised abbreviation still resolves deterministically.
  for (const zones of index.values()) zones.sort();

  zoneIndexByYear.set(year, index);
  return index;
}

/**
 * Find a real IANA zone matching the DST profile the document declared.
 *
 * Preferring the abbreviation's own zone keeps the answer regionally right when
 * several zones share an offset profile; the index lookup is the fallback for names
 * we do not recognise. Returning a zone rather than an offset means transition dates
 * come from the runtime's tz database instead of being frozen at one offset.
 */
function resolveDeclaredDstZone(declared: DeclaredZone, abbreviation: string, year: number): string | undefined {
  const { standard, daylight, northern } = declared;
  if (standard === undefined || daylight === undefined || standard === daylight) return undefined;

  const matches = (zone: string): boolean => {
    const profile = zoneProfile(zone, year);
    return Boolean(
      profile
        && profile.standard === standard
        && profile.daylight === daylight
        && (northern === undefined || profile.northern === northern),
    );
  };

  const preferred = ABBREVIATION_ZONES[abbreviation];
  if (preferred && matches(preferred)) return preferred;

  // Without a hemisphere hint we cannot tell Halifax from Santiago, so try the
  // northern reading first — abbreviation-style feeds are overwhelmingly northern.
  for (const hemisphere of northern === undefined ? [true, false] : [northern]) {
    const candidate = dstZoneIndex(year).get(profileKey(standard, daylight, hemisphere))?.[0];
    if (candidate) return candidate;
  }
  return undefined;
}

/** Render minutes east of UTC as a TZID node-ical parses, e.g. `UTC-0330`. */
function offsetToTzid(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(2, '0')}`;
}

export interface IcsTimezoneNormalization {
  /** The ICS document, rewritten only if something needed repair. */
  text: string;
  /**
   * What each non-conforming TZID was replaced with. A `null` value means the zone
   * could not be resolved and the reference was dropped, leaving the event as
   * floating local time rather than taking the whole calendar down.
   */
  replacements: Map<string, string | null>;
}

/**
 * Rewrite non-conforming TZIDs in an ICS document to fixed-offset zones node-ical
 * can parse. Returns the input untouched when every TZID is already usable.
 */
export function normalizeIcsTimezones(
  icsText: string,
  referenceYear: number = new Date().getUTCFullYear(),
): IcsTimezoneNormalization {
  // Unfold first (RFC 5545 3.1), the same way node-ical does, so a TZID split across
  // a continuation line is still seen. Unfolded text parses identically downstream.
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');

  const suspect = [...collectTzids(unfolded)].filter(isBareAbbreviation);
  if (!suspect.length) return { text: icsText, replacements: new Map() };

  const vtimezones = collectVtimezoneOffsets(unfolded);
  const replacements = new Map<string, string | null>();

  for (const tzid of suspect) {
    // The document's own VTIMEZONE wins: it is what the TZID formally references,
    // and it disambiguates readings the abbreviation alone cannot (CST as China).
    const declared = vtimezones.get(tzid);
    const abbreviation = tzid.toUpperCase();

    // A VTIMEZONE carrying two offsets is the feed telling us this zone observes
    // DST. Collapsing that to one offset would put every event in the daylight half
    // of the year an hour out, so resolve to a real zone and let the tz database
    // supply the transitions.
    if (declared) {
      const zone = resolveDeclaredDstZone(declared, abbreviation, referenceYear);
      if (zone) {
        replacements.set(tzid, zone);
        continue;
      }
    }

    const table = ABBREVIATION_OFFSET_MINUTES[abbreviation];
    const minutes = declared ? declared.single ?? table ?? declared.standard : table;
    replacements.set(tzid, minutes === undefined ? null : offsetToTzid(minutes));
  }

  const text = unfolded
    .replace(TZID_PARAM, (match, lead: string, _quote: string, value: string) => {
      const replacement = replacements.get(value.trim());
      if (replacement === undefined) return match;
      // Dropping the parameter (and its separator) leaves a floating local time.
      return replacement === null ? '' : `${lead}TZID=${replacement}`;
    })
    .replace(TZID_PROPERTY, (match, _quote: string, value: string) => {
      const replacement = replacements.get(value.trim());
      if (replacement === undefined) return match;
      // A VTIMEZONE with no TZID can no longer be matched, which is what we want:
      // nothing downstream should try to resolve the unusable name again.
      return replacement === null ? '' : `TZID:${replacement}`;
    });

  return { text, replacements };
}
