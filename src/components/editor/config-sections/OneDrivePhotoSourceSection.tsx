'use client';

import { useCallback, useEffect, useState } from 'react';
import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import LabeledField from '@/components/ui/LabeledField';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorData } from '@/hooks/useEditorData';
import { useDeviceCodeSignIn, type DeviceCodePoll } from '@/hooks/useDeviceCodeSignIn';
import { Folder, FolderUp } from 'lucide-react';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { formatNumber } from '@/i18n/formatters';
import { ONEDRIVE_MAX_SAMPLE } from '@/lib/onedrive-shared';

/** How many photos the preview strip shows. */
const PREVIEW_COUNT = 4;

interface Props {
  config: Record<string, unknown>;
  set: (updates: Record<string, unknown>) => void;
}

interface OneDriveStatus {
  credentialsConfigured: boolean;
  connected: boolean;
  account?: string | null;
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
 * verification link on any device, and the shared poll loop picks up the
 * result. The folder browser walks the drive's folder tree and stores the
 * Graph item ID (stable across renames) plus a display label. Preview strip
 * and status dot mirror the Immich section so the two sources feel alike.
 */
export function OneDrivePhotoSourceSection({ config, set }: Props) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  const [status, setStatus] = useState<OneDriveStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // The server's `error` sentences are English, for curl. Everything shown
  // here comes from the dictionary, keyed off `code` and `state`.
  const signIn = useDeviceCodeSignIn({
    start: async () => {
      const res = await editorFetch('/api/onedrive/auth', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(t(data?.code === 'credentials_missing'
          ? 'configSections.onedriveSource.credentialsNeeded'
          : 'configSections.onedriveSource.signInFailed'));
      }
      return {
        userCode: data.userCode,
        verificationUrl: data.verificationUri,
        intervalMs: data.intervalMs,
        expiresInMs: data.expiresInSeconds * 1000,
      };
    },
    poll: async (): Promise<DeviceCodePoll> => {
      const res = await editorFetch('/api/onedrive/auth');
      // The hub answers every poll with 200 and a state; anything else is
      // the hub itself having trouble, which the loop treats as a miss.
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      switch (data.state) {
        case 'pending': return { status: 'pending', slowDown: data.slowDown === true };
        case 'connected': return { status: 'connected' };
        case 'declined': return { status: 'ended', message: t('configSections.onedriveSource.signInDeclined') };
        case 'failed': return { status: 'ended', message: t('configSections.onedriveSource.signInFailed') };
        // 'idle' means no pending flow is left (hub restarted, another tab
        // replaced it, or a disconnect raced us): the shown code is dead.
        default: return { status: 'ended', message: t('configSections.onedriveSource.signInExpired') };
      }
    },
    onConnected: refreshStatus,
    words: {
      codeExpired: t('configSections.onedriveSource.signInExpired'),
      hubUnreachable: t('deviceSignIn.hubUnreachable'),
    },
  });

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
    : `/api/onedrive/photos?folderId=${encodeURIComponent(folderId)}&count=${count}`;
  // The preview walks the folder page by page before it answers.
  const { data: previewData } = useEditorData<MediaItem[]>(previewUrl, null);
  const previewThumbs = (previewData ?? [])
    .filter((item) => item.type === 'image')
    .slice(0, PREVIEW_COUNT)
    .map((item) => item.url.replace('size=preview', 'size=thumbnail'));

  const disconnect = async () => {
    setError(null);
    // The folder is forgotten only once the hub confirms the sign-in is gone;
    // otherwise a failed request would clear it from the config while the
    // sign-in stays on disk and the slideshow lost its pictures.
    try {
      const res = await editorFetch('/api/onedrive/auth', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setError(t('configSections.onedriveSource.disconnectFailed'));
      return;
    }
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
    if (signIn.code) {
      return (
        <div className="space-y-1.5 p-2 rounded bg-hs-card border border-hs-border-strong">
          <p className="text-[11px] text-hs-text-muted">{t('configSections.onedriveSource.waiting')}</p>
          <p className="text-lg font-semibold text-hs-text-primary tracking-widest">{signIn.code.userCode}</p>
          <p className="text-[11px] text-hs-text-muted">
            {t('configSections.onedriveSource.enterCode')}{' '}
            <a href={signIn.code.verificationUrl} target="_blank" rel="noreferrer" className="text-hs-accent hover:text-hs-accent-hover">
              {signIn.code.verificationUrl.replace(/^https?:\/\//, '')}
            </a>
          </p>
          <button onClick={signIn.cancel} className="text-[10px] text-hs-text-faint hover:text-hs-text-muted">
            {t('configSections.onedriveSource.cancel')}
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        <Button size="sm" variant="primary" onClick={signIn.start} disabled={signIn.busy}>
          {t('configSections.onedriveSource.signIn')}
        </Button>
        {signIn.error && <p className="text-[11px] text-hs-warning leading-relaxed">{signIn.error}</p>}
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

          {current.id !== null && (
            <button
              onClick={() => setTrail(trail.slice(0, -1))}
              className="flex items-center gap-1 text-left text-xs px-2 py-1 bg-hs-card border border-hs-border-strong rounded hover:border-hs-accent"
            >
              <FolderUp className="w-3 h-3 flex-shrink-0 text-hs-text-faint" />
              <span>{t('configSections.onedriveSource.upOneFolder')}</span>
            </button>
          )}
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
                  {t('configSections.onedriveSource.capNote', {
                    cap: formatNumber(ONEDRIVE_MAX_SAMPLE, { locale: formattingLocale }),
                  })}
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
