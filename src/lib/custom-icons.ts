/**
 * Rules for the household's own icons: pictures a family uploads and then
 * picks anywhere an emoji is picked (meals, chores, rewards, people,
 * routines, and the editor's icon fields).
 *
 * A pick is stored in the same free-form icon string those fields already
 * hold, as `custom:<id>`, next to plain emoji, `fa:<style>:<name>` and
 * `lucide:<name>`. Pure and client-safe: the server store and every picker
 * validate against the constants here, so there is one rule.
 */

export const CUSTOM_ICON_PREFIX = 'custom:';

/** 12 lowercase base32 characters. Short enough that `custom:<id>` fits the
 *  32-character cap on a family member's emoji. */
export const CUSTOM_ICON_ID_RE = /^[a-z2-7]{12}$/;

/** Content hash naming the stored image file. */
export const CUSTOM_ICON_HASH_RE = /^[0-9a-f]{32}$/;

/** Longest edge of a stored icon. The fullscreen meal planner draws the
 *  Today hero at up to about 640 px on a 4K wall, so 512 stays sharp. */
export const ICON_EDGE_PX = 512;
/** Smaller edges tried, in order, when a moving picture comes out too big. */
export const ANIMATED_FALLBACK_EDGES = [384, 256] as const;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_ANIMATED_BYTES = 2 * 1024 * 1024;
export const MAX_STILL_BYTES = 1024 * 1024;
export const MAX_FRAMES = 300;
/** Largest source picture decoded, per side, before anything is resized. */
export const MAX_SOURCE_EDGE_PX = 4096;

export const MAX_ICONS = 300;
export const LIBRARY_BUDGET_BYTES = 60 * 1024 * 1024;

export const MAX_ICON_NAME_LENGTH = 32;

/** How long an uploaded picture waits for "Use this icon" before the server
 *  clears it. Covers a tab closed or killed mid-review, which no cleanup in
 *  the page can see. */
export const PENDING_TTL_MS = 60 * 60 * 1000;

export const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
/** For a file input's `accept`. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_MIME_TYPES.join(',');

export interface CustomIcon {
  id: string;
  name: string;
  /** Names the image file (`<hash>.webp`); changes only if the picture does. */
  hash: string;
  bytes: number;
  animated: boolean;
  /** Stored pixel size, for the review step's "very wide" and "very small"
   *  notes. Missing on icons stored before it was recorded. */
  width?: number;
  height?: number;
  /** A pending very wide or tall still picture's centre square, cut from the
   *  full-size original, for the review step's "Crop to a square". Dropped
   *  once the icon is kept. */
  square?: { hash: string; bytes: number; width: number; height: number };
  /** Uploaded but not yet kept: left out of every list and backup, and
   *  cleared after `PENDING_TTL_MS`. */
  pending?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomIconIndex {
  icons: CustomIcon[];
}

/** What `GET /api/custom-icons` hands every surface. */
export interface CustomIconEntry extends CustomIcon {
  url: string;
}

export interface CustomIconUsage {
  meals: string[];
  chores: string[];
  rewards: string[];
  people: string[];
  routines: string[];
  /** Screen settings (calendar icons, day badges, Text prefixes) using it. */
  screens: number;
}

/**
 * Machine-readable reasons an upload or edit is refused. Surfaces map each
 * to their own dictionary's wording; the server's `error` string is only a
 * fallback for callers that don't.
 */
export type CustomIconErrorCode =
  | 'too-big'
  | 'not-a-picture'
  | 'svg-drawing'
  | 'picture-too-large'
  | 'animation-too-big'
  | 'library-full'
  | 'budget-full'
  | 'bad-name'
  | 'not-found';

export const CUSTOM_ICON_ERROR_CODES: readonly CustomIconErrorCode[] = [
  'too-big', 'not-a-picture', 'svg-drawing', 'picture-too-large', 'animation-too-big',
  'library-full', 'budget-full', 'bad-name', 'not-found',
];

export function customIconValue(id: string): string {
  return `${CUSTOM_ICON_PREFIX}${id}`;
}

/** The id behind a stored value, or `null` when it isn't a well-formed
 *  `custom:` token (and so should render as the text it is). */
export function parseCustomIconValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed?.startsWith(CUSTOM_ICON_PREFIX)) return null;
  const id = trimmed.slice(CUSTOM_ICON_PREFIX.length);
  return CUSTOM_ICON_ID_RE.test(id) ? id : null;
}

export function isCustomIconValue(value: string | null | undefined): boolean {
  return parseCustomIconValue(value) !== null;
}

/** A trimmed, collapsed name within the limit, or `null` when empty. */
export function normalizeIconName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_ICON_NAME_LENGTH).trim();
  return name || null;
}

/** "grandmas-lasagna_final.PNG" -> "grandmas lasagna final". */
export function iconNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[-_.]+/g, ' ');
  return normalizeIconName(base) ?? 'Icon';
}

export type IconShapeWarning = 'wide' | 'tall' | 'tiny';

/**
 * Why a picture will look poor once it is drawn in an emoji-sized square:
 * a banner shrinks to a sliver (it read like the planner's empty-slot dash),
 * and a tiny icon is blown up into a blur. `null` for anything reasonable.
 */
export function iconShapeWarning(icon: { width?: number; height?: number }): IconShapeWarning | null {
  const { width, height } = icon;
  if (!width || !height) return null;
  if (width / height > 2) return 'wide';
  if (height / width > 2) return 'tall';
  if (Math.max(width, height) < 64) return 'tiny';
  return null;
}

/** Every `custom:` id mentioned anywhere inside a JSON-shaped value. */
export function collectCustomIconIds(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    const id = parseCustomIconValue(value);
    if (id) into.add(id);
  } else if (Array.isArray(value)) {
    for (const item of value) collectCustomIconIds(item, into);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectCustomIconIds(item, into);
  }
  return into;
}

/** Space the library takes on disk. Icons sharing a picture share its file,
 *  so each file counts once. */
export function libraryBytes(icons: readonly Pick<CustomIcon, 'bytes' | 'hash'>[]): number {
  const seen = new Set<string>();
  let sum = 0;
  for (const icon of icons) {
    if (seen.has(icon.hash)) continue;
    seen.add(icon.hash);
    sum += icon.bytes;
  }
  return sum;
}

/** "2.3 MB", "180 KB": the size shown on the backup switch and budget bar. */
export function formatIconBytes(bytes: number, locale?: string): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 0.1) {
    return `${mb.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
  }
  return `${(bytes > 0 ? Math.max(1, Math.round(bytes / 1024)) : 0).toLocaleString(locale)} KB`;
}
