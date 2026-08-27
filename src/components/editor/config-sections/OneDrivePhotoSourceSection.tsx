'use client';

import { useCallback, useEffect, useState } from 'react';
import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import LabeledField from '@/components/ui/LabeledField';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorData } from '@/hooks/useEditorData';
import { Folder } from 'lucide-react';
import { useTranslate } from '@/i18n';

/** Mirrors ONEDRIVE_MAX_SAMPLE in src/lib/onedrive.ts (kept local — that module is server-only). */
const LARGE_FOLDER_SAMPLE = 1000;

interface Props {
  config: Record<string, unknown>;
  set: (updates: Record<string, unknown>) => void;
}

interface OneDriveStatus {
  credentialsConfigured: boolean;
  connected: boolean;
  account?: string | null;
}

interface DeviceFlowStart {
  userCode: string;
  verificationUri: string;
  intervalMs: number;
  expiresInSeconds: number;
}

interface FoldersResponse {
  folder: { id: string; name: string; path: string; childCount: number | null };
  subfolders: Array<{ id: string; name: string }>;
}

interface MediaItem {
  url: string;
  type: 'image' | 'video';
}

/** One breadcrumb stop; a null id is the drive root. */
interface TrailEntry {
  id: string | null;
  name: string;
}

/**
 * OneDrive photo source for the two slideshow modules. Sign-in is the
 * device-code flow: the panel shows the code, the user finishes at the
 * verification link on any device, and the poll below picks up the result.
 * The folder browser walks the drive's folder tree and stores the Graph
 * item ID (stable across renames) plus a display label. Preview strip and
 * status dot mirror the Immich section so the two sources feel alike.
 */
export function OneDrivePhotoSourceSection({ config, set }: Props) {
  const t = useTranslate('editor');
  const [status, setStatus] = useState<OneDriveStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flow, setFlow] = useState<DeviceFlowStart | null>(null);

  const [browsing, setBrowsing] = useState(false);
  const [trail, setTrail] = useState<TrailEntry[]>([{ id: null, name: 'OneDrive' }]);
  const [foldersData, setFoldersData] = useState<FoldersResponse | null>(null);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersFailed, setFoldersFailed] = useState<null | 'load' | 'notfound'>(null);
  const [reloadBump, setReloadBump] = useState(0);

  const folderId = (config.onedriveFolderId as string) || '';
  const folderName = (config.onedriveFolderName as string) || '';
  const count = (config.onedriveCount as number) || 50;

  const refreshStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await editorFetch('/api/onedrive/status');
      setStatus(res.ok ? await res.json() : { credentialsConfigured: false, connected: false });
    } catch {
      setStatus({ credentialsConfigured: false, connected: false });
    }
    setChecking(false);
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  // Poll the pending device flow. State-driven so teardown runs on
  // cancel/unmount, mirroring the Google Photos picker section's loop.
  useEffect(() => {
    if (!flow) return;
    let cancelled = false;
    let inFlight = false;
    let settled = false;
    let failures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;

    const finish = (timer: ReturnType<typeof setInterval>, message?: string) => {
      settled = true;
      clearInterval(timer);
      setFlow(null);
      if (message) setError(message);
      refreshStatus();
    };

    const timer = setInterval(async () => {
      if (inFlight || settled) return;
      inFlight = true;
      try {
        const res = await editorFetch('/api/onedrive/auth');
        if (cancelled || settled) return;
        if (!res.ok) {
          if (++failures >= MAX_CONSECUTIVE_FAILURES) finish(timer, t('configSections.onedriveSource.signInFailed'));
          return;
        }
        failures = 0;
        const data = await res.json();
        // A slow_down bumps the server's requested interval; re-arming the
        // flow state restarts this effect at the new spacing.
        if (data.state === 'pending' && typeof data.intervalMs === 'number' && data.intervalMs > flow.intervalMs) {
          setFlow({ ...flow, intervalMs: data.intervalMs });
          return;
        }
        if (data.state === 'connected') finish(timer);
        else if (data.state === 'expired') finish(timer, t('configSections.onedriveSource.signInExpired'));
        else if (data.state === 'declined') finish(timer, t('configSections.onedriveSource.signInDeclined'));
        else if (data.state === 'failed') finish(timer, t('configSections.onedriveSource.signInFailed'));
        // 'idle' means no pending flow is left (hub restarted, another tab
        // replaced it, or a disconnect raced us) — the shown code is dead.
        else if (data.state === 'idle') finish(timer, t('configSections.onedriveSource.signInExpired'));
        // 'pending' keeps waiting.
      } catch {
        if (!cancelled && !settled && ++failures >= MAX_CONSECUTIVE_FAILURES) {
          finish(timer, t('configSections.onedriveSource.signInFailed'));
        }
      } finally {
        inFlight = false;
      }
    }, Math.max(flow.intervalMs || 5000, 2000));
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [flow, refreshStatus, t]);

  // Folder browser data — refetches as the trail descends (manual fetch so
  // a 404 folder can be told apart from still-loading).
  const current = trail[trail.length - 1];
  useEffect(() => {
    if (!browsing || !status?.connected) return;
    let cancelled = false;
    setFoldersLoading(true);
    setFoldersFailed(null);
    const url = `/api/onedrive/folders${current.id ? `?itemId=${encodeURIComponent(current.id)}` : ''}`;
    editorFetch(url)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) setFoldersData(await res.json());
        else setFoldersFailed(res.status === 404 ? 'notfound' : 'load');
      })
      .catch(() => { if (!cancelled) setFoldersFailed('load'); })
      .finally(() => { if (!cancelled) setFoldersLoading(false); });
    return () => { cancelled = true; };
  }, [browsing, status?.connected, current.id, reloadBump]);

  // Preview strip — a 4-photo sample, swapped to thumbnail-sized serves.
  const previewUrl = browsing || !folderId || !status?.connected
    ? null
    : `/api/onedrive/photos?folderId=${encodeURIComponent(folderId)}&count=4`;
  const { data: previewData } = useEditorData<MediaItem[]>(previewUrl);
  const previewThumbs = (previewData ?? [])
    .filter((item) => item.type === 'image')
    .map((item) => item.url.replace('size=preview', 'size=thumbnail'));

  const signIn = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await editorFetch('/api/onedrive/auth', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFlow(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('configSections.onedriveSource.signInFailed'));
    }
    setBusy(false);
  };

  const disconnect = async () => {
    await editorFetch('/api/onedrive/auth', { method: 'DELETE' });
    set({ onedriveFolderId: undefined, onedriveFolderName: undefined });
    await refreshStatus();
  };

  if (checking && !status) {
    return <p className="text-[11px] text-hs-text-muted">{t('configSections.onedriveSource.checking')}</p>;
  }

  if (!status?.credentialsConfigured) {
    return (
      <p className="text-[11px] text-hs-text-muted leading-relaxed">
        {t('configSections.onedriveSource.credentialsNeeded')}
      </p>
    );
  }

  if (!status?.connected) {
    if (flow) {
      return (
        <div className="space-y-1.5 p-2 rounded bg-hs-card border border-hs-border-strong">
          <p className="text-[11px] text-hs-text-muted">{t('configSections.onedriveSource.waiting')}</p>
          <p className="text-lg font-semibold text-hs-text-primary tracking-widest">{flow.userCode}</p>
          <p className="text-[11px] text-hs-text-muted">
            {t('configSections.onedriveSource.enterCode')}{' '}
            <a href={flow.verificationUri} target="_blank" rel="noreferrer" className="text-hs-accent hover:text-hs-accent-hover">
              {flow.verificationUri.replace(/^https?:\/\//, '')}
            </a>
          </p>
          <button onClick={() => setFlow(null)} className="text-[10px] text-hs-text-faint hover:text-hs-text-muted">
            {t('configSections.onedriveSource.cancel')}
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        <Button size="sm" variant="primary" onClick={signIn} disabled={busy}>
          {t('configSections.onedriveSource.signIn')}
        </Button>
        {error && <p className="text-[11px] text-hs-warning leading-relaxed">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-hs-success" />
        <span className="text-xs text-hs-text-muted truncate">
          {status.account
            ? t('configSections.onedriveSource.connectedAs', { account: status.account })
            : t('configSections.onedriveSource.signedIn')}
        </span>
        <button onClick={disconnect} className="ml-auto text-[10px] text-hs-text-faint hover:text-hs-text-muted">
          {t('configSections.onedriveSource.disconnect')}
        </button>
      </div>

      {browsing ? (
        <div className="space-y-1.5 p-2 rounded bg-hs-card border border-hs-border-strong">
          <div className="flex flex-wrap gap-1 items-center text-[11px]">
            {trail.map((entry, i) => (
              <span key={`${entry.id ?? 'root'}-${i}`} className="flex items-center gap-1">
                {i > 0 && <span className="text-hs-text-faint">/</span>}
                <button
                  onClick={() => setTrail(trail.slice(0, i + 1))}
                  disabled={i === trail.length - 1}
                  className={i === trail.length - 1 ? 'text-hs-text-secondary' : 'text-hs-accent hover:text-hs-accent-hover'}
                >
                  {entry.name}
                </button>
              </span>
            ))}
          </div>

          {foldersLoading && <p className="text-[11px] text-hs-text-muted">{t('configSections.onedriveSource.loadingFolders')}</p>}
          {foldersFailed === 'notfound' && (
            <p className="text-[11px] text-hs-warning">{t('configSections.onedriveSource.folderNotFound')}</p>
          )}
          {foldersFailed === 'load' && (
            <p className="text-[11px] text-hs-warning">
              {t('configSections.onedriveSource.loadFailed')}{' '}
              <button onClick={() => setReloadBump((n) => n + 1)} className="text-hs-accent hover:text-hs-accent-hover">
                {t('configSections.onedriveSource.retry')}
              </button>
            </p>
          )}
          {!foldersLoading && !foldersFailed && foldersData && (
            <>
              {foldersData.subfolders.length === 0 ? (
                <p className="text-[11px] text-hs-text-faint">{t('configSections.onedriveSource.emptyFolder')}</p>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {foldersData.subfolders.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => setTrail([...trail, { id: sub.id, name: sub.name }])}
                      className="flex items-center gap-1 text-left text-xs px-2 py-1 bg-hs-card border border-hs-border-strong rounded hover:border-hs-accent"
                    >
                      <Folder className="w-3 h-3 flex-shrink-0 text-hs-text-faint" />
                      <span className="truncate">{sub.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {foldersData.folder.childCount !== null && foldersData.folder.childCount > LARGE_FOLDER_SAMPLE && (
                <p className="text-[10px] text-hs-text-faint leading-relaxed">
                  {t('configSections.onedriveSource.capNote')}
                </p>
              )}
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  set({ onedriveFolderId: foldersData.folder.id, onedriveFolderName: foldersData.folder.name });
                  setBrowsing(false);
                }}
              >
                {t('configSections.onedriveSource.useThisFolder')}
              </Button>
            </>
          )}
          <button onClick={() => setBrowsing(false)} className="text-[10px] text-hs-text-faint hover:text-hs-text-muted">
            {t('configSections.onedriveSource.cancel')}
          </button>
        </div>
      ) : (
        <>
          <LabeledField label={t('configSections.onedriveSource.folder')}>
            <div className="flex gap-1.5">
              <div className="flex-1 px-2 py-1 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-secondary truncate">
                {folderName || t('configSections.onedriveSource.noFolderChosen')}
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setTrail([{ id: null, name: 'OneDrive' }]);
                  setBrowsing(true);
                }}
              >
                {folderId
                  ? t('configSections.onedriveSource.changeFolder')
                  : t('configSections.onedriveSource.chooseFolder')}
              </Button>
            </div>
          </LabeledField>

          <Slider
            label={t('configSections.onedriveSource.photosPerRefresh')}
            value={count}
            min={10}
            max={200}
            step={10}
            onChange={(v) => set({ onedriveCount: v })}
          />

          {previewData !== null && (previewThumbs.length > 0 ? (
            <div className="flex gap-1 mt-1 overflow-x-auto">
              {previewThumbs.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  loading="lazy"
                  className="w-12 h-12 rounded object-cover flex-shrink-0 border border-hs-border-strong"
                />
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-hs-text-faint">{t('configSections.onedriveSource.noPhotos')}</p>
          ))}
        </>
      )}
      {error && <p className="text-[11px] text-hs-warning leading-relaxed">{error}</p>}
    </div>
  );
}
