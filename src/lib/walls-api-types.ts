/** One wall as `GET /api/display/walls` describes it. */
export interface WallApiEntry {
  id: string;
  status: 'in' | 'waiting';
  /** The display it shows or asked for. Null on a hub with one display. */
  displayId: string | null;
  address: string;
  userAgent: string;
  viewport: { width: number; height: number } | null;
  lastSeenAt: number;
  createdAt: number;
  letInByItself: boolean;
  hubScreen: boolean;
  /**
   * Removed, it is let straight back in the next time it opens the wall: the
   * hub's own screen, or a browser on an allowed network while that lets
   * displays in without asking. Remove then only clears its entry.
   */
  comesBack: boolean;
  looksFamiliar: boolean;
}

export interface WallsApiResponse {
  passwordSet: boolean;
  windowOpen: boolean;
  windowEndsAt: number | null;
  showingCount: number;
  walls: WallApiEntry[];
}

/**
 * The walls the changeover let in with no click, which a grown-up should
 * check are theirs. The one count behind the note on Settings > Displays and
 * the warning under "Make a new key", so the two never disagree.
 */
export function wallsLetInByThemselves(walls: readonly WallApiEntry[]): WallApiEntry[] {
  return walls.filter((w) => w.status === 'in' && w.letInByItself);
}
