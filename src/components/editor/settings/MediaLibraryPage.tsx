'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { FolderPlus, Monitor, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import {
  createLibraryFolder,
  deleteLibraryFile,
  deleteLibraryFolder,
  moveLibraryFiles,
  renameLibraryFolder,
} from '@/lib/library-client';
import { displayCache } from '@/lib/display-cache';
import { useConfirmStore } from '@/stores/confirm-store';
import { useEditorStore } from '@/stores/editor-store';
import Button from '@/components/ui/Button';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useTranslate } from '@/i18n';
import { MEDIA_SORTERS, type MediaInventory, type MediaInventoryItem, type MediaSortKey } from '@/lib/media-inventory';
import { removalBlocksByFile, rewriteMediaRefs, type MediaUse, type MediaUseKind } from '@/lib/media-usage';
import { TILE_THUMBNAIL_WIDTH, extensionOf, fileNameOf, folderOf, serveUrlFor, typeTagOf } from '@/lib/media-paths';
import { formatBytes } from '@/lib/format-bytes';
import { mediaKindOf } from '@/lib/media-formats';
import { isUnplayableVideo } from '@/lib/video-codec';
import MediaViewer, { UsedByEntry, type UsedByLine } from './MediaViewer';
import { logger } from '@/lib/logger';

const log = logger('media-library');

const KNOWN_USE_KINDS: ReadonlySet<string> = new Set<MediaUseKind>([
  'screen', 'dayRule', 'module', 'slideshow', 'rotation', 'other',
]);

type KindFilter = 'all' | 'image' | 'video';
const KIND_LABELS: Record<KindFilter, string> = {
  all: 'settings.mediaPage.allKinds',
  image: 'settings.mediaPage.images',
  video: 'settings.mediaPage.videos',
};

/** One "where is this used?" line: the usage kind, with the name folded in.
 *  A screen the scanner found no name for reads as untitled rather than
 *  leaking the template's placeholder. Kinds outside the scanner's set (a
 *  future config shape, a hand-edited payload) read as the generic
 *  "somewhere in settings" label rather than a missing-key path. A
 *  slideshow keeping this file as its last picture says so. */
function usageLabel(t: ReturnType<typeof useTranslate>, use: MediaUse, lastPicture = false): string {
  const kind = KNOWN_USE_KINDS.has(use.kind) ? use.kind : 'other';
  const key = kind === 'slideshow' && lastPicture ? 'slideshowLast' : kind;
  return t(`settings.mediaPage.kind.${key}`, { name: use.name || t('settings.mediaPage.unnamed') });
}

/** One file a delete or move left where it was, and the slideshow (if any)
 *  whose last picture it is. */
interface KeptFile {
  path: string;
  file: string;
  slideshow?: string;
}

/** A 409's where-used list as a kept file: a slideshow in it means the file
 *  was that slideshow's last picture (nothing else about a slideshow blocks). */
function keptFile(t: ReturnType<typeof useTranslate>, path: string, usage: readonly MediaUse[]): KeptFile {
  const slideshow = usage.find((use) => use.kind === 'slideshow');
  return {
    path,
    file: fileNameOf(path),
    ...(slideshow ? { slideshow: slideshow.name || t('settings.mediaPage.unnamed') } : {}),
  };
}

/** Badges sit on the photo itself, so they carry their own dark backing
 *  and read the same on a pale sky as on a night shot, in either theme. */
const BADGE_CLASS = 'absolute right-[7px] top-[7px] flex items-center gap-1 rounded-full border bg-black/60 px-2 py-[2px] text-[9.5px] font-bold uppercase tracking-wide';

/** Neutral checker under every thumbnail, so a dark or transparent picture
 *  still reads as a picture against the dark card. */
const CHECKER_STYLE = {
  backgroundImage:
    'conic-gradient(rgba(128,128,128,0.35) 25%, transparent 0 50%, rgba(128,128,128,0.35) 0 75%, transparent 0)',
  backgroundSize: '16px 16px',
} as const;

/** Option value standing in for the top level in the Move menu, since the
 *  empty string is the menu's resting state. */
const TOP_LEVEL_OPTION = '__top__';

const INPUT_CLASS = 'rounded-lg border border-hs-border-strong bg-hs-input px-2.5 py-1.5 text-xs text-hs-text-body';

interface Outcome {
  ok: boolean;
  text: string;
}

export default function MediaLibraryPage() {
  const t = useTranslate('editor');
  const router = useRouter();
  const [inventory, setInventory] = useState<MediaInventory | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [folder, setFolder] = useState<string>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<MediaSortKey>('name');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refused, setRefused] = useState<KeptFile[]>([]);
  const [deleteFailed, setDeleteFailed] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDir, setUploadDir] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Videos held back from the last upload because the wall cannot play them. */
  const [wontPlay, setWontPlay] = useState<string[]>([]);
  const [folderForm, setFolderForm] = useState<{ mode: 'create' | 'rename'; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);
  /** Anchor for shift-click ranges: the path last toggled by a plain click. */
  const rangeAnchorRef = useRef<string | null>(null);

  // Supersede guard: an inventory response only lands if its request is
  // still the latest one, so an upload's refresh cannot be overwritten by a
  // delete's slower stale response.
  const refreshReqIdRef = useRef(0);
  const refresh = useCallback(async () => {
    const myReqId = ++refreshReqIdRef.current;
    try {
      const res = await editorFetch('/api/backgrounds/inventory');
      if (myReqId !== refreshReqIdRef.current) return;
      if (!res.ok) {
        setLoadFailed(true);
        return;
      }
      setInventory((await res.json()) as MediaInventory);
      setLoadFailed(false);
    } catch (err) {
      if (myReqId !== refreshReqIdRef.current) return;
      log.debug('Failed to load media inventory:', err);
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loading = inventory === null && !loadFailed;
  const items = inventory?.items ?? [];
  const uses = useMemo(() => inventory?.usage ?? {}, [inventory]);
  const directories = inventory?.directories ?? [];
  const missing = inventory?.missing ?? [];
  const storage = inventory?.storage;
  const usesOf = (path: string): MediaUse[] => uses[path] ?? [];
  // A file is locked when a screen depends on it, or when it is the last
  // picture a slideshow has; the other pictures a slideshow plays can go.
  const locks = useMemo(() => removalBlocksByFile(uses, 'delete'), [uses]);
  const query = search.trim().toLowerCase();
  const matches = (item: MediaInventoryItem, inFolder: string) =>
    (inFolder === 'all' || folderOf(item.path) === inFolder)
    && (kind === 'all' || item.kind === kind)
    && (!unusedOnly || usesOf(item.path).length === 0)
    && (!query || fileNameOf(item.path).toLowerCase().includes(query));
  const visible = items.filter((item) => matches(item, folder)).sort(MEDIA_SORTERS[sort]);
  const countIn = (f: string) => items.filter((item) => matches(item, f)).length;
  const bytesIn = (f: string) => items
    .filter((item) => f === 'all' || folderOf(item.path) === f)
    .reduce((sum, item) => sum + item.bytes, 0);
  const usedByLines = (path: string): UsedByLine[] => {
    const lock = locks.get(path) ?? [];
    return usesOf(path).map((use) => ({ label: usageLabel(t, use, lock.includes(use)), use }));
  };
  const currentFolder = folder === 'all' || folder === '' ? null : folder;
  const allVisibleSelected = visible.length > 0 && visible.every((item) => selected.has(item.path));

  /** Checkbox click: shift extends from the last plain click across the
   *  grid's current order, so a range means what the eye sees. */
  const toggle = (path: string, e?: MouseEvent<HTMLInputElement>) => {
    if (busy) return;
    const anchor = rangeAnchorRef.current;
    if (e?.shiftKey && anchor && anchor !== path) {
      const order = visible.map((item) => item.path);
      const a = order.indexOf(anchor);
      const b = order.indexOf(path);
      if (a !== -1 && b !== -1) {
        const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
        setSelected((prev) => {
          const next = new Set(prev);
          for (const p of range) next.add(p);
          return next;
        });
        return;
      }
    }
    rangeAnchorRef.current = path;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAllVisible = () => {
    if (busy) return;
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((item) => item.path)));
  };

  const clearOutcome = () => {
    setRefused([]);
    setDeleteFailed(0);
    setOutcome(null);
  };

  /** Every mutation ends the same way: canvas previews forget their listing,
   *  the inventory reloads, and the page tells the user what happened. */
  const finish = async (result: Outcome | null) => {
    displayCache.invalidateByPrefix('/api/backgrounds');
    if (result) setOutcome(result);
    await refresh();
  };

  /** Jump into the editor on the screen (and module) a use names. The store
   *  is pointed there first, because the editor keeps its loaded config on a
   *  client-side navigation and only reads the URL on a fresh load. */
  const openUse = useCallback((use: MediaUse) => {
    if (!use.screenId) return;
    const store = useEditorStore.getState();
    if (use.displayId && store.selectedDisplayId !== use.displayId) store.setSelectedDisplay(use.displayId);
    store.selectScreen(use.screenId);
    store.selectModule(use.moduleId ?? null);
    const params = new URLSearchParams();
    if (use.displayId) params.set('display', use.displayId);
    params.set('screen', use.screenId);
    if (use.moduleId) params.set('module', use.moduleId);
    router.push(`/editor?${params.toString()}`);
  }, [router]);

  /**
   * The server rewrote config references on disk; the editor's copy must not
   * lag behind or "Open in the editor" shows old paths and the next save
   * conflicts (see adoptHubRewrite).
   */
  const adoptConfigChange = (
    revisions: { previousRevision: string; revision: string },
    mapFile: (p: string) => string | null,
    mapFolder: (folder: string) => string | null,
  ) => {
    void useEditorStore.getState().adoptHubRewrite({
      rewrite: (config) => rewriteMediaRefs(config, mapFile, mapFolder).config,
      previousRevision: revisions.previousRevision ?? null,
      revision: revisions.revision,
    });
  };

  const uploadFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    // Reset the picker synchronously (the File objects are already captured)
    // so re-picking the same file later fires a change event even when the
    // early return below skips the upload.
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (files.length === 0 || busy) return;
    setBusy(true);
    setUploadError(null);
    clearOutcome();
    try {
      // A video the wall cannot play would upload fine and then show as a
      // black slide, so it stays behind with the reason and the rest go.
      const unplayable: string[] = [];
      const sending: File[] = [];
      for (const file of files) {
        const video = file.type.startsWith('video/') || mediaKindOf(file.name) === 'video';
        if (video && await isUnplayableVideo(file)) unplayable.push(file.name);
        else sending.push(file);
      }
      setWontPlay(unplayable);
      if (sending.length === 0) return;
      const formData = new FormData();
      for (const file of sending) formData.append('file', file);
      if (uploadDir) formData.append('directory', uploadDir);
      const res = await editorFetch('/api/backgrounds', { method: 'POST', body: formData, timeoutMs: null });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setUploadError(
          data.error ?? t('settings.mediaPage.uploadFailedWithStatus', { status: res.status }),
        );
        return;
      }
      // Kept open while it says why a video stayed behind.
      if (unplayable.length === 0) setUploadOpen(false);
      // Back to the unfiltered view so freshly uploaded files are on screen
      // instead of hidden behind a filter that predates them.
      setFolder('all');
      setKind('all');
      setUnusedOnly(false);
      setSearch('');
      await finish(null);
    } catch (err) {
      if (!isSessionExpired(err)) {
        setUploadError(err instanceof Error ? err.message : t('settings.mediaPage.uploadFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  /** Overwrite one library file in place; every reference keeps working
   *  because the name does not change. */
  const replaceFile = async (path: string, file: File) => {
    if (busy) return;
    setBusy(true);
    clearOutcome();
    const name = fileNameOf(path);
    const formData = new FormData();
    formData.append('replace', path);
    formData.append('file', file);
    try {
      // Same rule as an upload: a video the wall cannot play never replaces one it can.
      const video = file.type.startsWith('video/') || mediaKindOf(file.name) === 'video';
      if (video && await isUnplayableVideo(file)) {
        setOutcome({ ok: false, text: t('settings.mediaPage.wontPlay', { name: file.name }) });
        return;
      }
      const res = await editorFetch('/api/backgrounds', { method: 'POST', body: formData, timeoutMs: null });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setOutcome({ ok: false, text: data.error ?? t('settings.mediaPage.replaceFailed', { file: name }) });
        return;
      }
      await finish({ ok: true, text: t('settings.mediaPage.replaced', { file: name }) });
    } catch (err) {
      if (!isSessionExpired(err)) {
        setOutcome({ ok: false, text: t('settings.mediaPage.replaceFailed', { file: name }) });
      }
    } finally {
      setBusy(false);
    }
  };

  /** The tile's Replace button opens one shared hidden picker; the target
   *  is remembered until the pick lands. */
  const pickReplacement = (path: string, itemKind: MediaInventoryItem['kind']) => {
    replaceTargetRef.current = path;
    const input = replaceInputRef.current;
    if (!input) return;
    input.accept = itemKind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/*';
    input.click();
  };

  /** Confirm, then delete the given files one by one; both the batch button
   *  and the per-tile buttons land here. */
  const deleteFiles = async (paths: string[]) => {
    if (paths.length === 0 || busy) return;
    const confirmed = await useConfirmStore.getState().confirm({
      title: t('settings.mediaPage.deleteTitle', { count: paths.length }),
      message: t('settings.mediaPage.deleteMessage', { count: paths.length }),
      confirmLabel: t('settings.mediaPage.deleteConfirm'),
      variant: 'danger',
    });
    if (!confirmed) return;
    setBusy(true);
    clearOutcome();
    const refusedNow: KeptFile[] = [];
    let failedNow = 0;
    let deletedAny = false;
    for (const path of paths) {
      try {
        const result = await deleteLibraryFile(path);
        // 409: a screen depends on it, or it is the last picture a slideshow
        // still has once the ones before it in this batch are gone.
        if (result.ok) deletedAny = true;
        else if (result.status === 409) refusedNow.push(keptFile(t, path, result.usage));
        else failedNow += 1;
      } catch (err) {
        log.debug('Failed to delete background:', err);
        if (!isSessionExpired(err)) failedNow += 1;
      }
    }
    if (deletedAny) displayCache.invalidateByPrefix('/api/backgrounds');
    setSelected(new Set());
    setRefused(refusedNow);
    setDeleteFailed(failedNow);
    await refresh();
    // Busy clears only after the post-delete refresh settles, so no upload can
    // slip a refresh into the gap and have the delete's slower response
    // superseded (or the buttons un-disable early).
    setBusy(false);
  };

  /** Move the selection into a folder; the server rewrites every reference. */
  const moveSelected = async (directory: string) => {
    const paths = [...selected];
    if (paths.length === 0 || busy) return;
    const confirmed = await useConfirmStore.getState().confirm({
      title: t('settings.mediaPage.moveTitle', { count: paths.length }),
      message: t('settings.mediaPage.moveMessage', { count: paths.length }),
      confirmLabel: t('settings.mediaPage.moveConfirm'),
    });
    if (!confirmed) return;
    setBusy(true);
    clearOutcome();
    try {
      const result = await moveLibraryFiles(paths, directory);
      if (!result.ok || !result.data) {
        setOutcome({ ok: false, text: result.error ?? t('settings.mediaPage.moveFailed') });
        return;
      }
      setSelected(new Set());
      const byFrom = new Map(result.data.moved.map((m) => [m.from, m.to]));
      adoptConfigChange(result.data, (p) => byFrom.get(p) ?? null, () => null);
      const movedText = t('settings.mediaPage.moved', { count: result.data.moved.length });
      const refsText = result.data.rewritten > 0
        ? ` ${t('settings.mediaPage.placesUpdated', { count: result.data.rewritten })}`
        : '';
      // Each slideshow's last picture stays where it was, so no wall goes blank.
      setRefused(result.data.kept.map((k) => keptFile(t, k.path, k.usage)));
      await finish({ ok: true, text: movedText + refsText });
    } catch (err) {
      if (!isSessionExpired(err)) setOutcome({ ok: false, text: t('settings.mediaPage.moveFailed') });
    } finally {
      setBusy(false);
    }
  };

  const submitFolderForm = async () => {
    if (!folderForm || busy) return;
    const name = folderForm.name.trim();
    if (!name) return;
    setBusy(true);
    clearOutcome();
    try {
      if (folderForm.mode === 'create') {
        // A new folder goes under the folder being viewed, so the chips read
        // as a tree; at the top level (or All) it goes at the top level.
        const result = await createLibraryFolder(name, currentFolder ?? undefined);
        if (!result.ok || !result.data) {
          setOutcome({ ok: false, text: result.error ?? t('settings.mediaPage.createFolderFailed') });
          return;
        }
        setFolderForm(null);
        setFolder(result.data.path);
        await finish({ ok: true, text: t('settings.mediaPage.folderCreated', { name: result.data.path }) });
      } else if (currentFolder) {
        const result = await renameLibraryFolder(currentFolder, name);
        if (!result.ok || !result.data) {
          setOutcome({ ok: false, text: result.error ?? t('settings.mediaPage.renameFolderFailed') });
          return;
        }
        setFolderForm(null);
        setFolder(result.data.to);
        const { from, to } = result.data;
        const prefix = `${from}/`;
        adoptConfigChange(
          result.data,
          (p) => (p.startsWith(prefix) ? to + p.slice(from.length) : null),
          (f) => (f === from ? to : f.startsWith(prefix) ? to + f.slice(from.length) : null),
        );
        const refsText = result.data.rewritten > 0
          ? ` ${t('settings.mediaPage.placesUpdated', { count: result.data.rewritten })}`
          : '';
        await finish({ ok: true, text: t('settings.mediaPage.folderRenamed', { name: result.data.to }) + refsText });
      }
    } catch (err) {
      if (!isSessionExpired(err)) {
        setOutcome({ ok: false, text: t(folderForm.mode === 'create' ? 'settings.mediaPage.createFolderFailed' : 'settings.mediaPage.renameFolderFailed') });
      }
    } finally {
      setBusy(false);
    }
  };

  const deleteCurrentFolder = async () => {
    if (!currentFolder || busy) return;
    const confirmed = await useConfirmStore.getState().confirm({
      title: t('settings.mediaPage.deleteFolderTitle', { name: currentFolder }),
      message: t('settings.mediaPage.deleteFolderMessage'),
      confirmLabel: t('settings.mediaPage.deleteConfirm'),
      variant: 'danger',
    });
    if (!confirmed) return;
    setBusy(true);
    clearOutcome();
    try {
      const result = await deleteLibraryFolder(currentFolder);
      if (!result.ok) {
        setOutcome({
          ok: false,
          text: result.status === 409
            ? t('settings.mediaPage.folderNotEmpty')
            : result.error ?? t('settings.mediaPage.deleteFolderFailed'),
        });
        return;
      }
      setFolder('all');
      await finish({ ok: true, text: t('settings.mediaPage.folderDeleted', { name: currentFolder }) });
    } catch (err) {
      if (!isSessionExpired(err)) setOutcome({ ok: false, text: t('settings.mediaPage.deleteFolderFailed') });
    } finally {
      setBusy(false);
    }
  };

  const chipClass = (on: boolean) => clsx(
    'rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors',
    on
      ? 'border-hs-accent bg-hs-accent/20 text-hs-text-body'
      : 'border-hs-border-strong text-hs-text-muted hover:text-hs-text-body',
  );
  const iconButtonClass = 'flex h-7 items-center gap-1 rounded-full border border-hs-border-strong px-2.5 text-[11px] font-semibold text-hs-text-muted hover:text-hs-text-body disabled:opacity-50';

  // The viewer steps through whatever the grid shows; a deleted file simply
  // drops out of `visible`, which closes the viewer on the next render.
  const viewingIndex = viewing ? visible.findIndex((item) => item.path === viewing) : -1;
  const viewingItem = viewingIndex === -1 ? null : visible[viewingIndex];
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const stepViewer = useCallback((delta: 1 | -1) => {
    setViewing((current) => {
      const list = visibleRef.current;
      if (!current) return current;
      const idx = list.findIndex((item) => item.path === current);
      if (idx === -1 || list.length < 2) return current;
      return list[(idx + delta + list.length) % list.length].path;
    });
  }, []);
  const closeViewer = useCallback(() => setViewing(null), []);

  const storageLine = storage
    ? (storage.freeBytes != null
      ? t('settings.mediaPage.storage', { size: formatBytes(storage.bytes), free: formatBytes(storage.freeBytes) })
      : t('settings.mediaPage.storageNoFree', { size: formatBytes(storage.bytes) }))
    : '';

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <Button
          variant="primary"
          size="sm"
          onClick={() => setUploadOpen((open) => !open)}
          disabled={busy}
          data-testid="media-upload-button"
        >
          {t('settings.mediaPage.upload')}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => void deleteFiles([...selected])}
          disabled={selected.size === 0 || busy}
          data-testid="media-delete-button"
        >
          {t('settings.mediaPage.deleteConfirm')}
        </Button>
        {/* The resting option is the empty value so the menu reads "Move to"
            until a folder is picked; the top level gets its own marker. */}
        <select
          value=""
          onChange={(e) => { const dir = e.target.value; if (dir) void moveSelected(dir === TOP_LEVEL_OPTION ? '' : dir); }}
          disabled={selected.size === 0 || busy}
          aria-label={t('settings.mediaPage.moveTo')}
          data-testid="media-move-select"
          className={clsx(INPUT_CLASS, 'disabled:opacity-50')}
        >
          <option value="">{t('settings.mediaPage.moveTo')}</option>
          <option value={TOP_LEVEL_OPTION}>{t('settings.mediaPage.topLevel')}</option>
          {directories.map((d) => (
            <option key={d.path} value={d.path}>{d.path}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={selectAllVisible}
          disabled={busy || visible.length === 0}
          data-testid="media-select-all"
          className="text-xs font-semibold text-hs-accent hover:underline disabled:opacity-50"
        >
          {allVisibleSelected ? t('settings.mediaPage.clearSelection') : t('settings.mediaPage.selectAll')}
        </button>
        <span className="ml-auto text-xs text-hs-text-muted" data-testid="media-selected-count">
          {selected.size > 0 ? t('settings.mediaPage.selected', { count: selected.size }) : ''}
        </span>
      </div>

      {loadFailed && (
        <div
          className="mb-3 flex items-center gap-2.5 text-xs text-hs-danger"
          data-testid="media-load-error"
        >
          <span>{t('settings.mediaPage.loadFailed')}</span>
          <button
            type="button"
            onClick={() => { clearOutcome(); void refresh(); }}
            disabled={busy}
            className="font-semibold text-hs-accent hover:underline disabled:opacity-50"
            data-testid="media-retry-button"
          >
            {t('settings.mediaPage.tryAgain')}
          </button>
        </div>
      )}

      {missing.length > 0 && (
        <div
          className="mb-4 rounded-[10px] border border-hs-warning/40 bg-hs-warning/10 px-3 py-2.5 text-xs"
          data-testid="media-missing"
        >
          <div className="mb-1 font-semibold text-hs-warning">{t('settings.mediaPage.missingHeading')}</div>
          <div className="flex flex-col gap-0.5 text-hs-text-muted">
            {missing.flatMap((entry) => entry.uses.map((use, i) => (
              <UsedByEntry
                key={`${entry.kind}:${entry.path}:${i}`}
                line={{
                  use,
                  label: t(
                    entry.kind === 'folder' ? 'settings.mediaPage.missingFolder' : 'settings.mediaPage.missingFile',
                    { where: usageLabel(t, use), path: entry.path },
                  ),
                }}
                t={t}
                onOpenUse={openUse}
                className="text-hs-text-muted"
              />
            )))}
          </div>
        </div>
      )}

      {uploadOpen && (
        <div
          className="mb-4 flex flex-col gap-2.5 rounded-[10px] border border-hs-border-strong bg-hs-card p-3"
          data-testid="media-upload-panel"
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              void uploadFiles(e.dataTransfer.files);
            }}
            data-dropzone=""
            className={clsx(
              'rounded-lg border-[1.5px] border-dashed px-2.5 py-[22px] text-center text-xs',
              dragActive
                ? 'border-hs-accent bg-hs-accent/10 text-hs-text-body'
                : 'border-hs-border-strong text-hs-text-muted',
            )}
          >
            {t('settings.mediaPage.dropzone')}
          </button>
          <label className="flex items-center gap-2 text-xs text-hs-text-muted">
            {t('settings.mediaPage.saveInto')}
            <select
              value={uploadDir}
              onChange={(e) => setUploadDir(e.target.value)}
              data-upload-directory=""
              className={INPUT_CLASS}
            >
              <option value="">{t('settings.mediaPage.topLevel')}</option>
              {directories.map((d) => (
                <option key={d.path} value={d.path}>{d.path}</option>
              ))}
            </select>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/mp4,video/webm,video/quicktime"
            onChange={(e) => void uploadFiles(e.target.files)}
            data-file-input=""
            className="hidden"
          />
          {uploadError && (
            <p className="text-xs text-hs-danger" data-testid="media-upload-error">{uploadError}</p>
          )}
          {wontPlay.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-hs-warning" data-testid="media-upload-wont-play">
              {wontPlay.map((name) => (
                <li key={name}>{t('settings.mediaPage.wontPlay', { name })}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <input
        ref={replaceInputRef}
        type="file"
        className="hidden"
        data-testid="media-replace-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const target = replaceTargetRef.current;
          e.target.value = '';
          replaceTargetRef.current = null;
          if (file && target) void replaceFile(target, file);
        }}
      />

      <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={folder === 'all'}
            onClick={() => setFolder('all')}
            data-testid="media-chip-all"
            title={formatBytes(bytesIn('all'))}
            className={chipClass(folder === 'all')}
          >
            {t('settings.mediaPage.allFolders')}
            <span className="ml-1 font-medium text-hs-text-faint" data-count="">{countIn('all')}</span>
          </button>
          <button
            type="button"
            aria-pressed={folder === ''}
            onClick={() => setFolder('')}
            data-testid="media-chip-root"
            title={formatBytes(bytesIn(''))}
            className={chipClass(folder === '')}
          >
            {t('settings.mediaPage.topLevel')}
            <span className="ml-1 font-medium text-hs-text-faint" data-count="">{countIn('')}</span>
          </button>
          {directories.map((d) => (
            <button
              key={d.path}
              type="button"
              aria-pressed={folder === d.path}
              onClick={() => setFolder(d.path)}
              data-testid={`media-chip-${d.path}`}
              title={formatBytes(bytesIn(d.path))}
              className={chipClass(folder === d.path)}
            >
              {d.path}
              <span className="ml-1 font-medium text-hs-text-faint" data-count="">{countIn(d.path)}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFolderForm({ mode: 'create', name: '' })}
            disabled={busy || (currentFolder != null && currentFolder.includes('/'))}
            aria-label={t('settings.mediaPage.newFolder')}
            title={t('settings.mediaPage.newFolder')}
            data-testid="media-folder-create"
            className={iconButtonClass}
          >
            <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('settings.mediaPage.newFolder')}
          </button>
          {currentFolder && (
            <>
              <button
                type="button"
                onClick={() => setFolderForm({ mode: 'rename', name: fileNameOf(currentFolder) })}
                disabled={busy}
                aria-label={t('settings.mediaPage.renameFolder')}
                title={t('settings.mediaPage.renameFolder')}
                data-testid="media-folder-rename"
                className={iconButtonClass}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                {t('settings.mediaPage.renameFolder')}
              </button>
              <button
                type="button"
                onClick={() => void deleteCurrentFolder()}
                disabled={busy}
                aria-label={t('settings.mediaPage.deleteFolder')}
                title={t('settings.mediaPage.deleteFolder')}
                data-testid="media-folder-delete"
                className={clsx(iconButtonClass, 'hover:text-hs-danger')}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('settings.mediaPage.deleteFolder')}
              </button>
            </>
          )}
        </div>
      </div>

      {folderForm && (
        <form
          className="mb-3 flex flex-wrap items-center gap-2"
          data-testid="media-folder-form"
          onSubmit={(e) => { e.preventDefault(); void submitFolderForm(); }}
        >
          <input
            type="text"
            value={folderForm.name}
            onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })}
            placeholder={t('settings.mediaPage.folderName')}
            aria-label={t('settings.mediaPage.folderName')}
            autoFocus
            data-testid="media-folder-name"
            className={INPUT_CLASS}
          />
          <Button type="submit" variant="primary" size="sm" disabled={busy || !folderForm.name.trim()} data-testid="media-folder-submit">
            {t(folderForm.mode === 'create' ? 'settings.mediaPage.create' : 'settings.mediaPage.save')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setFolderForm(null)} disabled={busy}>
            {t('settings.mediaPage.cancel')}
          </Button>
        </form>
      )}

      <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('settings.mediaPage.search')}
          aria-label={t('settings.mediaPage.search')}
          data-testid="media-search"
          className={clsx(INPUT_CLASS, 'w-[200px]')}
        />
        <label className="flex items-center gap-1.5 text-xs text-hs-text-muted">
          {t('settings.mediaPage.sort')}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as MediaSortKey)}
            data-testid="media-sort"
            className={INPUT_CLASS}
          >
            <option value="name">{t('settings.mediaPage.sortName')}</option>
            <option value="newest">{t('settings.mediaPage.sortNewest')}</option>
            <option value="largest">{t('settings.mediaPage.sortLargest')}</option>
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-pressed={unusedOnly}
            onClick={() => setUnusedOnly((on) => !on)}
            data-testid="media-unused-only"
            className={chipClass(unusedOnly)}
          >
            {t('settings.mediaPage.unusedOnly')}
          </button>
          <div className="min-w-[260px]" data-testid="media-kind-filter">
            <SegmentedControl
              value={kind}
              onChange={setKind}
              options={(['all', 'image', 'video'] as const).map((k) => ({ value: k, label: t(KIND_LABELS[k]) }))}
              label={t('settings.mediaPage.kindFilter')}
            />
          </div>
        </div>
      </div>

      {storageLine && (
        <p className="mb-4 text-[11px] text-hs-text-faint" data-testid="media-storage">{storageLine}</p>
      )}

      {(refused.length > 0 || deleteFailed > 0 || outcome) && (
        <div className="mb-3 flex flex-col gap-1" data-testid="media-refused">
          {refused.map((kept) => (
            // Keeping a slideshow's last picture is the rule working, not a failure.
            <p key={kept.path} className={clsx('text-xs', kept.slideshow ? 'text-hs-warning' : 'text-hs-danger')}>
              {kept.slideshow
                ? t('settings.mediaPage.keptLast', { file: kept.file, name: kept.slideshow })
                : t('settings.mediaPage.refused', { file: kept.file })}
            </p>
          ))}
          {deleteFailed > 0 && (
            <p className="text-xs text-hs-danger" data-testid="media-delete-failed">
              {t('settings.mediaPage.deleteFailed', { count: deleteFailed })}
            </p>
          )}
          {outcome && (
            <p
              className={clsx('text-xs', outcome.ok ? 'text-hs-text-muted' : 'text-hs-danger')}
              data-testid="media-outcome"
              data-ok={outcome.ok ? 'true' : 'false'}
            >
              {outcome.text}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2.5">
        {visible.map((item) => {
          const name = fileNameOf(item.path);
          const lines = usedByLines(item.path);
          const isUsed = lines.length > 0;
          // In use: a screen depends on it (or it is a slideshow's last
          // picture). Otherwise a used file is only playing in slideshows,
          // which carry on with their other pictures, so it can go.
          const isLocked = locks.has(item.path);
          const isSelected = selected.has(item.path);
          const usedByTitle = lines.map((line) => line.label).join(', ');
          return (
            <div
              key={item.path}
              data-media-path={item.path}
              data-testid={`media-tile-${item.path}`}
              data-selected={isSelected ? 'true' : undefined}
              className={clsx(
                'group relative rounded-[10px] border bg-hs-card',
                isSelected ? 'border-hs-accent ring-1 ring-hs-accent' : 'border-hs-border-strong',
              )}
            >
              {/* The tile body opens the viewer; selection lives only on the
                  checkbox, so browsing never toggles a file into the batch. */}
              <button
                type="button"
                onClick={() => setViewing(item.path)}
                aria-label={t('settings.mediaPage.open', { file: name })}
                data-testid="media-tile-open"
                className="block w-full cursor-pointer rounded-[9px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hs-accent"
              >
                <div
                  className="relative aspect-[4/3] w-full overflow-hidden rounded-t-[9px] bg-hs-input"
                  style={CHECKER_STYLE}
                >
                  {item.kind === 'video' ? (
                    <>
                      {/* metadata preload paints the first frame and nothing
                          more; the serve route answers the range request. */}
                      <video
                        src={serveUrlFor(item.path, { version: item.mtimeMs })}
                        preload="metadata"
                        muted
                        playsInline
                        aria-hidden="true"
                        className="pointer-events-none h-full w-full object-cover"
                      />
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55">
                          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-white">
                            <path d="M8 5.5v13l11-6.5z" />
                          </svg>
                        </span>
                      </span>
                    </>
                  ) : (
                    <img
                      src={serveUrlFor(item.path, { width: TILE_THUMBNAIL_WIDTH, version: item.mtimeMs })}
                      alt={name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex flex-col gap-px px-2 py-1.5">
                  <span className="truncate text-[11.5px] font-semibold text-hs-text-body">{name}</span>
                  <span className="flex items-center gap-1.5 text-[10.5px] text-hs-text-muted">
                    <span className="truncate">
                      {item.width != null && item.height != null && `${item.width}×${item.height} · `}
                      <span className="font-semibold">{formatBytes(item.bytes)}</span>
                    </span>
                    <span
                      className="ml-auto shrink-0 rounded border border-hs-border-strong px-1 font-mono text-[9px] font-bold tracking-wide text-hs-text-faint"
                      data-type-tag=""
                    >
                      {typeTagOf(item.path)}
                    </span>
                  </span>
                </div>
              </button>
              {/* Used files can be selected too: a move keeps every reference
                  working, and a delete simply reports the ones it kept. */}
              <input
                type="checkbox"
                checked={isSelected}
                disabled={busy}
                aria-label={t('settings.mediaPage.select', { file: name })}
                title={isUsed ? usedByTitle : undefined}
                onClick={(e) => toggle(item.path, e)}
                onChange={() => { /* handled on click so the shift key is available */ }}
                className="absolute left-[7px] top-[7px] h-4 w-4 cursor-pointer accent-[var(--hs-accent)]"
              />
              {!isLocked && (
                <button
                  type="button"
                  onClick={() => void deleteFiles([item.path])}
                  disabled={busy}
                  aria-label={t('settings.mediaPage.deleteOne', { file: name })}
                  title={t('settings.mediaPage.deleteConfirm')}
                  data-testid="media-tile-delete"
                  className={clsx(
                    'absolute right-[7px] flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white/85 opacity-0 transition-opacity hover:bg-hs-danger hover:text-white focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-0',
                    isUsed ? 'top-[30px]' : 'top-[7px]',
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {isUsed && (
                <>
                  {isLocked ? (
                    <span
                      data-in-use=""
                      title={usedByTitle}
                      className={clsx(BADGE_CLASS, 'border-amber-400/55 text-amber-400')}
                    >
                      {t('settings.mediaPage.inUse')}
                    </span>
                  ) : (
                    <span
                      data-slideshow=""
                      title={usedByTitle}
                      className={clsx(BADGE_CLASS, 'border-green-400/55 text-green-400')}
                    >
                      <Monitor className="h-[11px] w-[11px]" aria-hidden="true" />
                      {t('settings.mediaPage.inSlideshow')}
                    </span>
                  )}
                  {/* Swapping the file in place keeps every reference
                      working, so it is offered on every used file: the only
                      change a locked one allows, and under Delete on the rest. */}
                  <button
                    type="button"
                    onClick={() => pickReplacement(item.path, item.kind)}
                    disabled={busy}
                    aria-label={t('settings.mediaPage.replaceOne', { file: name })}
                    title={t('settings.mediaPage.replaceHint', { ext: extensionOf(item.path) })}
                    data-testid="media-tile-replace"
                    className={clsx(
                      'absolute right-[7px] flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white/85 opacity-0 transition-opacity hover:bg-hs-accent hover:text-white focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-0',
                      isLocked ? 'top-[30px]' : 'top-[62px]',
                    )}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  {/* The tile deliberately has no overflow clipping so this
                      popover can reach past its bottom edge. */}
                  <div
                    data-used-by=""
                    className="absolute right-1.5 top-[calc(100%-2px)] z-10 hidden w-[190px] rounded-lg border border-hs-border-strong bg-hs-card p-2 shadow-xl group-hover:block"
                  >
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-hs-text-faint">
                      {t('settings.mediaPage.usedBy')}
                    </div>
                    <div className="text-[11px] leading-relaxed text-hs-text-muted">
                      {lines.map((line, i) => (
                        <UsedByEntry key={`${line.use.configPath}-${i}`} line={line} t={t} onOpenUse={openUse} />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {loading && (
        <p className="text-sm text-hs-text-faint" data-testid="media-loading">
          {t('settings.mediaPage.loading')}
        </p>
      )}

      {!loading && !loadFailed && visible.length === 0 && (
        <p className="text-sm text-hs-text-faint" data-testid="media-empty">
          {items.length === 0 ? t('settings.mediaPage.empty') : t('settings.mediaPage.emptyFiltered')}
        </p>
      )}

      {viewingItem && (
        <MediaViewer
          item={viewingItem}
          usedBy={usedByLines(viewingItem.path)}
          lockHint={locks.get(viewingItem.path)?.some((use) => use.kind === 'slideshow')
            ? folderOf(viewingItem.path)
              ? t('settings.mediaPage.viewer.lastPictureHint', { folder: folderOf(viewingItem.path) })
              : t('settings.mediaPage.viewer.lastPictureHintTop')
            : undefined}
          index={viewingIndex}
          total={visible.length}
          t={t}
          onClose={closeViewer}
          onStep={stepViewer}
          onDelete={locks.has(viewingItem.path) ? undefined : () => void deleteFiles([viewingItem.path])}
          onReplace={(file) => void replaceFile(viewingItem.path, file)}
          onOpenUse={openUse}
          busy={busy}
        />
      )}
    </div>
  );
}
