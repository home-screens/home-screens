import { folderOf } from '@/lib/media-paths';
import { mediaKindOf } from '@/lib/media-formats';
import { isSinglePhotoMode } from '@/lib/fullscreen-photo-mode';
import { isRotationActive, normalizePhotoSource } from '@/lib/photo-source';
import type { PhotoSource, SlideshowMediaTypes } from '@/types/config';

/**
 * Generic media-usage scan: walks the ENTIRE config JSON for strings that
 * reference a library file, with no field list to maintain. Features that
 * start referencing images later are covered without scanner changes.
 * References come in three shapes: serve URLs (`/api/backgrounds/serve?file=`),
 * bare relative paths (screen backgroundImage, video module file) and the
 * static `/backgrounds/<path>` form older installs wrote before the serve
 * route existed (the wall still renders those straight from public/).
 *
 * The one deliberate exception to "no field list" is folder-driven modules:
 * a slideshow stores only its folder name and resolves the files at runtime,
 * so the scanner marks every library file directly inside that folder that
 * the slideshow plays (its `mediaTypes`) as used by it. Those two module
 * types are the only ones with a `directory`.
 */

export type MediaUseKind = 'screen' | 'dayRule' | 'module' | 'slideshow' | 'rotation' | 'other';
export interface MediaUse {
  kind: MediaUseKind;
  /** Display name of the screen (or the module's screen) the use sits on. */
  name?: string;
  configPath: string;
  /** Ids the editor can jump to, when the use sits inside a screen. */
  displayId?: string;
  screenId?: string;
  moduleId?: string;
}

/** A reference to something the library no longer holds. */
export interface MissingMedia {
  path: string;
  kind: 'file' | 'folder';
  uses: MediaUse[];
}

// Anchored at the start so an unrelated URL carrying its own `file=` param can
// never read as a library reference; an absolute origin in front of the path
// is tolerated because hand-edited configs sometimes carry one. Every
// construction site puts `file` first (serve route serveUrl, rotate route,
// media-paths serveUrlFor); a param ever prepended before it needs this revisited.
const SERVE_RE = /^(?:https?:\/\/[^/]+)?\/api\/backgrounds\/serve\?file=([^&]+)/;
const LEGACY_STATIC_PREFIX = '/backgrounds/';
/** Bare strings only count as a *missing* file when they end like a media
 *  file; anything else that is not in the library is just text. */
const MEDIA_EXT_RE = /\.(jpe?g|jfif|pjpeg|pjp|png|webp|gif|avif|svg|mp4|webm|mov)$/i;

/** Modules that show a whole folder rather than one file. */
const FOLDER_MODULE_TYPES: ReadonlySet<string> = new Set(['photo-slideshow', 'fullscreen-photo']);

export interface MediaRef {
  path: string;
  /** True for the serve-URL and legacy static forms, which can only ever
   *  mean a library file; false for a bare string that merely looks like one. */
  explicit: boolean;
}

/** Classify one candidate string as a library reference, or null. */
export function classifyMediaRef(value: string): MediaRef | null {
  const serve = value.match(SERVE_RE);
  if (serve) {
    try { return { path: decodeURIComponent(serve[1]), explicit: true }; } catch { return null; }
  }
  const legacy = value.startsWith(LEGACY_STATIC_PREFIX);
  const bare = legacy ? value.slice(LEGACY_STATIC_PREFIX.length) : value;
  // Bare paths: a filename plus zero or more folder segments (the library
  // hosts folders two deep, e.g. themes/christmas/clip.mp4). Spaces are
  // legal in hand-placed filenames; the caller's known-path set is what
  // keeps prose from matching. Anything with a leading slash, an empty
  // segment, a fragment, or CSS/color syntax is not one.
  if (!/^[^/]+(\/[^/]+)*$/.test(bare) || bare.startsWith('#')) return null;
  return { path: bare, explicit: legacy };
}

function kindFor(configPath: string): MediaUseKind {
  if (configPath.includes('dayRules')) return 'dayRule';
  if (configPath.includes('.modules[')) return 'module';
  if (configPath.includes('screens[')) return 'screen';
  return 'other';
}

/**
 * The folder a module instance shows as a slideshow, or null when it shows a
 * single file or a non-library source. Mirrors the module's own fetch rules:
 * a library `photoSource`, and for fullscreen-photo the shared single-photo
 * mode check (a `file` key present in any form means one picture).
 */
function slideshowFolder(node: Record<string, unknown>): string | null {
  if (typeof node.type !== 'string' || !FOLDER_MODULE_TYPES.has(node.type)) return null;
  const config = node.config;
  if (!config || typeof config !== 'object') return null;
  const c = config as Record<string, unknown>;
  const source = normalizePhotoSource(c.photoSource);
  if (source?.kind !== 'library') return null;
  if (node.type === 'fullscreen-photo' && isSinglePhotoMode(c)) return null;
  return source.folder;
}

/**
 * The library folder a screen's rotating background picks from, or null
 * when it reads another source. With `playing`, also null while rotation is
 * off: only a rotation that is on holds on to the folder's last picture the
 * way a slideshow does, but a folder rename must follow a switched-off one
 * too, or turning it back on would read a folder that is gone.
 */
function rotationFolders(node: Record<string, unknown>, playing: boolean): Array<{ index: number; folder: string }> {
  const rotation = node.backgroundRotation;
  if (!rotation || typeof rotation !== 'object') return [];
  const r = rotation as { sources?: unknown };
  if (!Array.isArray(r.sources)) return [];
  if (playing && !isRotationActive(r as { sources: PhotoSource[] })) return [];
  const folders: Array<{ index: number; folder: string }> = [];
  r.sources.forEach((entry, index) => {
    const source = normalizePhotoSource(entry);
    // Chosen pictures are files, which the string walk protects on its own.
    if (source?.kind === 'library' && !source.pictures) folders.push({ index, folder: source.folder });
  });
  return folders;
}

/** True for a use that is a whole folder playing on a wall (a slideshow or a rotating background). */
export function isRotatingBackgroundUse(use: Pick<MediaUse, 'kind' | 'configPath'>): boolean {
  return use.kind === 'slideshow' && /\.backgroundRotation\.sources\.\d+\.folder$/.test(use.configPath);
}

/** What a slideshow module plays from its folder, mirroring its list fetch:
 *  photos unless `mediaTypes` asks for videos or both. */
function slideshowShows(node: Record<string, unknown>): SlideshowMediaTypes {
  const media = (node.config as Record<string, unknown>).mediaTypes;
  return media === 'videos' || media === 'both' ? media : 'photos';
}

/** Whether a slideshow that plays `shows` puts pictures (or videos) on screen. */
export function slideshowPlays(shows: SlideshowMediaTypes, kind: 'image' | 'video'): boolean {
  return shows === 'both' || (shows === 'photos') === (kind === 'image');
}

/** Whether a slideshow that plays `shows` would put this library file on screen. */
export function slideshowCanShow(shows: SlideshowMediaTypes, libraryPath: string): boolean {
  const kind = mediaKindOf(libraryPath);
  return kind !== null && slideshowPlays(shows, kind);
}

interface Ancestry {
  name?: string;
  displayId?: string;
  /** The display's own name; `name` is overwritten by the screen's below it. */
  displayName?: string;
  screenId?: string;
  moduleId?: string;
}

interface FolderUse {
  folder: string;
  shows: SlideshowMediaTypes;
  use: MediaUse;
  displayName?: string;
}

/** Walk every string in a JSON-derived config. `onRef` fires for each string
 *  that reads as a library reference, `onFolder` for each slideshow folder.
 *  `skipKey` leaves one top-level key out of the walk entirely. */
function walkConfig(
  config: unknown,
  onRef: (ref: MediaRef, use: MediaUse) => void,
  onFolder: (folderUse: FolderUse) => void,
  skipKey?: string,
): void {
  const walk = (node: unknown, path: string, key: string, ancestry: Ancestry) => {
    if (typeof node === 'string') {
      const ref = classifyMediaRef(node);
      if (ref) onRef(ref, { kind: kindFor(path), name: ancestry.name, configPath: path, ...ids(ancestry) });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}[${i}]`, key, ancestry));
      return;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      const next: Ancestry = { ...ancestry };
      if (typeof obj.name === 'string') next.name = obj.name;
      if (typeof obj.id === 'string') {
        if (key === 'displays') {
          next.displayId = obj.id;
          next.displayName = typeof obj.name === 'string' ? obj.name : undefined;
        } else if (key === 'screens') { next.screenId = obj.id; next.moduleId = undefined; }
        else if (key === 'modules') next.moduleId = obj.id;
      }
      const folder = slideshowFolder(obj);
      if (folder != null) {
        onFolder({
          folder,
          shows: slideshowShows(obj),
          use: { kind: 'slideshow', name: next.name, configPath: `${path}.config.photoSource.folder`, ...ids(next) },
          ...(next.displayName ? { displayName: next.displayName } : {}),
        });
      }
      for (const { index, folder: rotating } of key === 'screens' ? rotationFolders(obj, true) : []) {
        onFolder({
          folder: rotating,
          shows: 'photos',
          use: { kind: 'slideshow', name: next.name, configPath: `${path}.backgroundRotation.sources.${index}.folder`, ...ids(next) },
          ...(next.displayName ? { displayName: next.displayName } : {}),
        });
      }
      for (const [k, v] of Object.entries(obj)) {
        if (path === '' && k === skipKey) continue;
        walk(v, path ? `${path}.${k}` : k, k, next);
      }
    }
  };
  walk(config, '', '', {});
}

function ids(a: Ancestry): Pick<MediaUse, 'displayId' | 'screenId' | 'moduleId'> {
  const out: Pick<MediaUse, 'displayId' | 'screenId' | 'moduleId'> = {};
  if (a.displayId) out.displayId = a.displayId;
  if (a.screenId) out.screenId = a.screenId;
  if (a.moduleId) out.moduleId = a.moduleId;
  return out;
}

/** Input must be JSON-derived (no cycles), as readConfig guarantees. */
export function scanMediaUsage(config: unknown, knownPaths: Set<string>): Map<string, MediaUse[]> {
  const usage = new Map<string, MediaUse[]>();
  let byFolder: Map<string, string[]> | null = null;
  const pathsInFolder = (folder: string): string[] => {
    if (!byFolder) {
      byFolder = new Map();
      for (const p of knownPaths) {
        const list = byFolder.get(folderOf(p)) ?? [];
        list.push(p);
        byFolder.set(folderOf(p), list);
      }
    }
    return byFolder.get(folder) ?? [];
  };
  const record = (ref: string, use: MediaUse) => {
    const list = usage.get(ref) ?? [];
    list.push(use);
    usage.set(ref, list);
  };
  walkConfig(
    config,
    (ref, use) => { if (knownPaths.has(ref.path)) record(ref.path, use); },
    ({ folder, shows, use }) => {
      for (const p of pathsInFolder(folder)) {
        if (slideshowCanShow(shows, p)) record(p, use);
      }
    },
  );
  return usage;
}

/** One slideshow on a wall: the library folder it plays and where it sits. */
export interface SlideshowFolder {
  /** Library-relative folder, '' for the top level. */
  folder: string;
  /** Which files in the folder it plays. */
  shows: SlideshowMediaTypes;
  /** The slideshow as a usage entry: its screen's name and ids, and the
   *  `configPath` the usage scan files its folder's pictures under. */
  use: MediaUse;
  /** The display it is on, when the config has a displays registry. */
  displayName?: string;
}

/**
 * Every local-folder slideshow a wall can show, in config order, including
 * one pointed at an empty or missing folder (which the usage scan, keyed by
 * files, cannot see). Once the config has displays, the top-level `screens`
 * is a frozen snapshot no wall renders, so it is left out here.
 */
export function slideshowFolders(config: unknown): SlideshowFolder[] {
  const out: SlideshowFolder[] = [];
  const displays = config && typeof config === 'object'
    ? (config as Record<string, unknown>).displays
    : undefined;
  const hasDisplays = Array.isArray(displays) && displays.length > 0;
  walkConfig(config, () => {}, (found) => { out.push(found); }, hasDisplays ? 'screens' : undefined);
  return out;
}

/** A usage map as either shape it travels in: the scan's Map or the inventory's record. */
export type MediaUsageMap = ReadonlyMap<string, readonly MediaUse[]> | Readonly<Record<string, readonly MediaUse[]>>;

function usesIn(usage: MediaUsageMap, libraryPath: string): readonly MediaUse[] {
  if (usage instanceof Map) return usage.get(libraryPath) ?? [];
  return (usage as Readonly<Record<string, readonly MediaUse[]>>)[libraryPath] ?? [];
}

function usageEntries(usage: MediaUsageMap): [string, readonly MediaUse[]][] {
  return usage instanceof Map ? [...usage.entries()] : Object.entries(usage);
}

/** Deleting takes a file away from everything that uses it; moving keeps
 *  every reference (they are rewritten to follow) except a slideshow's. */
export type RemovalMode = 'delete' | 'move';

/** Files each slideshow plays, keyed by the slideshow's `configPath`. */
function slideshowMembers(usage: MediaUsageMap): Map<string, Set<string>> {
  const members = new Map<string, Set<string>>();
  for (const [libraryPath, uses] of usageEntries(usage)) {
    for (const use of uses) {
      if (use.kind !== 'slideshow') continue;
      const set = members.get(use.configPath) ?? new Set<string>();
      set.add(libraryPath);
      members.set(use.configPath, set);
    }
  }
  return members;
}

/** The uses that keep one file where it is, given who is still in each slideshow. */
function blockingUses(uses: readonly MediaUse[], members: Map<string, Set<string>>, libraryPath: string, mode: RemovalMode): MediaUse[] {
  const blocking: MediaUse[] = [];
  for (const use of uses) {
    if (use.kind === 'slideshow') {
      // A slideshow lets a picture go while it has another one to show, so
      // the wall never goes blank; only its last picture stays put.
      const left = members.get(use.configPath);
      if (!left || (left.size === 1 && left.has(libraryPath))) blocking.push(use);
    } else if (mode === 'delete') {
      blocking.push(use);
    }
  }
  return blocking;
}

/**
 * Which of `leaving` must stay, and the uses that keep each one. `usage` must
 * cover every file in the folders involved (the scan over those folders, or
 * the inventory's map), since a slideshow's last picture is only "last"
 * relative to the others still in its folder.
 *
 * Files are judged in order, each as if the ones before it had already gone,
 * so deleting a whole slideshow folder takes every picture but the last one
 * in the list. A file used anywhere else (a screen background, a day rule, a
 * single-photo module) can never be deleted; moving it is fine because those
 * references follow it. This is the one rule the delete route, the move
 * route, Settings and the phone all apply.
 */
export function blockedRemovals(usage: MediaUsageMap, leaving: readonly string[], mode: RemovalMode): Map<string, MediaUse[]> {
  const members = slideshowMembers(usage);
  const blocked = new Map<string, MediaUse[]>();
  const seen = new Set<string>();
  for (const libraryPath of leaving) {
    if (seen.has(libraryPath)) continue;
    seen.add(libraryPath);
    const uses = usesIn(usage, libraryPath);
    const blocking = blockingUses(uses, members, libraryPath, mode);
    if (blocking.length > 0) {
      blocked.set(libraryPath, blocking);
      continue;
    }
    for (const use of uses) {
      if (use.kind === 'slideshow') members.get(use.configPath)?.delete(libraryPath);
    }
  }
  return blocked;
}

/**
 * The same rule judged for every file in `usage` on its own (nothing else
 * leaving), for a grid that marks which files are locked. Files missing from
 * the result can go.
 */
export function removalBlocksByFile(usage: MediaUsageMap, mode: RemovalMode): Map<string, MediaUse[]> {
  const members = slideshowMembers(usage);
  const blocked = new Map<string, MediaUse[]>();
  for (const [libraryPath, uses] of usageEntries(usage)) {
    const blocking = blockingUses(uses, members, libraryPath, mode);
    if (blocking.length > 0) blocked.set(libraryPath, blocking);
  }
  return blocked;
}

/**
 * References to files or folders the library no longer holds. A bare string
 * only counts when it ends like a media file, so prose never shows up here;
 * serve URLs and legacy static paths always count. `existingPaths` must hold
 * every file on disk, including ones the inventory hides, and
 * `existingFolders` every folder (the top level is always present).
 */
export function scanMissingMedia(
  config: unknown,
  existingPaths: Set<string>,
  existingFolders: Set<string>,
): MissingMedia[] {
  const missing = new Map<string, MissingMedia>();
  const record = (path: string, kind: 'file' | 'folder', use: MediaUse) => {
    const entry = missing.get(`${kind}:${path}`) ?? { path, kind, uses: [] };
    entry.uses.push(use);
    missing.set(`${kind}:${path}`, entry);
  };
  walkConfig(
    config,
    (ref, use) => {
      if (existingPaths.has(ref.path)) return;
      if (ref.explicit || MEDIA_EXT_RE.test(ref.path)) record(ref.path, 'file', use);
    },
    ({ folder, use }) => {
      if (folder !== '' && !existingFolders.has(folder)) record(folder, 'folder', use);
    },
  );
  return [...missing.values()];
}

/**
 * Rewrite every reference to a moved or renamed library path, keeping each
 * reference's own form: a serve URL stays a serve URL (its trailing params
 * intact), a legacy static path keeps its prefix, a bare path stays bare,
 * and a slideshow's folder follows the folder. `mapFile` and `mapFolder`
 * return the new spelling or null to leave a value alone. Returns a new
 * config object only when something changed, otherwise the same reference,
 * so `updateConfigAtomic` can skip the write.
 */
export function rewriteMediaRefs<T>(
  config: T,
  mapFile: (path: string) => string | null,
  mapFolder: (folder: string) => string | null,
): { config: T; changed: number } {
  let changed = 0;
  const rewriteString = (value: string): string => {
    const serve = value.match(SERVE_RE);
    if (serve) {
      let decoded: string;
      try { decoded = decodeURIComponent(serve[1]); } catch { return value; }
      const next = mapFile(decoded);
      if (next == null) return value;
      changed += 1;
      const head = value.slice(0, serve.index! + serve[0].length - serve[1].length);
      return head + encodeURIComponent(next) + value.slice(serve.index! + serve[0].length);
    }
    const legacy = value.startsWith(LEGACY_STATIC_PREFIX);
    const bare = legacy ? value.slice(LEGACY_STATIC_PREFIX.length) : value;
    if (!/^[^/]+(\/[^/]+)*$/.test(bare) || bare.startsWith('#')) return value;
    const next = mapFile(bare);
    if (next == null) return value;
    changed += 1;
    return legacy ? LEGACY_STATIC_PREFIX + next : next;
  };
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return rewriteString(node);
    if (Array.isArray(node)) {
      let touched = false;
      const out = node.map((child) => {
        const next = walk(child);
        if (next !== child) touched = true;
        return next;
      });
      return touched ? out : node;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      let touched = false;
      const out: Record<string, unknown> = {};
      const folder = slideshowFolder(obj);
      const rotating = rotationFolders(obj, false);
      for (const [k, v] of Object.entries(obj)) {
        let next: unknown;
        if (k === 'config' && folder != null && v && typeof v === 'object') {
          // A slideshow's folder is not a file path; map it as a folder.
          const c = { ...(v as Record<string, unknown>) };
          const nextFolder = mapFolder(folder);
          if (nextFolder != null) {
            c.photoSource = { ...(c.photoSource as Record<string, unknown>), folder: nextFolder };
            changed += 1;
          }
          const inner = walk(c) as Record<string, unknown>;
          next = inner === c && nextFolder == null ? v : inner;
        } else if (k === 'backgroundRotation' && rotating.length > 0 && v && typeof v === 'object') {
          // A rotating background's folders likewise, one per library entry.
          const c = { ...(v as Record<string, unknown>) };
          const sources = [...(c.sources as unknown[])];
          let moved = false;
          for (const { index, folder: own } of rotating) {
            const nextFolder = mapFolder(own);
            if (nextFolder == null) continue;
            sources[index] = { ...(sources[index] as Record<string, unknown>), folder: nextFolder };
            changed += 1;
            moved = true;
          }
          if (moved) c.sources = sources;
          const inner = walk(c) as Record<string, unknown>;
          next = inner === c && !moved ? v : inner;
        } else {
          next = walk(v);
        }
        if (next !== v) touched = true;
        out[k] = next;
      }
      return touched ? out : node;
    }
    return node;
  };
  const result = walk(config) as T;
  return { config: result, changed };
}
