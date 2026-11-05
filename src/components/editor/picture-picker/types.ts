/** The picture chosen in a tab, waiting for Select Image. */
export interface PickerSelection {
  /** Which tile is chosen, for its highlight. */
  key: string;
  /** A footer line while it is chosen (the photographer's credit, say). */
  hint?: string;
  /** The URL to store: at once for a library or built-in picture, after a copy for any other source. */
  resolve: () => Promise<string>;
}

/** What every tab gets from the picker around it. */
export interface PickerTabProps {
  selection: PickerSelection | null;
  onSelect: (selection: PickerSelection | null) => void;
  /** True while Select Image is copying the chosen picture into the library. */
  copying: boolean;
}

/** One tile from `GET /api/photo-source/browse` (BrowseItem on the hub). */
export interface BrowseTile {
  ref: string;
  thumbUrl: string;
  label?: string;
  secondary?: string;
  favorite?: boolean;
  credit?: { name: string; url?: string };
}
