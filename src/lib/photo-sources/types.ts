import type { MediaListItem, SlideshowMediaTypes } from '@/types/config';
import type { PhotoSourceKind, PhotoSourceOf, PickImportKind } from '@/lib/photo-source';
import type { PictureImportResult } from '@/lib/library-import';

/**
 * The one interface every photo source answers, built like the weather
 * providers (src/lib/weather/): the routes and the background rotation ask a
 * source through this and never branch on its kind.
 */

export interface ListArgs<K extends PhotoSourceKind> {
  source: PhotoSourceOf<K>;
  /** Pictures per refresh, already clamped. Sources without a count ignore it. */
  count: number;
  /** Which media the wall wants. Sources that can't play video answer pictures only. */
  media: SlideshowMediaTypes;
}

export interface PickArgs<K extends PhotoSourceKind> {
  source: PhotoSourceOf<K>;
  /** The screen's canvas, so a download can be shaped like the wall. */
  canvas: { w: number; h: number };
  /** The library path or rotation id shown now, which a fresh pick avoids when it can. */
  previous?: string;
}

/**
 * One still picture for a rotating background: a file already in the
 * library (served as it is, no copy), or a download the rotation saves as
 * `rotation-<kind>-<id>` through the capped writer.
 */
export type PickedPicture =
  | { kind: 'library'; path: string }
  | { kind: 'download'; id: string; open: () => Promise<Response> }
  /** A picture the wall already has at a public path (a bundled wall): shown as it is. */
  | { kind: 'static'; path: string };

export interface BrowseArgs {
  /** The sidebar entry: `all`, `favorites`, `album:<id>`, `person:<id>`, `apod`, ... */
  collection: string;
  /** 1-based page. */
  page: number;
  /** Search words, for sources that search. */
  query?: string;
  /** The wall's shape, for sources that can prefer pictures shaped like it. */
  orientation?: 'portrait' | 'landscape';
  /** For the `picked` collection: the photos to look up, so picks can be shown as tiles. */
  refs?: string[];
}

/** One tile in the picker's grid. */
export interface BrowseItem {
  /** What the import route takes back to copy this picture (`isValidPickRef`). */
  ref: string;
  /** A small picture for the tile. */
  thumbUrl: string;
  /** Title or description, for the tile's alt text and hover. */
  label?: string;
  /** A second line, such as a date. */
  secondary?: string;
  /** Marked as a favorite at the source (Immich). */
  favorite?: boolean;
  /** Who took it, when the source asks for credit (Unsplash). */
  credit?: { name: string; url?: string };
}

export interface BrowsePage {
  items: BrowseItem[];
  /** The page to ask for next, or null at the end. */
  nextPage: number | null;
}

export interface PhotoSourceAdapter<K extends PhotoSourceKind> {
  readonly kind: K;
  /** A refresh of pictures (and videos where the source plays them) for a stream. */
  list(args: ListArgs<K>): Promise<MediaListItem[]>;
  /** One still picture for a rotating background, or null when there is none. */
  pickOne(args: PickArgs<K>): Promise<PickedPicture | null>;
}

/** The sources whose pictures can be browsed one at a time and copied into the library. */
export interface PickableSource {
  readonly kind: PickImportKind;
  browse(args: BrowseArgs): Promise<BrowsePage>;
  importOne(args: { ref: string; folder: string }): Promise<PictureImportResult>;
}

/**
 * A failure the editor or the wall can explain: a key that can't see
 * something (Immich 403), a sign-in that lapsed, or something gone at the
 * source. Routes turn it into a status and a small JSON body.
 */
export class PhotoSourceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: Record<string, unknown> = { error: message },
  ) {
    super(message);
    this.name = 'PhotoSourceError';
  }
}
