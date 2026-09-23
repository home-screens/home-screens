'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { displayFetch } from '@/lib/display-fetch';
import { editorFetch } from '@/lib/editor-fetch';
import {
  CUSTOM_ICON_ERROR_CODES,
  MAX_UPLOAD_BYTES,
  type CustomIconEntry,
  type CustomIconErrorCode,
  type CustomIconUsage,
} from '@/lib/custom-icons';

/**
 * The household's icon library, fetched once per tab and shared by every
 * picker and view that draws an icon. The wall, the editor and the phone all
 * read it through `displayFetch`, which sends the display's bearer token
 * where there is one and the session cookie everywhere else.
 *
 * It refreshes every 30 minutes while anything is subscribed, which keeps the
 * pictures' media token fresh (it lasts three to six hours) and brings in
 * icons added from another device.
 */

interface CatalogState {
  icons: CustomIconEntry[];
  byId: ReadonlyMap<string, CustomIconEntry>;
  bytes: number;
  /** True once a fetch has answered (or failed), so a missing id can fall
   *  back instead of waiting. */
  loaded: boolean;
}

const REFRESH_MS = 30 * 60 * 1000;

let state: CatalogState = { icons: [], byId: new Map(), bytes: 0, loaded: false };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
/** When the catalog last answered (or was seeded). The timer only runs
 *  while something is subscribed, so a wall rotating between screens with
 *  and without icons would never refresh on the timer alone; a subscriber
 *  arriving to a catalog older than the interval refreshes it instead. */
let fetchedAt = 0;

function publish(next: Partial<CatalogState>) {
  const icons = next.icons ?? state.icons;
  state = {
    ...state,
    ...next,
    icons,
    byId: next.icons ? new Map(icons.map((icon) => [icon.id, icon])) : state.byId,
  };
  for (const listener of listeners) listener();
}

/** Re-read the library now. Concurrent callers share one request. */
export function refreshCustomIcons(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await displayFetch('/api/custom-icons');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { icons?: CustomIconEntry[]; bytes?: number };
      fetchedAt = Date.now();
      publish({ icons: Array.isArray(body.icons) ? body.icons : [], bytes: body.bytes ?? 0, loaded: true });
    } catch {
      // Keep what we had; a view with nothing falls back to its usual picture.
      // A first load that failed (the hub restarting, say) tries again soon
      // rather than waiting out the whole refresh interval.
      if (!state.loaded) {
        publish({ loaded: true });
        setTimeout(() => { if (listeners.size && !state.icons.length) void refreshCustomIcons(); }, 60_000);
      }
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Hand the catalog to the store without a request, for pages the server
 * renders with it already read (the public kid view has no credentials to
 * fetch it with).
 */
export function seedCustomIcons(icons: CustomIconEntry[]): void {
  if (state.loaded) return;
  fetchedAt = Date.now();
  publish({ icons, bytes: icons.reduce((sum, icon) => sum + icon.bytes, 0), loaded: true });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    if (!state.loaded || Date.now() - fetchedAt >= REFRESH_MS) void refreshCustomIcons();
    timer = setInterval(() => { void refreshCustomIcons(); }, REFRESH_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => state;
const SERVER_STATE: CatalogState = { icons: [], byId: new Map(), bytes: 0, loaded: false };
const getServerSnapshot = () => SERVER_STATE;

export function useCustomIcons(): CatalogState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Server-seeded catalog for a page that cannot fetch it itself. */
export function useSeedCustomIcons(icons: CustomIconEntry[] | undefined): void {
  // Seeding during render would publish to other components mid-render.
  useEffect(() => { if (icons) seedCustomIcons(icons); }, [icons]);
}

// ── Changes (session only) ──────────────────────────────────────────

export class CustomIconRequestError extends Error {
  constructor(readonly code: CustomIconErrorCode | 'failed', message: string) {
    super(message);
    this.name = 'CustomIconRequestError';
  }
}

async function failure(res: Response): Promise<CustomIconRequestError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  const code = CUSTOM_ICON_ERROR_CODES.includes(body.code as CustomIconErrorCode)
    ? (body.code as CustomIconErrorCode)
    : res.status === 413 ? 'too-big' : 'failed';
  return new CustomIconRequestError(code, body.error ?? `HTTP ${res.status}`);
}

/**
 * Upload a picture. A new one comes back pending: it is in no list until
 * `keepCustomIcon`, so a review abandoned in any way leaves nothing behind.
 * `existing` means the library already held this exact picture, as that
 * icon, and nothing was added.
 */
export async function uploadCustomIcon(file: File, name?: string): Promise<{ icon: CustomIconEntry; existing: boolean }> {
  // Said at once rather than after sending megabytes the server will refuse.
  if (file.size > MAX_UPLOAD_BYTES) throw new CustomIconRequestError('too-big', 'too big');
  const form = new FormData();
  form.append('file', file);
  if (name) form.append('name', name);
  const res = await editorFetch('/api/custom-icons', { method: 'POST', body: form });
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { icon: CustomIconEntry; existing?: boolean };
  const existing = body.existing === true;
  // A kept icon this tab may not know yet (another device added the same
  // picture since the catalog was fetched): add it, or picking it would draw
  // the fallback until the next refresh.
  if (existing) upsert(body.icon);
  return { icon: body.icon, existing };
}

function upsert(icon: CustomIconEntry) {
  const known = state.byId.has(icon.id);
  publish({
    icons: known ? state.icons.map((i) => (i.id === icon.id ? icon : i)) : [...state.icons, icon],
    bytes: known || state.icons.some((i) => i.hash === icon.hash) ? state.bytes : state.bytes + icon.bytes,
    loaded: true,
  });
}

/** Keep a pending upload (under `name`), which puts it in every list. */
export async function keepCustomIcon(id: string, name: string): Promise<CustomIconEntry> {
  const res = await editorFetch(`/api/custom-icons/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, keep: true }),
  });
  if (!res.ok) throw await failure(res);
  const { icon } = (await res.json()) as { icon: CustomIconEntry };
  upsert(icon);
  return icon;
}

/** Cut a pending still upload to its centre square; it stays pending. */
export async function cropCustomIcon(id: string): Promise<CustomIconEntry> {
  const res = await editorFetch(`/api/custom-icons/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ crop: 'square' }),
  });
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { icon: CustomIconEntry }).icon;
}

export async function renameCustomIcon(id: string, name: string): Promise<CustomIconEntry> {
  const res = await editorFetch(`/api/custom-icons/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw await failure(res);
  const { icon } = (await res.json()) as { icon: CustomIconEntry };
  upsert(icon);
  return icon;
}

/** Remove an icon. `configRevision` is set when the removal rewrote the
 *  screen config, which an editor holding its own copy has to adopt. */
export async function deleteCustomIcon(id: string): Promise<{ configRevision?: string }> {
  const res = await editorFetch(`/api/custom-icons/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw await failure(res);
  const body = res.ok ? ((await res.json().catch(() => ({}))) as { configRevision?: string }) : {};
  const gone = state.byId.get(id);
  const icons = state.icons.filter((i) => i.id !== id);
  const shared = gone && icons.some((i) => i.hash === gone.hash);
  publish({ icons, bytes: Math.max(0, state.bytes - (gone && !shared ? gone.bytes : 0)) });
  return { configRevision: body.configRevision };
}

/** Where each icon is used, for the manage pages. */
export async function fetchCustomIconUsage(): Promise<Record<string, CustomIconUsage>> {
  const res = await editorFetch('/api/custom-icons?usage=1');
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { icons?: CustomIconEntry[]; bytes?: number; usage?: Record<string, CustomIconUsage> };
  if (Array.isArray(body.icons)) {
    fetchedAt = Date.now();
    publish({ icons: body.icons, bytes: body.bytes ?? 0, loaded: true });
  }
  return body.usage ?? {};
}
