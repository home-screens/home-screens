'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import type { AutoBackupStatus, BackupContentsSummary, OffsiteErrorCode } from '@/lib/auto-backup-types';
import type { StorageKind } from '@/lib/storage-destination';

/** A run that could not start, and why. */
export type BackUpNowRefusal = 'busy' | 'updating' | 'failed';

/** The storage folder form: one address box whose meaning follows the kind. */
export interface FolderDraft {
  kind: StorageKind;
  /** A WebDAV folder's web address, or a share address such as `\\nas.local\Backups`. */
  address: string;
  /** For a share, `DOMAIN\name` is taken too. */
  username: string;
  /** Empty keeps the saved password when the folder is the same kind on the same server. */
  password: string;
}

/**
 * What "Check it works" or a save answered: fine, a storage problem, or a
 * form problem with the hub's code. A share name the storage does not have
 * comes with the shares it does have, when it would say.
 */
export type FolderCheck =
  | { ok: true }
  | { ok: false; code: OffsiteErrorCode; shares?: string[] }
  | { ok: false; formCode: string };

/** The hub's body for a draft: WebDAV takes `url`, a share takes `address`. */
function draftBody(draft: FolderDraft): Record<string, string> {
  const { kind, address, username, password } = draft;
  return kind === 'smb' ? { kind, address, username, password } : { kind, url: address, username, password };
}

async function readError(res: Response): Promise<{ code: string | null; error: string | null }> {
  const data = await res.json().catch(() => ({}));
  return {
    code: typeof data?.code === 'string' ? data.code : null,
    error: typeof data?.error === 'string' ? data.error : null,
  };
}

/**
 * Automatic backups for the Settings block: the status from the hub, and
 * every action that goes straight to the hub rather than through the
 * editor's config (passwords, the storage folder, the link, the copies).
 */
export function useAutoBackup() {
  const [status, setStatus] = useState<AutoBackupStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [running, setRunning] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await editorFetch('/api/backup/auto');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = (await res.json()) as AutoBackupStatus;
      if (!mounted.current) return;
      setStatus(next);
      setLoadFailed(false);
    } catch (err) {
      if (isSessionExpired(err)) return;
      if (mounted.current) setLoadFailed(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // A scheduled run can be in flight when the page opens; look again until it is done.
  useEffect(() => {
    if (!status?.running || running) return;
    const timer = setTimeout(() => { void refresh(); }, 3000);
    return () => clearTimeout(timer);
  }, [status, running, refresh]);

  const backUpNow = useCallback(async (): Promise<BackUpNowRefusal | null> => {
    setRunning(true);
    try {
      // A backup with pictures can take minutes on a Pi.
      const res = await editorFetch('/api/backup/auto', { method: 'POST', timeoutMs: null });
      if (res.status === 409) {
        const { code } = await readError(res);
        return code === 'updating' ? 'updating' : 'busy';
      }
      if (!res.ok) return 'failed';
      const next = (await res.json()) as AutoBackupStatus;
      if (mounted.current) setStatus(next);
      return null;
    } catch (err) {
      if (isSessionExpired(err)) return null;
      return 'failed';
    } finally {
      if (mounted.current) setRunning(false);
    }
  }, []);

  /** Save or clear secrets. Answers the hub's refusal code, or null when saved. */
  const saveSecrets = useCallback(async (body: { backupPassword?: string | null; destination?: FolderDraft | null }): Promise<string | null> => {
    try {
      const { destination, ...rest } = body;
      const res = await editorFetch('/api/backup/auto/secrets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(destination === undefined ? rest : { ...rest, destination: destination && draftBody(destination) }),
      });
      if (!res.ok) return (await readError(res)).code ?? 'failed';
      await refresh();
      return null;
    } catch (err) {
      if (isSessionExpired(err)) return null;
      return 'failed';
    }
  }, [refresh]);

  /** "Check it works", with the form's values or (no draft) the saved folder. */
  const checkFolder = useCallback(async (draft?: FolderDraft): Promise<FolderCheck> => {
    try {
      const res = await editorFetch('/api/backup/auto/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft ? draftBody(draft) : {}),
        // A share that is not there is followed by asking the storage for its list.
        timeoutMs: 150_000,
      });
      if (!res.ok) return { ok: false, formCode: (await readError(res)).code ?? 'failed' };
      const data = await res.json();
      if (data.ok) return { ok: true };
      const shares = Array.isArray(data.shares) ? data.shares.filter((name: unknown): name is string => typeof name === 'string') : undefined;
      return { ok: false, code: data.code as OffsiteErrorCode, ...(shares ? { shares } : {}) };
    } catch {
      return { ok: false, code: 'unreachable' };
    }
  }, []);

  const linkToken = useCallback(async (): Promise<string | null> => {
    const res = await editorFetch('/api/backup/auto/link');
    if (!res.ok) return null;
    return ((await res.json()) as { token: string }).token;
  }, []);

  const makeLink = useCallback(async (): Promise<string | null> => {
    const res = await editorFetch('/api/backup/auto/link', { method: 'POST' });
    if (!res.ok) return null;
    const { token } = (await res.json()) as { token: string };
    await refresh();
    return token;
  }, [refresh]);

  const removeLink = useCallback(async (): Promise<boolean> => {
    const res = await editorFetch('/api/backup/auto/link', { method: 'DELETE' });
    await refresh();
    return res.ok;
  }, [refresh]);

  const removeCopy = useCallback(async (name: string): Promise<boolean> => {
    const res = await editorFetch(`/api/backup/auto/files/${encodeURIComponent(name)}`, { method: 'DELETE' });
    await refresh();
    return res.ok;
  }, [refresh]);

  const copySummary = useCallback(async (name: string): Promise<BackupContentsSummary | null> => {
    const res = await editorFetch(`/api/backup/auto/files/${encodeURIComponent(name)}?summary=1`, { timeoutMs: 60_000 });
    if (!res.ok) return null;
    return (await res.json()) as BackupContentsSummary;
  }, []);

  return {
    status,
    loadFailed,
    running: running || !!status?.running,
    refresh,
    backUpNow,
    saveSecrets,
    checkFolder,
    linkToken,
    makeLink,
    removeLink,
    removeCopy,
    copySummary,
  };
}
