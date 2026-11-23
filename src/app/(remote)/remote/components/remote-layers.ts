/**
 * The phone's stacking order for everything pinned over the page, bottom to
 * top, modelled on the wall's `DISPLAY_LAYERS`. A shell takes one of these
 * names, never a number, so two sheets can only disagree about their order by
 * being on different rungs.
 *
 * The rungs rank what is drawn at the top of the page. A sheet drawn inside
 * another overlay's markup (a confirm inside a form) is stacked inside that
 * overlay as well, so it can never fall behind the overlay it came from.
 * Sheets drawn at the end of the page (`portal`) rank against every page they
 * can be opened from, so they take the rung of the highest of those.
 */
export const REMOTE_LAYERS = {
  /** The page's own pinned bars: the tab bar, the Lists add bar, a tab's floating add button. */
  pageChrome: 50,
  /** Full-screen forms and pages opened from a tab: the chore form, the photo viewer. */
  form: 100,
  /** A sheet opened from a tab or from a form; also Settings and Send alert. */
  sheet: 200,
  /**
   * Anything opened over a sheet: a sheet from a sheet, the Family screen and
   * Your icons (both reached from Settings), the icon sheets, the all-done card.
   */
  sheetOverSheet: 300,
  /** A question asked over whatever is open: "Delete chore?", "Just this day or every time?". */
  confirm: 400,
  /** The grown-up code pad. It answers whatever asked for it, so it is over all of them. */
  grownUp: 500,
  /** The one-line toast, over everything, so an error is never painted under the sheet it is about. */
  toast: 600,
} as const;

export type RemoteLayer = keyof typeof REMOTE_LAYERS;
