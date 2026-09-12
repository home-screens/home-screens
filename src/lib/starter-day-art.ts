/**
 * The day art that ships with Home Screens, for calendar day-look rules.
 * Ten hand-tuned SVGs in `public/starter-day-art/`, served statically and
 * stored in `CalendarDayRule.backgroundImage` by path. The files are
 * committed (unlike the generated starter backgrounds); a unit test keeps
 * the catalog and the directory in sync so picker thumbnails and wall
 * render can never disagree.
 */

export interface StarterDayArt {
  /** Stable id; also the i18n key suffix under configSections.calendarRules.artNames. */
  id: string;
  /** File name under public/starter-day-art/. */
  file: string;
  /** The URL stored in CalendarDayRule.backgroundImage. */
  path: string;
}

export const STARTER_DAY_ART_DIR = 'public/starter-day-art';
/** URL prefix the files are served under. */
export const STARTER_DAY_ART_URL = '/starter-day-art';

const IDS = ['birthday', 'christmas', 'halloween', 'new-year', 'valentines', 'july-4th', 'celebrate', 'starfield', 'snowflakes', 'sprinkles'] as const;

const entry = (id: (typeof IDS)[number]): StarterDayArt => ({
  id,
  file: `${id}.svg`,
  path: `${STARTER_DAY_ART_URL}/${id}.svg`,
});

export const STARTER_DAY_ART: StarterDayArt[] = IDS.map(entry);

/** The stored path for a catalog id, or undefined for an unknown id. */
export function starterDayArtPath(id: string): string | undefined {
  return STARTER_DAY_ART.find((a) => a.id === id)?.path;
}
