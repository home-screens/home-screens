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
  looksFamiliar: boolean;
}

export interface WallsApiResponse {
  passwordSet: boolean;
  windowOpen: boolean;
  windowEndsAt: number | null;
  showingCount: number;
  walls: WallApiEntry[];
}
