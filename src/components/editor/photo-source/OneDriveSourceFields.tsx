'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import LabeledField from '@/components/ui/LabeledField';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorData } from '@/hooks/useEditorData';
import { Folder, FolderUp } from 'lucide-react';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { formatNumber } from '@/i18n/formatters';
import { ONEDRIVE_MAX_SAMPLE } from '@/lib/onedrive-shared';
import { PHOTO_SOURCE_MEDIA_PATH, photoSourceParams } from '@/lib/photo-source';
import type { PhotoSource } from '@/types/config';

/** How many photos the preview strip shows. */
const PREVIEW_COUNT = 4;

type OneDriveSource = Extract<PhotoSource, { kind: 'onedrive' }>;

interface Props {
  source: OneDriveSource;
  /** Pictures per refresh, so the preview asks for what the wall asks for. */
  count: number;
  onChange: (source: OneDriveSource) => void;
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
 * OneDrive's part of the photo source fields (slideshows and rotating
 * backgrounds). Sign-in is the
 * device-code flow: the panel shows the code, the user finishes at the
 * verification link on any device, and the poll below picks up the result.
 * The folder browser walks the drive's folder tree and stores the Graph
 * item ID (stable across renames) plus a display label. Preview strip and
 * status dot mirror the Immich section so the two sources feel alike.
 */
export function OneDriveSourceFields({ source, count, onChange }: Props) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
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

  const folderId = source.folderId;
  const folderName = source.folderName ?? '';

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
          if (++failures >= MAX_CONSECUTIVE_FAILURES) finish(timer, t('photoSources.onedrive.signInFailed'));
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
        else if (data.state === 'expired') finish(timer, t('photoSources.onedrive.signInExpired'));
        else if (data.state === 'declined') finish(timer, t('photoSources.onedrive.signInDeclined'));
        else if (data.state === 'failed') finish(timer, t('photoSources.onedrive.signInFailed'));
        // 'idle' means no pending flow is left (hub restarted, another tab
        // replaced it, or a disconnect raced us) — the shown code is dead.
        else if (data.state === 'idle') finish(timer, t('photoSources.onedrive.signInExpired'));
        // 'pending' keeps waiting.
      } catch {
        if (!cancelled && !settled && ++failures >= MAX_CONSECUTIVE_FAILURES) {
          finish(timer, t('photoSources.onedrive.signInFailed'));
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

  // Preview strip — a small sample, swapped to thumbnail-sized serves.
  // Ask for the module's own count rather than PREVIEW_COUNT and slice here:
  // listing walks the whole folder tree regardless of count, so a preview-only
  // count would pay for a full Graph crawl on a cache key nothing else hits.
  // Sharing the display's key makes the preview warm the cache instead.
  const previewUrl = browsing || !folderId || !status?.connected
    ? null
    : `${PHOTO_SOURCE_MEDIA_PATH}?${photoSourceParams(source)}&count=${count}`;
  // The preview walks the folder page by page before it answers.
  const { data: previewData } = useEditorData<MediaItem[]>(previewUrl, null);
  const previewThumbs = (previewData ?? [])
    .filter((item) => item.type === 'image')
    .slice(0, PREVIEW_COUNT)
    .map((item) => item.url.replace('size=preview', 'size=thumbnail'));

  const signIn = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await editorFetch('/api/onedrive/auth', { method: 'POST' });
      const data = await res.json();
      // The server's `error` sentence is English, for curl. Everything shown
      // here comes from the dictionary, keyed off `code`.
      if (!res.ok) {
        setError(t(data?.code === 'credentials_missing'
          ? 'photoSources.onedrive.credentialsNeeded'
          : 'photoSources.onedrive.signInFailed'));
        return;
      }
      setFlow(data);
    } catch {
      setError(t('photoSources.onedrive.signInFailed'));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await editorFetch('/api/onedrive/auth', { method: 'DELETE' });
    onChange({ kind: 'onedrive', folderId: '' });
    await refreshStatus();
  };

  if (checking && !status) {
    return <p className="text-[11px] text-hs-text-muted">{t('photoSources.onedrive.checking')}</p>;
  }

  if (!status?.credentialsConfigured) {
    return (
      <p className="text-[11px] text-hs-text-muted leading-relaxed">
        {t('photoSources.onedrive.credentialsNeeded')}
      </p>
    );
  }

  if (!status?.connected) {
    if (flow) {
      return (
        <div className="space-y-1.5 p-2 rounded bg-hs-card border border-hs-border-strong">
          <p className="text-[11px] text-hs-text-muted">{t('photoSources.onedrive.waiting')}</p>
          <p className="text-lg font-semibold text-hs-text-primary tracking-widest">{flow.userCode}</p>
          <p className="text-[11px] text-hs-text-muted">
            {t('photoSources.onedrive.enterCode')}{' '}
            <a href={flow.verificationUri} target="_blank" rel="noreferrer" className="text-hs-accent hover:text-hs-accent-hover">
              {flow.verificationUri.replace(/^https?:\/\//, '')}
            </a>
          </p>
          <button onClick={() => setFlow(null)} className="text-[10px] text-hs-text-faint hover:text-hs-text-muted">
            {t('photoSources.onedrive.cancel')}
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        <Button size="sm" variant="primary" onClick={signIn} disabled={busy}>
          {t('photoSources.onedrive.signIn')}
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
            ? t('photoSources.onedrive.connectedAs', { account: status.account })
            : t('photoSources.onedrive.signedIn')}
        </span>
        <button onClick={disconnect} className="ml-auto text-[10px] text-hs-text-faint hover:text-hs-text-muted">
          {t('photoSources.onedrive.disconnect')}
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

          {current.id !== null && (
            <button
              onClick={() => setTrail(trail.slice(0, -1))}
              className="flex items-center gap-1 text-left text-xs px-2 py-1 bg-hs-card border border-hs-border-strong rounded hover:border-hs-accent"
            >
              <FolderUp className="w-3 h-3 flex-shrink-0 text-hs-text-faint" />
              <span>{t('photoSources.onedrive.upOneFolder')}</span>
            </button>
          )}
          {foldersLoading && <p className="text-[11px] text-hs-text-muted">{t('photoSources.onedrive.loadingFolders')}</p>}
          {foldersFailed === 'notfound' && (
            <p className="text-[11px] text-hs-warning">{t('photoSources.onedrive.folderNotFound')}</p>
          )}
          {foldersFailed === 'load' && (
            <p className="text-[11px] text-hs-warning">
              {t('photoSources.onedrive.loadFailed')}{' '}
              <button onClick={() => setReloadBump((n) => n + 1)} className="text-hs-accent hover:text-hs-accent-hover">
                {t('photoSources.onedrive.retry')}
              </button>
            </p>
          )}
          {!foldersLoading && !foldersFailed && foldersData && (
            <>
              {foldersData.subfolders.length === 0 ? (
                <p className="text-[11px] text-hs-text-faint">{t('photoSources.onedrive.emptyFolder')}</p>
              ) : (
                <div className="flex flex-col gap-1">
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
              {/* childCount covers direct children only — a folder of
                  subfolders can hold a far bigger tree, so flag both. */}
              {(foldersData.subfolders.length > 0
                || (foldersData.folder.childCount ?? 0) > ONEDRIVE_MAX_SAMPLE) && (
                <p className="text-[10px] text-hs-text-faint leading-relaxed">
                  {t('photoSources.onedrive.capNote', {
                    cap: formatNumber(ONEDRIVE_MAX_SAMPLE, { locale: formattingLocale }),
                  })}
                </p>
              )}
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  onChange({ kind: 'onedrive', folderId: foldersData.folder.id, folderName: foldersData.folder.name });
                  setBrowsing(false);
                }}
              >
                {t('photoSources.onedrive.useThisFolder')}
              </Button>
            </>
          )}
          <button onClick={() => setBrowsing(false)} className="text-[10px] text-hs-text-faint hover:text-hs-text-muted">
            {t('photoSources.onedrive.cancel')}
          </button>
        </div>
      ) : (
        <>
          <LabeledField label={t('photoSources.onedrive.folder')}>
            <div className="flex gap-1.5">
              <div className="flex-1 px-2 py-1 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-secondary truncate">
                {folderName || t('photoSources.onedrive.noFolderChosen')}
              </div>
              <Button
                size="sm"
                onClick={() => {
                  // Start browsing at the saved folder, with the drive root
                  // one level up. A missing label falls back to the root
                  // name — both fields are written together when picking.
                  setTrail(folderId
                    ? [{ id: null, name: 'OneDrive' }, { id: folderId, name: folderName || 'OneDrive' }]
                    : [{ id: null, name: 'OneDrive' }]);
                  setBrowsing(true);
                }}
              >
                {folderId
                  ? t('photoSources.onedrive.changeFolder')
                  : t('photoSources.onedrive.chooseFolder')}
              </Button>
            </div>
          </LabeledField>

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
            <p className="text-[10px] text-hs-text-faint">{t('photoSources.onedrive.noPhotos')}</p>
          ))}
        </>
      )}
      {error && <p className="text-[11px] text-hs-warning leading-relaxed">{error}</p>}
    </div>
  );
}
