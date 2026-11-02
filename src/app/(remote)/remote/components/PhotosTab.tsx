'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Folder, FolderInput, Images, Link2, Monitor, MoreHorizontal, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import {
  createLibraryFolder,
  deleteLibraryFile,
  deleteLibraryFolder,
  moveLibraryFiles,
  renameLibraryFolder,
} from '@/lib/library-client';
import { MEDIA_SORTERS, type MediaInventory, type MediaInventoryItem } from '@/lib/media-inventory';
import { blockedRemovals, removalBlocksByFile, type MediaUse, type SlideshowFolder } from '@/lib/media-usage';
import { photoFolders, wallName, wallsShowing, type PhotoFolder } from '@/lib/media-folders';
import { folderOf } from '@/lib/media-paths';
import { mediaKindOf } from '@/lib/media-formats';
import { formatBytes } from '@/lib/format-bytes';
import { targetWallName, useDisplayTarget } from '../display-target';
import { showToast } from '../remote-toast';
import { usePhotoLibrary } from '../hooks/usePhotoLibrary';
import { usePhotoUploads, type UploadRun } from '../hooks/usePhotoUploads';
import ConfirmSheet from './ConfirmSheet';
import PhotoGrid from './PhotoGrid';
import PhotoViewer, { type PhotoFacts } from './PhotoViewer';
import PhotoMoveSheet from './PhotoMoveSheet';
import { PhotoFolderMenu, PhotoFolderNameSheet } from './PhotoFolderSheets';
import PhotoUploadCard from './PhotoUploadCard';
import { PhotoGoogleSheet, PhotoICloudSheet } from './PhotoImportSheets';
import { usePhotoWords, type PhotoKind } from './photo-words';
import { HIT_TARGET } from './lists-styles';

/** Free space on the hub below which the space line turns into a warning. */
const LOW_SPACE_BYTES = 1024 ** 3;

/** Every photo format the hub keeps, and the videos a wall plays. Listing
 *  types (not image/*) keeps iPhones sending their HEIC photos as JPEG. */
const PICKER_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime';

/** How long "Show on the wall" puts a photo up. The toast says "for a minute". */
const SHOW_SECONDS = 60;

const NO_ITEMS: MediaInventoryItem[] = [];
const NO_USAGE: MediaInventory['usage'] = {};
const NO_SLIDESHOWS: SlideshowFolder[] = [];
const NO_DIRECTORIES: MediaInventory['directories'] = [];

interface MoveRequest {
  paths: string[];
  from: 'select' | 'viewer';
}

type Sheet =
  | { kind: 'folderMenu' }
  | { kind: 'rename' }
  | { kind: 'newFolder'; parent: string; thenMove?: MoveRequest }
  | { kind: 'move'; request: MoveRequest }
  | { kind: 'delete'; paths: string[]; from: 'select' | 'viewer' }
  | { kind: 'deleteFolder' }
  | { kind: 'google' }
  | { kind: 'icloud' };

/** Which translation a use of a file on its own is described with. */
function aloneKind(use: MediaUse): 'screen' | 'dayRule' | 'module' | 'other' {
  return use.kind === 'screen' || use.kind === 'dayRule' || use.kind === 'module' ? use.kind : 'other';
}

function kindsOf(entries: ReadonlyArray<{ kind: PhotoKind }>): PhotoKind[] {
  return [...new Set(entries.map((entry) => entry.kind))];
}

const PILL: React.CSSProperties = {
  height: 36,
  padding: '0 14px',
  borderRadius: 18,
  border: '1px solid var(--hs-border-strong)',
  background: 'var(--hs-bg-panel)',
  color: 'var(--hs-text-body)',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
};

const TEXT_BUTTON: React.CSSProperties = {
  minWidth: 86,
  minHeight: 44,
  padding: 0,
  border: 'none',
  background: 'none',
  color: 'var(--hs-accent)',
  fontSize: 15,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

/**
 * The /remote Photos tab: the hub's photo library, managed from a phone. It
 * reads the same inventory as Settings > Pictures & videos, newest first.
 * Folders a wall shows come first and say so; photos are added from the
 * phone (made smaller first), Google Photos or an iCloud link; a tap opens a
 * photo full screen, and Select picks several to delete or move. A
 * slideshow's pictures can be deleted or moved except its last one, and a
 * photo a screen uses on its own (a background) cannot be deleted at all;
 * both say why instead of offering a button that would fail.
 */
export default function PhotosTab({ directory }: { directory: string }) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const words = usePhotoWords();
  const { displays, target } = useDisplayTarget();
  const multiDisplay = displays.length > 0;
  const { inventory, loadFailed, refresh } = usePhotoLibrary();
  const { run, start: startUploads, dismiss: dismissUploads, busy: uploading } = usePhotoUploads(refresh);

  // The folder this tab was last left on is kept in the address beside the
  // tab itself (`?tab=photos&folder=`), so switching tabs or reloading comes
  // back to it rather than to the wall's folder.
  const [folder, setFolder] = useState(() => (typeof window === 'undefined'
    ? directory
    : new URLSearchParams(window.location.search).get('folder') ?? directory));
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [viewing, setViewing] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  // Photos just moved in lead their new folder's grid, so the move shows.
  const [leading, setLeading] = useState<string[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());

  // Only a household already signed in to Google (from a computer) is offered it here.
  useEffect(() => {
    let alive = true;
    editorFetch('/api/google-picker/status')
      .then(async (res) => {
        if (!alive || !res.ok) return;
        const status = (await res.json()) as { connected?: boolean };
        if (alive) setGoogleConnected(status.connected === true);
      })
      .catch(() => { /* not offered */ });
    return () => { alive = false; };
  }, []);

  const items = inventory?.items ?? NO_ITEMS;
  const usage = inventory?.usage ?? NO_USAGE;
  const slideshows = inventory?.slideshows ?? NO_SLIDESHOWS;
  const directories = inventory?.directories ?? NO_DIRECTORIES;
  const folders = useMemo(() => photoFolders(items, directories, slideshows, folder), [items, directories, slideshows, folder]);
  // A folder that went away (renamed or deleted elsewhere) falls back to the top level.
  const current = folders.find((f) => f.path === folder) ?? folders.find((f) => f.path === '') ?? null;
  const currentPath = current?.path ?? '';

  const visible = useMemo(() => {
    const inFolder = items.filter((item) => folderOf(item.path) === currentPath).sort(MEDIA_SORTERS.newest);
    if (leading.length === 0) return inFolder;
    const first = leading.flatMap((path) => inFolder.filter((item) => item.path === path));
    return [...first, ...inFolder.filter((item) => !leading.includes(item.path))];
  }, [items, currentPath, leading]);

  // The one rule the hub enforces, judged per file for the grid and viewer.
  const deleteLocks = useMemo(() => removalBlocksByFile(usage, 'delete'), [usage]);
  const moveLocks = useMemo(() => removalBlocksByFile(usage, 'move'), [usage]);
  const usedAlone = useMemo(
    () => new Set(Object.entries(usage).filter(([, uses]) => uses.some((use) => use.kind !== 'slideshow')).map(([path]) => path)),
    [usage],
  );

  const unnamedWall = t('photosTab.unnamedWall');
  const mainFolder = t('photosTab.mainFolderTab');
  const folderLabel = useCallback((path: string) => path || mainFolder, [mainFolder]);
  const wallsOf = useCallback(
    (path: string, kinds?: PhotoKind[]) => wallsShowing(path, slideshows, multiDisplay, unnamedWall, kinds),
    [slideshows, multiDisplay, unnamedWall],
  );
  const wallsText = useCallback((path: string) => {
    const names = wallsOf(path);
    return names.length > 0 ? words.names(names) : null;
  }, [wallsOf, words]);

  /** "They'll show on Kitchen." for what just went into `path`, or why it won't. */
  const whereTheyShow = useCallback((path: string, kinds: PhotoKind[], count: number): string => {
    const walls = wallsOf(path, kinds);
    if (walls.length > 0) return t('photosTab.showsOn', { count, walls: words.names(walls) });
    const there = slideshows.find((s) => s.folder === path);
    if (there) return t(there.shows === 'videos' ? 'photosTab.slideshowVideosOnly' : 'photosTab.slideshowPhotosOnly', { folder: folderLabel(path) });
    return t('photosTab.folderNotOnWall');
  }, [wallsOf, slideshows, t, words, folderLabel]);

  /** Names of the walls whose slideshows these uses are. */
  const wallsOfUses = useCallback((uses: readonly MediaUse[]): string[] => {
    const names: string[] = [];
    for (const use of uses) {
      const slideshow = slideshows.find((s) => s.use.configPath === use.configPath);
      if (!slideshow) continue;
      const name = wallName(slideshow, multiDisplay) || unnamedWall;
      if (!names.includes(name)) names.push(name);
    }
    return names;
  }, [slideshows, multiDisplay, unnamedWall]);

  // Mirror the folder being viewed into the address (see `folder` above).
  useEffect(() => {
    if (!inventory) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('folder') === currentPath) return;
    url.searchParams.set('folder', currentPath);
    window.history.replaceState(window.history.state, '', url);
  }, [inventory, currentPath]);

  // Keep the chip for the folder being viewed in sight after a switch or a rename.
  useEffect(() => {
    chipRefs.current.get(currentPath)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [currentPath, folders.length]);

  const openFolder = (path: string) => {
    setFolder(path);
    setLeading([]);
  };

  // ── Adding ─────────────────────────────────────────────

  const settledRunRef = useRef<UploadRun | null>(null);
  useEffect(() => {
    if (!run?.finished || settledRunRef.current === run) return;
    settledRunRef.current = run;
    void refresh();
    // A clean batch of several needs only a line; a failure, or one photo
    // that could go on the wall right now, keeps the card up.
    if (run.failures.length === 0 && run.added.length >= 2) {
      showToast(`${t('photosTab.upload.added', { count: run.added.length })} ${whereTheyShow(run.folder, kindsOf(run.added), run.added.length)}`);
      dismissUploads();
    }
  }, [run, refresh, t, whereTheyShow, dismissUploads]);

  // A finished run's card speaks for the folder its photos went into, so
  // leaving that folder (a switch, following a move, a rename) retires it.
  const cardFolderRef = useRef(currentPath);
  useEffect(() => {
    if (cardFolderRef.current === currentPath) return;
    cardFolderRef.current = currentPath;
    if (run?.finished) dismissUploads();
  }, [currentPath, run, dismissUploads]);

  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Cleared at once so picking the same photo again still fires a change.
    e.target.value = '';
    if (files.length === 0) return;
    setLeading([]);
    void startUploads(files, currentPath);
  };

  // ── Showing on the wall ────────────────────────────────

  const showOnWall = useCallback(async (path: string) => {
    try {
      const res = await editorFetch('/api/display/show-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: path, duration: SHOW_SECONDS, ...(target ? { displayId: target } : {}) }),
      });
      if (res.status === 404) {
        // Moved or deleted since this phone last looked; the wall is fine.
        showToast(t(mediaKindOf(path) === 'video' ? 'photosTab.show.goneVideo' : 'photosTab.show.gonePhoto'), 'error');
        void refresh();
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const where = targetWallName(target, displays, { everyWall: t('photosTab.show.everyWall'), theWall: t('photosTab.show.theWall') });
      showToast(t('photosTab.show.sent', { where }));
    } catch (err) {
      if (!isSessionExpired(err)) showToast(t('photosTab.show.failed'), 'error');
    }
  }, [target, displays, t, refresh]);

  // ── Viewer ─────────────────────────────────────────────

  const viewIndex = viewing ? visible.findIndex((item) => item.path === viewing) : -1;
  useEffect(() => {
    // Gone from this folder (deleted, moved, renamed on another screen): close.
    if (viewing && inventory && viewIndex === -1) setViewing(null);
  }, [viewing, viewIndex, inventory]);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const stepViewer = useCallback((delta: 1 | -1) => {
    setViewing((path) => {
      const list = visibleRef.current;
      const at = list.findIndex((item) => item.path === path);
      if (at === -1 || list.length < 2) return path;
      return list[(at + delta + list.length) % list.length].path;
    });
  }, []);
  const closeViewer = useCallback(() => setViewing(null), []);
  /** The photo to show once `path` leaves the folder: the next one, else the one before. */
  const neighbourOf = (path: string): string | null => {
    const at = visible.findIndex((item) => item.path === path);
    if (at === -1) return null;
    return visible[at + 1]?.path ?? visible[at - 1]?.path ?? null;
  };

  const factsFor = useCallback((item: MediaInventoryItem): PhotoFacts => {
    const uses = usage[item.path] ?? [];
    const walls = wallsOfUses(uses.filter((use) => use.kind === 'slideshow'));
    const alone = uses.find((use) => use.kind !== 'slideshow');
    const block = deleteLocks.get(item.path) ?? [];
    const lastIn = block.filter((use) => use.kind === 'slideshow');
    let note: string | null = null;
    if (lastIn.length > 0) {
      const lastWalls = wallsOfUses(lastIn);
      const video = item.kind === 'video';
      note = lastWalls.length > 0
        ? t(video ? 'photosTab.viewer.onlyVideo' : 'photosTab.viewer.onlyPhoto', { walls: words.names(lastWalls) })
        : t(video ? 'photosTab.viewer.onlyVideoAnywhere' : 'photosTab.viewer.onlyPhotoAnywhere');
    } else if (alone) {
      note = t(`photosTab.viewer.aloneNote.${aloneKind(alone)}`);
    }
    return {
      showingOn: walls.length > 0 ? words.names(walls) : null,
      usedAlone: alone ? t(`photosTab.viewer.alone.${aloneKind(alone)}`, { screen: alone.name || t('photosTab.unnamedScreen') }) : null,
      note,
      canMove: !moveLocks.has(item.path),
      canDelete: !deleteLocks.has(item.path),
    };
  }, [usage, wallsOfUses, deleteLocks, moveLocks, t, words]);

  // ── Selecting ──────────────────────────────────────────

  const picked = useMemo(() => visible.filter((item) => selected.has(item.path)), [visible, selected]);
  const allPicked = visible.length > 0 && picked.length === visible.length;
  const startSelecting = () => {
    setSelected(new Set());
    setSelecting(true);
  };
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const toggle = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // ── Deleting ───────────────────────────────────────────

  /**
   * What a delete or move kept, one entry of blocking uses per file: "1
   * stayed so the Kitchen slideshow isn't empty." after, or "1 stays..."
   * when said before the delete. A slideshow among the uses means the file
   * was its last picture; anything else means a screen uses it on its own.
   */
  const keptSentence = (kept: readonly (readonly MediaUse[])[], when: 'before' | 'after'): string => {
    const lastUses: MediaUse[] = [];
    let alone = 0;
    for (const uses of kept) {
      const last = uses.find((use) => use.kind === 'slideshow');
      if (last) lastUses.push(last);
      else alone += 1;
    }
    const parts: string[] = [];
    if (lastUses.length > 0) {
      const walls = wallsOfUses(lastUses);
      parts.push(walls.length > 0
        ? t(when === 'after' ? 'photosTab.keptLast' : 'photosTab.staysLast', { count: lastUses.length, walls: words.names(walls) })
        : t(when === 'after' ? 'photosTab.keptLastAnywhere' : 'photosTab.staysLastAnywhere', { count: lastUses.length }));
    }
    if (alone > 0) parts.push(t(when === 'after' ? 'photosTab.keptAlone' : 'photosTab.staysAlone', { count: alone }));
    return parts.join(' ');
  };

  /** A delete of `paths` judged by the hub's own rule before asking: what goes, and why the rest stays. */
  const deletePlan = (paths: string[]): { going: string[]; stays: string | null } => {
    const blocked = blockedRemovals(usage, paths, 'delete');
    return {
      going: paths.filter((path) => !blocked.has(path)),
      stays: blocked.size > 0 ? keptSentence([...blocked.values()], 'before') : null,
    };
  };

  const runDelete = async (paths: string[], from: 'select' | 'viewer') => {
    setSheet(null);
    setBusy(true);
    const after = from === 'viewer' && paths.length === 1 ? neighbourOf(paths[0]) : null;
    const kinds = kindsOf(visible.filter((item) => paths.includes(item.path)));
    let deleted = 0;
    let failed = 0;
    const kept: MediaUse[][] = [];
    try {
      for (const path of paths) {
        try {
          const result = await deleteLibraryFile(path);
          if (result.ok) deleted += 1;
          else if (result.status === 409) kept.push(result.usage);
          else failed += 1;
        } catch (err) {
          if (isSessionExpired(err)) return;
          failed += 1;
        }
      }
    } finally {
      setBusy(false);
    }
    await refresh();

    if (from === 'viewer' && paths.length === 1) {
      if (deleted === 1) {
        showToast(t(kinds.includes('video') ? 'photosTab.videoDeleted' : 'photosTab.photoDeleted'));
        setViewing(after);
      } else if (kept.length > 0) {
        showToast(t('photosTab.deleteRefused'), 'error');
      } else {
        showToast(t('photosTab.deleteFailed'), 'error');
      }
      return;
    }
    stopSelecting();
    const parts: string[] = [];
    if (deleted > 0) parts.push(t('photosTab.deleted', { count: deleted }));
    if (kept.length > 0) parts.push(keptSentence(kept, 'after'));
    if (failed > 0) parts.push(t('photosTab.deleteFailedCount', { count: failed }));
    showToast(parts.join(' '), failed > 0 ? 'error' : 'info');
  };

  // ── Moving ─────────────────────────────────────────────

  const runMove = async (request: MoveRequest, to: string) => {
    setSheet(null);
    setBusy(true);
    const after = request.from === 'viewer' && request.paths.length === 1 ? neighbourOf(request.paths[0]) : null;
    try {
      const result = await moveLibraryFiles(request.paths, to);
      if (!result.ok || !result.data) {
        // A name already in that folder is the one refusal a move still has.
        showToast(t(result.status === 409 ? 'photosTab.moveClash' : 'photosTab.moveFailed'), 'error');
        return;
      }
      const { moved, kept } = result.data;
      const movedKinds = kindsOf(items.filter((item) => moved.some((m) => m.from === item.path)));
      const parts: string[] = [];
      if (moved.length > 0) {
        parts.push(t('photosTab.movedTo', { count: moved.length, folder: folderLabel(to) }));
        parts.push(whereTheyShow(to, movedKinds, moved.length));
      }
      if (kept.length > 0) parts.push(keptSentence(kept.map((k) => k.usage), 'after'));
      showToast(parts.join(' '));
      if (request.from === 'select') {
        stopSelecting();
        if (moved.length > 0) {
          setFolder(to);
          setLeading(moved.map((m) => m.to));
        }
      } else if (moved.length > 0) {
        setViewing(after);
      }
    } catch (err) {
      if (!isSessionExpired(err)) showToast(t('photosTab.moveFailed'), 'error');
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  // ── Folders ────────────────────────────────────────────

  const runRename = async (name: string) => {
    setBusy(true);
    try {
      const result = await renameLibraryFolder(currentPath, name);
      if (!result.ok || !result.data) {
        showToast(t(result.status === 409 ? 'photosTab.folderExists' : 'photosTab.renameFailed'), 'error');
        return;
      }
      setSheet(null);
      openFolder(result.data.to);
      showToast(t('photosTab.renamed', { name: result.data.to }));
    } catch (err) {
      if (!isSessionExpired(err)) showToast(t('photosTab.renameFailed'), 'error');
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const runCreate = async (name: string, parent: string, thenMove?: MoveRequest) => {
    setBusy(true);
    let created: string | null = null;
    try {
      const result = await createLibraryFolder(name, parent || undefined);
      if (!result.ok || !result.data) {
        showToast(t(result.status === 409 ? 'photosTab.folderExists' : 'photosTab.failedCreateFolder'), 'error');
        return;
      }
      created = result.data.path;
    } catch (err) {
      if (!isSessionExpired(err)) showToast(t('photosTab.failedCreateFolder'), 'error');
      return;
    } finally {
      setBusy(false);
    }
    setSheet(null);
    await refresh();
    if (thenMove) {
      await runMove(thenMove, created);
      return;
    }
    openFolder(created);
    showToast(t('photosTab.folderCreated'));
  };

  const runDeleteFolder = async () => {
    setSheet(null);
    setBusy(true);
    try {
      const result = await deleteLibraryFolder(currentPath);
      if (!result.ok) {
        showToast(t(result.status === 409 ? 'photosTab.folderNotEmpty' : 'photosTab.deleteFolderFailed'), 'error');
        return;
      }
      // A folder inside another hands back to its parent; a top-level one to
      // the first folder a wall shows.
      const slash = currentPath.lastIndexOf('/');
      openFolder(slash > 0 ? currentPath.slice(0, slash) : folders.find((f) => f.onWall)?.path ?? '');
      showToast(t('photosTab.folderDeleted'));
    } catch (err) {
      if (!isSessionExpired(err)) showToast(t('photosTab.deleteFolderFailed'), 'error');
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  /** Why the folder being viewed cannot be deleted yet, or null. */
  const folderDeleteBlockedBy = (f: PhotoFolder): string | null => {
    // In the order they would be met: empty it first, then take it off the wall.
    if (f.images + f.videos > 0) return t('photosTab.folderMenu.hasFiles', { what: words.contents(f.images, f.videos) });
    if (f.hasSubfolders) return t('photosTab.folderMenu.hasFolders');
    const walls = wallsOf(f.path);
    if (walls.length > 0) return t('photosTab.folderMenu.onWall', { walls: words.names(walls) });
    return null;
  };

  // ── Drawing ────────────────────────────────────────────

  if (!inventory) {
    return (
      <div data-testid="photos-tab">
        <Header title={t('photosTab.header')} />
        {loadFailed ? (
          <div className="mt-3 p-4 rounded-[14px] bg-hs-card border border-hs-border-strong" data-testid="photos-load-error">
            <p className="text-[13px] text-hs-text-faint">{t('photosTab.loadFailed')}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-3 min-h-[40px] px-4 rounded-xl bg-hs-hover text-hs-text-primary text-[13px] font-semibold active:scale-[0.97]"
            >
              {t('photosTab.tryAgain')}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-hs-border-strong border-t-hs-text-secondary rounded-full animate-spin" />
          </div>
        )}
      </div>
    );
  }

  const showing = current ? wallsText(current.path) : null;
  const count = (current?.images ?? 0) + (current?.videos ?? 0);
  const contents = current ? words.contents(current.images, current.videos) : '';
  const storage = inventory.storage;
  const lowSpace = storage.freeBytes != null && storage.freeBytes < LOW_SPACE_BYTES;
  const selectDisabled = count === 0 || uploading || busy;
  const viewItem = viewIndex >= 0 ? visible[viewIndex] : null;

  return (
    <div data-testid="photos-tab">
      {selecting ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, padding: '0 0 8px' }}>
          <button type="button" onClick={stopSelecting} style={{ ...TEXT_BUTTON, textAlign: 'left' }} data-testid="photos-select-cancel">
            {tCore('actions.cancel')}
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--hs-text-primary)' }} data-testid="photos-selected-count">
            {t('photosTab.selectedCount', { count: picked.length })}
          </span>
          <button
            type="button"
            onClick={() => setSelected(allPicked ? new Set() : new Set(visible.map((item) => item.path)))}
            style={{ ...TEXT_BUTTON, textAlign: 'right' }}
            data-testid="photos-select-all"
          >
            {allPicked ? t('photosTab.selectNone') : t('photosTab.selectAll')}
          </button>
        </div>
      ) : (
        <Header title={t('photosTab.header')}>
          <button
            type="button"
            onClick={startSelecting}
            disabled={selectDisabled}
            data-testid="photos-select"
            className="press-scale-sm"
            style={{ ...PILL, opacity: selectDisabled ? 0.45 : 1, cursor: selectDisabled ? 'default' : 'pointer' }}
          >
            {t('photosTab.select')}
          </button>
        </Header>
      )}

      {!selecting && (
        <div
          role="group"
          aria-label={t('photosTab.foldersLabel')}
          style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '-4px -16px 0', padding: '0 16px 8px', scrollbarWidth: 'none' }}
        >
          {folders.map((f) => {
            const on = f.path === currentPath;
            return (
              <button
                key={f.path || '(main)'}
                ref={(el) => {
                  if (el) chipRefs.current.set(f.path, el);
                  else chipRefs.current.delete(f.path);
                }}
                type="button"
                aria-pressed={on}
                data-testid="photos-folder-chip"
                data-folder={f.path}
                data-on-wall={f.onWall ? 'true' : undefined}
                onClick={() => openFolder(f.path)}
                className="press-scale-sm"
                style={{ ...HIT_TARGET, fontFamily: 'inherit' }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 36,
                    padding: '0 10px 0 12px',
                    borderRadius: 18,
                    border: `1px solid ${on ? 'var(--hs-accent)' : 'var(--hs-border-strong)'}`,
                    background: on ? 'var(--hs-accent)' : 'var(--hs-bg-panel)',
                    color: on ? '#fff' : 'var(--hs-text-body)',
                    fontSize: 14,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.onWall && (
                    <Monitor size={14} style={{ color: on ? '#fff' : 'var(--hs-success)', flex: 'none' }} aria-label={t('photosTab.onWall')} />
                  )}
                  {f.parent && (
                    <span style={{ color: on ? 'rgba(255,255,255,0.72)' : 'var(--hs-text-faint)', fontWeight: 500, marginRight: -4 }}>
                      {f.parent}/
                    </span>
                  )}
                  {f.path ? f.name : mainFolder}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 8,
                      background: on ? 'rgba(255,255,255,0.22)' : 'var(--hs-bg-card)',
                      color: on ? '#fff' : 'var(--hs-text-muted)',
                    }}
                  >
                    {f.images + f.videos}
                  </span>
                </span>
              </button>
            );
          })}
          <button
            type="button"
            aria-label={t('photosTab.newFolder')}
            onClick={() => setSheet({ kind: 'newFolder', parent: '' })}
            data-testid="photos-new-folder"
            className="press-scale-sm"
            style={{ ...HIT_TARGET, width: 44, justifyContent: 'center' }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                border: '1px solid var(--hs-border-strong)',
                background: 'var(--hs-bg-panel)',
                color: 'var(--hs-text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plus size={18} aria-hidden="true" />
            </span>
          </button>
        </div>
      )}

      {current && (
        <div
          data-testid="photos-folder-card"
          data-on-wall={current.onWall ? 'true' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 10px 10px 12px',
            borderRadius: 14,
            background: 'var(--hs-bg-panel)',
            border: '1px solid var(--hs-border)',
            margin: selecting ? '0 0 12px' : '4px 0 12px',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: showing ? 'color-mix(in srgb, var(--hs-success) 15%, transparent)' : 'var(--hs-bg-card)',
              color: showing ? 'var(--hs-success)' : 'var(--hs-text-faint)',
            }}
          >
            {showing ? <Monitor size={18} /> : <Folder size={18} />}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--hs-text-primary)' }}>
              {showing
                ? t('photosTab.showingOn', { walls: showing })
                : selecting ? folderLabel(current.path) : t('photosTab.notOnWall')}
            </b>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--hs-text-faint)', marginTop: 2, lineHeight: 1.35 }}>
              {showing
                ? contents
                : selecting
                  ? t('photosTab.notOnWallShort', { contents })
                  : count > 0 ? t('photosTab.notOnWallHint', { contents }) : contents}
            </span>
          </span>
          {!selecting && current.path !== '' && (
            <button
              type="button"
              onClick={() => setSheet({ kind: 'folderMenu' })}
              aria-label={t('photosTab.folderMenu.label')}
              data-testid="photos-folder-menu"
              style={{ ...HIT_TARGET, width: 44, justifyContent: 'center', margin: '-4px -4px -4px 0' }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: '1px solid var(--hs-border)',
                  background: 'var(--hs-bg-panel)',
                  color: 'var(--hs-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MoreHorizontal size={18} aria-hidden="true" />
              </span>
            </button>
          )}
        </div>
      )}

      {!selecting && run && !run.finished ? (
        <PhotoUploadCard run={run} whereTheyShow="" onClose={dismissUploads} />
      ) : !selecting && (
        <>
          {run?.finished && (
            <PhotoUploadCard
              run={run}
              whereTheyShow={run.added.length > 0 ? whereTheyShow(run.folder, kindsOf(run.added), run.added.length) : ''}
              onClose={dismissUploads}
              onShowOnWall={run.added.length === 1 && run.failures.length === 0 && items.some((item) => item.path === run.added[0].path)
                ? () => void showOnWall(run.added[0].path)
                : undefined}
            />
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            data-testid="photos-add"
            className="press-btn"
            style={{
              width: '100%',
              minHeight: 52,
              borderRadius: 12,
              border: 'none',
              background: 'var(--hs-accent)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: 'pointer',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
            </svg>
            {t('photosTab.addButton')}
          </button>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 10 }}>
            {googleConnected && (
              <button type="button" onClick={() => setSheet({ kind: 'google' })} data-testid="photos-add-google" className="press-scale-sm" style={PILL}>
                <Images size={16} aria-hidden="true" />
                {t('photosTab.addFromGoogle')}
              </button>
            )}
            <button type="button" onClick={() => setSheet({ kind: 'icloud' })} data-testid="photos-add-icloud" className="press-scale-sm" style={PILL}>
              <Link2 size={16} aria-hidden="true" />
              {t('photosTab.addFromICloud')}
            </button>
          </div>
          {lowSpace ? (
            <div
              data-testid="photos-space"
              data-low="true"
              style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: 'var(--hs-warning)', margin: '10px 0 12px' }}
            >
              <TriangleAlert size={16} style={{ marginTop: 1, flex: 'none' }} aria-hidden="true" />
              <span>{t('photosTab.spaceLow', { free: formatBytes(storage.freeBytes!, locale) })}</span>
            </div>
          ) : (
            <div data-testid="photos-space" style={{ fontSize: 12, color: 'var(--hs-text-faint)', textAlign: 'center', margin: '10px 0 12px' }}>
              {storage.freeBytes != null
                ? t('photosTab.space', { size: formatBytes(storage.bytes, locale), free: formatBytes(storage.freeBytes, locale) })
                : t('photosTab.spaceNoFree', { size: formatBytes(storage.bytes, locale) })}
            </div>
          )}
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={PICKER_ACCEPT}
        multiple
        onChange={onPicked}
        className="hidden"
        id="photo-upload"
        data-testid="photos-file-input"
      />

      {visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '36px 24px 6px' }} data-testid="photos-empty">
          <Images size={44} style={{ color: 'var(--hs-border-strong)', margin: '0 auto' }} strokeWidth={1.6} aria-hidden="true" />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--hs-text-body)', marginTop: 12 }}>
            {t('photosTab.emptyTitle', { folder: folderLabel(currentPath) })}
          </div>
          <div style={{ fontSize: 14, color: 'var(--hs-text-faint)', marginTop: 6, lineHeight: 1.45 }}>{t('photosTab.emptyHint')}</div>
        </div>
      ) : (
        <PhotoGrid
          items={visible}
          selecting={selecting}
          selected={selected}
          usedAlone={usedAlone}
          onOpen={setViewing}
          onToggle={toggle}
        />
      )}

      {selecting && (
        <div
          data-testid="photos-action-bar"
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 60,
            background: 'var(--hs-bg-body)',
            borderTop: '1px solid var(--hs-border-subtle)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <div style={{ display: 'flex', gap: 10, padding: '10px 16px 26px', maxWidth: 640, margin: '0 auto' }}>
            <ActionButton
              onClick={() => setSheet({ kind: 'move', request: { paths: picked.map((item) => item.path), from: 'select' } })}
              disabled={picked.length === 0 || busy}
              testId="photos-move"
              ghost
            >
              <FolderInput size={18} aria-hidden="true" />
              {t('photosTab.move')}
            </ActionButton>
            <ActionButton
              onClick={() => {
                const paths = picked.map((item) => item.path);
                const { going, stays } = deletePlan(paths);
                // Everything picked has to stay: say why rather than ask to delete nothing.
                if (going.length === 0) showToast(stays ?? '', 'error');
                else setSheet({ kind: 'delete', paths, from: 'select' });
              }}
              disabled={picked.length === 0 || busy}
              testId="photos-delete"
            >
              <Trash2 size={18} aria-hidden="true" />
              {tCore('actions.delete')}
            </ActionButton>
          </div>
        </div>
      )}

      {viewItem && (
        <PhotoViewer
          items={visible}
          index={viewIndex}
          onStep={stepViewer}
          onClose={closeViewer}
          onBackGesture={() => {
            if (!sheet) return false;
            setSheet(null);
            return true;
          }}
          facts={factsFor}
          onMove={(item) => setSheet({ kind: 'move', request: { paths: [item.path], from: 'viewer' } })}
          onDelete={(item) => setSheet({ kind: 'delete', paths: [item.path], from: 'viewer' })}
          onShowOnWall={(item) => void showOnWall(item.path)}
          busy={busy}
        />
      )}

      {sheet?.kind === 'folderMenu' && current && (
        <PhotoFolderMenu
          title={folderLabel(current.path)}
          showingOn={showing}
          canNestFolder={current.parent === '' && current.path !== ''}
          deleteBlockedBy={folderDeleteBlockedBy(current)}
          onRename={() => setSheet({ kind: 'rename' })}
          onNewInside={() => setSheet({ kind: 'newFolder', parent: current.path })}
          onDelete={() => setSheet({ kind: 'deleteFolder' })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'rename' && current && (
        <PhotoFolderNameSheet
          mode="rename"
          initialName={current.name}
          folderName={current.name}
          wallNote={showing ? t('photosTab.nameSheet.wallFollows', { walls: showing }) : undefined}
          busy={busy}
          onSubmit={(name) => void runRename(name)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'newFolder' && (
        <PhotoFolderNameSheet
          mode="create"
          initialName=""
          offWallNote={t('photosTab.nameSheet.startsOffWall')}
          busy={busy}
          onSubmit={(name) => void runCreate(name, sheet.parent, sheet.thenMove)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'move' && (
        <PhotoMoveSheet
          title={t('photosTab.moveSheet.title', {
            what: words.what(kindsOf(items.filter((item) => sheet.request.paths.includes(item.path))), sheet.request.paths.length),
          })}
          folders={folders}
          current={currentPath}
          folderLabel={(f) => folderLabel(f.path)}
          contents={(f) => words.contents(f.images, f.videos)}
          wallsFor={(f) => wallsText(f.path)}
          onPick={(to) => void runMove(sheet.request, to)}
          onNewFolder={() => setSheet({ kind: 'newFolder', parent: '', thenMove: sheet.request })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'delete' && (
        <DeleteConfirm
          {...deletePlan(sheet.paths)}
          items={visible}
          walls={(() => {
            // Only the walls that play what is being deleted: a video does not
            // come off a slideshow that shows photos.
            const gone = new Set(sheet.paths);
            const names = wallsOf(currentPath, kindsOf(visible.filter((item) => gone.has(item.path))));
            return names.length > 0 ? words.names(names) : null;
          })()}
          onConfirm={() => void runDelete(sheet.paths, sheet.from)}
          onCancel={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'deleteFolder' && current && (
        <ConfirmSheet
          title={t('photosTab.deleteFolderTitle', { folder: folderLabel(current.path) })}
          description={t('photosTab.deleteFolderBody')}
          confirmLabel={t('photosTab.deleteFolderButton')}
          onConfirm={() => void runDeleteFolder()}
          onCancel={() => setSheet(null)}
          zIndex={220}
        />
      )}
      {sheet?.kind === 'google' && (
        <PhotoGoogleSheet
          folder={currentPath}
          folderLabel={folderLabel(currentPath)}
          whereTheyShow={(kinds, count) => whereTheyShow(currentPath, kinds, count)}
          onImported={() => void refresh()}
          onClose={() => { setSheet(null); void refresh(); }}
        />
      )}
      {sheet?.kind === 'icloud' && (
        <PhotoICloudSheet
          folder={currentPath}
          folderLabel={folderLabel(currentPath)}
          whereTheyShow={(kinds, count) => whereTheyShow(currentPath, kinds, count)}
          onImported={() => void refresh()}
          onClose={() => { setSheet(null); void refresh(); }}
        />
      )}
    </div>
  );
}

function Header({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, padding: '0 0 8px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--hs-text-primary)', margin: 0, letterSpacing: '-0.02em' }}>{title}</h2>
      {children}
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  ghost = false,
  testId,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  ghost?: boolean;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="press-scale"
      style={{
        flex: 1,
        height: 48,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontSize: 15,
        fontWeight: ghost ? 600 : 700,
        fontFamily: 'inherit',
        background: ghost ? 'var(--hs-bg-hover)' : 'transparent',
        color: ghost ? 'var(--hs-text-body)' : 'var(--hs-danger)',
        border: ghost ? 'none' : '1px solid color-mix(in srgb, var(--hs-danger) 35%, transparent)',
        opacity: disabled ? 0.38 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/** The one confirm before a delete: how many go, which slideshow they leave, and what stays. */
function DeleteConfirm({
  going,
  stays,
  items,
  walls,
  onConfirm,
  onCancel,
}: {
  /** The files that will go; the ones the hub keeps are left out. */
  going: string[];
  /** Why the rest stays, when some does. */
  stays: string | null;
  items: readonly MediaInventoryItem[];
  /** The walls that show the folder, joined, or null. */
  walls: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const words = usePhotoWords();
  const kinds = kindsOf(items.filter((item) => going.includes(item.path)));
  const one = going.length === 1;
  const what = words.what(kinds, going.length);
  const title = one
    ? t(kinds.includes('video') ? 'photosTab.deleteVideoTitle' : 'photosTab.deletePhotoTitle')
    : t('photosTab.deleteManyTitle', { what });
  const video = kinds.includes('video');
  const gone = walls
    ? t(one ? (video ? 'photosTab.deleteVideoOnWall' : 'photosTab.deletePhotoOnWall') : 'photosTab.deleteManyOnWall', { walls })
    : t(one ? (video ? 'photosTab.deleteVideoOffWall' : 'photosTab.deletePhotoOffWall') : 'photosTab.deleteManyOffWall');
  const description = stays ? `${gone} ${stays}` : gone;
  return (
    <ConfirmSheet
      title={title}
      description={description}
      confirmLabel={one ? tCore('actions.delete') : t('photosTab.deleteManyButton', { what })}
      onConfirm={onConfirm}
      onCancel={onCancel}
      zIndex={220}
      settleMs={300}
    />
  );
}
