'use client';

import { useEffect, useReducer, useRef } from 'react';
import { displayFetch } from '@/lib/display-fetch';

export interface AuthImageOptions {
  /**
   * What to show while a changed `src` is still loading.
   *
   * `true` (default) keeps the previously loaded image on screen until the
   * new one is ready — right for a lone <img> whose caller unmounts or blanks
   * it when this returns nothing, like the screen background, which would
   * otherwise flash black on every rotation.
   *
   * `false` returns undefined instead, so the URL only ever renders while it
   * belongs to the CURRENT src. Right for a crossfade slide layer, which
   * becomes active the moment its src changes and stays mounted-but-hidden
   * while the blob loads: serving the previous blob there made every rotation
   * briefly flash the photo from two advances back.
   */
  holdPrevious?: boolean;
}

export type AuthImageStatus =
  /** No src. */
  | 'idle'
  /** The bytes for the CURRENT src are still on their way. */
  | 'loading'
  /** `url` renders the current src. */
  | 'ready'
  /** The current src could not be fetched (non-2xx or network error). */
  | 'failed';

export interface AuthImageState {
  /** What to hand `<img src>`: the blob URL, the static path, or nothing. */
  url: string | undefined;
  status: AuthImageStatus;
}

// ── Shared picture cache ─────────────────────────────────────────────
//
// One blob URL per picture for the whole page, shared by every hook showing
// it and kept for a while after the last one lets go. A new blob URL is a new
// image to the browser: when every mount made its own, each return of a
// screen downloaded, decoded and uploaded its background to the GPU again
// (about 2,900 times a day on a three-screen wall), and the screen faded in
// over the previous screen's picture while its own was still on the way. A
// kept URL shows at once and the browser can reuse the decoded picture.

interface CachedImage {
  src: string;
  /** Blob URL once the bytes are in. */
  url: string | undefined;
  /** The bytes behind `url`, to compare with a recheck that brings no ETag. */
  blob: Blob | undefined;
  /** The answer's ETag, to tell a replaced file from an unchanged one. */
  etag: string | null;
  bytes: number;
  failed: boolean;
  /** Re-render callbacks of the hooks showing (or waiting on) this picture. */
  users: Set<() => void>;
  /** When the hub last confirmed these bytes. */
  checkedAt: number;
  /** When a hook last rendered it or let go of it, for eviction order. */
  lastUsed: number;
  busy: boolean;
}

const cache = new Map<string, CachedImage>();

/** Pictures nobody shows right now that stay loaded: the other screens'
 *  backgrounds and the slideshow photos around the current one. */
const MAX_IDLE_PICTURES = 12;
const MAX_IDLE_BYTES = 64 * 1024 * 1024;
/** A picture rendered this recently is about to be claimed by the hook that
 *  rendered it (its effect runs after the paint), so it is never evicted. */
const RECENTLY_USED_MS = 5_000;
/** A picture coming back into use is checked with the hub (one conditional
 *  request, a bodiless 304 when unchanged) unless it was checked this recently. */
const RECHECK_AFTER_MS = 10_000;
/** A replaced picture's old URL outlives the swap long enough for any
 *  <img> still loading it to finish. */
const REVOKE_DELAY_MS = 30_000;

/** Only API-served images need the display token; static paths load as they are. */
function isHubImage(src: string): boolean {
  return src.startsWith('/api/');
}

function notify(entry: CachedImage): void {
  for (const rerender of [...entry.users]) rerender();
}

async function load(entry: CachedImage): Promise<void> {
  entry.busy = true;
  try {
    const res = await displayFetch(entry.src);
    if (!res.ok) {
      entry.failed = true;
      return;
    }
    const etag = res.headers.get('etag');
    const blob = await res.blob();
    entry.url = URL.createObjectURL(blob);
    entry.blob = blob;
    entry.etag = etag;
    entry.bytes = blob.size;
    entry.failed = false;
    entry.checkedAt = Date.now();
  } catch {
    entry.failed = true;
  } finally {
    entry.busy = false;
    settleUnused(entry);
    notify(entry);
  }
}

/**
 * A fetch settled after everyone let go of the picture (release cannot tidy
 * an entry while its fetch is out). A failure is not kept, so the next mount
 * asks again; a picture joins the idle ones eviction weighs.
 */
function settleUnused(entry: CachedImage): void {
  if (entry.users.size > 0) return;
  entry.lastUsed = Date.now();
  if (entry.failed) forget(entry);
  else scheduleEviction();
}

function forget(entry: CachedImage): void {
  if (cache.get(entry.src) === entry) cache.delete(entry.src);
}

async function sameBytes(a: Blob, b: Blob): Promise<boolean> {
  if (a.size !== b.size) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const left = new Uint8Array(x);
  const right = new Uint8Array(y);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
  return true;
}

/**
 * Ask the hub whether a kept picture is still current. For a library picture
 * the browser sends the cached ETag and gets a 304 without a body when the
 * file is unchanged, so the picture keeps its URL and its decoded pixels. A
 * route that sends no tag (Immich and OneDrive previews) is answered from
 * the browser's cache until that expires, and its bytes are compared instead.
 * A replaced picture is swapped in; a deleted one fails like a fresh fetch.
 */
async function recheck(entry: CachedImage): Promise<void> {
  entry.busy = true;
  try {
    const res = await displayFetch(entry.src);
    entry.checkedAt = Date.now();
    if (res.status === 404 || res.status === 410) {
      const gone = entry.url;
      entry.url = undefined;
      entry.blob = undefined;
      entry.failed = true;
      notify(entry);
      if (gone) setTimeout(() => URL.revokeObjectURL(gone), REVOKE_DELAY_MS);
      return;
    }
    const etag = res.ok ? res.headers.get('etag') : null;
    // A hub hiccup keeps the picture; a matching tag confirms it unchanged.
    if (!res.ok || (etag && etag === entry.etag)) {
      void res.body?.cancel().catch(() => { /* already consumed */ });
      return;
    }
    const blob = await res.blob();
    if (!etag && entry.blob && await sameBytes(blob, entry.blob)) return;
    const replaced = entry.url;
    entry.url = URL.createObjectURL(blob);
    entry.blob = blob;
    entry.etag = etag;
    entry.bytes = blob.size;
    notify(entry);
    if (replaced) setTimeout(() => URL.revokeObjectURL(replaced), REVOKE_DELAY_MS);
  } catch {
    // Offline for a moment: the kept picture is still the best there is.
  } finally {
    entry.busy = false;
    settleUnused(entry);
  }
}

function acquire(src: string, rerender: () => void): CachedImage {
  let entry = cache.get(src);
  if (!entry) {
    entry = {
      src, url: undefined, blob: undefined, etag: null, bytes: 0, failed: false,
      users: new Set(), checkedAt: 0, lastUsed: Date.now(), busy: false,
    };
    cache.set(src, entry);
  }
  const returning = entry.users.size === 0;
  entry.users.add(rerender);
  if (entry.busy) return entry;
  if (!entry.url && !entry.failed) void load(entry);
  else if (returning && entry.url && Date.now() - entry.checkedAt > RECHECK_AFTER_MS) void recheck(entry);
  return entry;
}

function release(entry: CachedImage, rerender: () => void): void {
  entry.users.delete(rerender);
  if (entry.users.size > 0) return;
  entry.lastUsed = Date.now();
  // A failure is not kept: the next mount tries again. One whose fetch is
  // still out is tidied when it settles (settleUnused).
  if (entry.failed && !entry.busy) forget(entry);
  scheduleEviction();
}

let evictionTimer: ReturnType<typeof setTimeout> | null = null;
let evictionDue = 0;

/**
 * Evict after the current commit's effects (the default), or once a grace
 * period ends: a rotation releases the outgoing screen's pictures before the
 * incoming screen's effects claim theirs, and a picture must not be revoked
 * between being rendered and being claimed. An earlier pass replaces a later
 * one; one timer at most.
 */
function scheduleEviction(delayMs = 0): void {
  const due = Date.now() + delayMs;
  if (evictionTimer !== null) {
    if (evictionDue <= due) return;
    clearTimeout(evictionTimer);
  }
  evictionDue = due;
  evictionTimer = setTimeout(() => {
    evictionTimer = null;
    evictIdle();
  }, delayMs);
}

function evictIdle(): void {
  const now = Date.now();
  const idle = [...cache.values()]
    .filter((entry) => entry.users.size === 0 && entry.url && !entry.busy)
    .sort((a, b) => a.lastUsed - b.lastUsed);
  let count = idle.length;
  let bytes = idle.reduce((sum, entry) => sum + entry.bytes, 0);
  const overBudget = () => count > MAX_IDLE_PICTURES || bytes > MAX_IDLE_BYTES;
  let nextGraceEnds: number | null = null;
  for (const entry of idle) {
    if (!overBudget()) break;
    const graceLeft = entry.lastUsed + RECENTLY_USED_MS - now;
    if (graceLeft > 0) {
      nextGraceEnds = Math.min(nextGraceEnds ?? graceLeft, graceLeft);
      continue;
    }
    URL.revokeObjectURL(entry.url!);
    forget(entry);
    count--;
    bytes -= entry.bytes;
  }
  // Still over only because of pictures in their grace period: come back
  // when the first of them ends, or nothing else on the page may ever ask.
  if (overBudget() && nextGraceEnds !== null) scheduleEviction(nextGraceEnds + 1);
}

/**
 * Load a picture into the cache ahead of time and have the browser decode
 * it, so the screen about to rotate in paints it with the screen instead of
 * after it. A picture already kept is left alone.
 */
export function preloadAuthImage(src: string | undefined): void {
  if (!src || !isHubImage(src) || cache.has(src)) return;
  // Called once, when the load settles either way.
  const warm = () => {
    if (entry.url) {
      const img = new Image();
      img.src = entry.url;
      img.decode().catch(() => { /* shown or retried when the screen mounts */ });
    }
    release(entry, warm);
  };
  const entry = acquire(src, warm);
}

/** Revoke and forget every kept picture. */
export function __resetAuthImageCacheForTests(): void {
  for (const entry of cache.values()) if (entry.url) URL.revokeObjectURL(entry.url);
  cache.clear();
  if (evictionTimer !== null) clearTimeout(evictionTimer);
  evictionTimer = null;
}

// ── Hooks ────────────────────────────────────────────────────────────

/**
 * Fetches an image URL through displayFetch (which injects the display Bearer
 * token) and returns a blob URL that <img> tags can render without auth, plus
 * where the fetch for the current src stands. Crossfade layers need the
 * status: a slide whose download failed must be skipped rather than waited on.
 *
 * The blob URL comes from the shared cache above, so a picture shown before
 * is ready on the first render of the next mount.
 *
 * For non-API paths (e.g. /backgrounds/foo.jpg from public/) the original URL
 * is returned directly since those don't require authentication.
 */
export function useAuthImageState(src: string | undefined, options?: AuthImageOptions): AuthImageState {
  const holdPrevious = options?.holdPrevious ?? true;
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // The last URL this hook rendered as ready: what `holdPrevious` keeps up.
  const shownRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!src || !isHubImage(src)) return;
    const entry = acquire(src, rerender);
    return () => release(entry, rerender);
  }, [src]);

  if (!src || !isHubImage(src)) {
    shownRef.current = undefined;
    return src ? { url: src, status: 'ready' } : { url: undefined, status: 'idle' };
  }
  const entry = cache.get(src);
  if (entry?.url) {
    entry.lastUsed = Date.now();
    shownRef.current = entry.url;
    return { url: entry.url, status: 'ready' };
  }
  if (entry?.failed) {
    shownRef.current = undefined;
    return { url: undefined, status: 'failed' };
  }
  return { url: holdPrevious ? shownRef.current : undefined, status: 'loading' };
}

/**
 * `useAuthImageState` for callers that only need the URL: the blob URL for an
 * API-served image, the path itself for a static one, or nothing while a
 * changed src loads (see `holdPrevious`).
 */
export function useAuthImage(src: string | undefined, options?: AuthImageOptions): string | undefined {
  return useAuthImageState(src, options).url;
}
