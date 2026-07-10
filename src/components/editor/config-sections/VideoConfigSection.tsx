'use client';

import { useRef, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { displayCache } from '@/lib/display-cache';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Toggle from '@/components/ui/Toggle';
import Button from '@/components/ui/Button';
import ImageBrowserModal from '@/components/editor/ImageBrowserModal';
import { ICloudLinkImportBridge, ICLOUD_IMPORT_FOLDER } from './ICloudLinkImportBridge';
import { parseYouTubeVideoId } from '@/lib/youtube';
import { detectICloudSource } from '@/lib/icloud-parse';
import { useTranslate } from '@/i18n';
import type { ModuleInstance } from '@/types/config';

/** Pull the `file` param back out of a serve URL (upload responses return URLs). */
function fileParamOf(url: string): string | null {
  try {
    return new URL(url, 'http://local').searchParams.get('file');
  } catch {
    return null;
  }
}

export function VideoConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const OBJECT_FIT_OPTIONS = [
    { value: 'cover', label: t('common.objectFitCover') },
    { value: 'contain', label: t('common.objectFitContain') },
    { value: 'fill', label: t('common.objectFitFill') },
  ] as const;

  const { config: c, set } = useModuleConfig<{
    source?: string; file?: string; url?: string; objectFit?: string;
    muted?: boolean; loop?: boolean; maxDurationMs?: number;
  }>(mod, screenId);

  const source = (c.source as string) || 'file';
  const file = (c.file as string) || '';
  const muted = c.muted !== false;

  const [showBrowser, setShowBrowser] = useState(false);
  const [browserDir, setBrowserDir] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // An iCloud link pasted as the video URL can never play (it's a share page,
  // not a media file) — bridge it into a library import instead.
  const pastedICloudLink = source === 'url' && detectICloudSource((c.url as string) || '') !== null;

  const handleICloudSaved = (videoFiles: string[]) => {
    if (videoFiles.length === 1) {
      // The link held exactly one clip — wire it straight into the module.
      set({ source: 'file', file: videoFiles[0], url: undefined });
    } else if (videoFiles.length > 1) {
      // Several clips — switch to the library and let the user pick.
      set({ source: 'file', url: undefined });
      setBrowserDir(ICLOUD_IMPORT_FOLDER);
      setShowBrowser(true);
    }
    // Zero videos: the bridge shows its own "no videos in this link" note.
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append('file', picked);
    try {
      const res = await editorFetch('/api/backgrounds', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.path) {
        // The module preview's point lookup for this file may be cached as
        // missing from before the upload — clear it so the poster shows now.
        displayCache.invalidateByPrefix('/api/backgrounds');
        const uploaded = fileParamOf(data.path);
        if (uploaded) set({ file: uploaded });
      } else {
        setUploadError(data.error || t('configSections.video.uploadFailed'));
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('configSections.video.uploadFailed'));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const showMovHint = source === 'file' ? /\.mov$/i.test(file) : /\.mov(\?|$)/i.test((c.url as string) || '');
  // The max-duration cap works on the <video> element; YouTube renders in an
  // iframe the cap can't reach, so hide the field rather than show a dead knob.
  const isYouTube = source === 'url' && !!parseYouTubeVideoId((c.url as string) || '');

  return (
    <>
      {/* Source tabs */}
      <div>
        <span className="text-xs text-hs-text-muted">{t('configSections.video.videoSource')}</span>
        <div className="flex gap-1 bg-hs-card rounded-md p-0.5 mt-1">
          <button
            onClick={() => set({ source: 'file' })}
            className={`flex-1 text-xs py-1 rounded ${
              source === 'file' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
            }`}
          >
            {t('configSections.video.tabLibrary')}
          </button>
          <button
            onClick={() => set({ source: 'url' })}
            className={`flex-1 text-xs py-1 rounded ${
              source === 'url' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
            }`}
          >
            {t('configSections.video.tabUrl')}
          </button>
        </div>
      </div>

      {source === 'url' ? (
        <div className="flex flex-col gap-1">
          <LabeledInput
            label={t('configSections.video.videoUrl')}
            value={(c.url as string) || ''}
            onChange={(v) => set({ url: v })}
            placeholder="https://youtube.com/watch?v=... or https://example.com/clip.mp4"
          />
          {pastedICloudLink ? (
            <ICloudLinkImportBridge
              url={(c.url as string) || ''}
              introKey="configSections.video.icloudLinkDetected"
              noItemsKey="configSections.video.icloudNoVideos"
              savedSomething={(job) => (job.videoFiles ?? []).length > 0}
              onSaved={(job) => handleICloudSaved(job.videoFiles ?? [])}
            />
          ) : (
            <p className="text-[10px] text-hs-text-faint">{t('configSections.video.urlHint')}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div>
            <span className="text-xs text-hs-text-muted">{t('configSections.video.chooseVideo')}</span>
            <div className="flex-1 px-2 py-1 mt-1 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-secondary truncate">
              {file || t('configSections.video.chooseVideoPlaceholder')}
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => setShowBrowser(true)} className="flex-1">
              {t('configSections.video.browseLibrary')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={handleUpload}
              className="hidden"
            />
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex-1">
              {uploading ? t('configSections.video.uploading') : t('configSections.video.uploadVideo')}
            </Button>
          </div>
          {uploadError && <p className="text-xs text-hs-danger">{uploadError}</p>}
        </div>
      )}

      {showMovHint && (
        <p className="text-[10px] text-hs-text-faint">{t('configSections.video.movHint')}</p>
      )}

      <LabeledSelect
        label={t('common.objectFit')}
        value={((c.objectFit as string) || 'cover') as 'cover' | 'contain' | 'fill'}
        onChange={(v) => set({ objectFit: v })}
        options={OBJECT_FIT_OPTIONS}
      />

      <Toggle
        label={t('configSections.video.playSound')}
        checked={!muted}
        onChange={(v) => set({ muted: !v })}
      />
      {!muted && (
        <p className="text-[10px] text-hs-text-faint">{t('configSections.video.soundHint')}</p>
      )}

      <Toggle
        label={t('configSections.video.loop')}
        checked={c.loop !== false}
        onChange={(v) => set({ loop: v })}
      />

      {!isYouTube && (
        <LabeledInput
          label={t('configSections.video.maxDurationSeconds')}
          type="number"
          min={0}
          step={5}
          value={Math.round(((c.maxDurationMs as number) || 0) / 1000)}
          onChange={(v) => {
            const seconds = Number(v);
            set({ maxDurationMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined });
          }}
        />
      )}

      {showBrowser && (
        <ImageBrowserModal
          mode="pick-video"
          initialDirectory={browserDir}
          onSelectVideo={(filePath) => set({ file: filePath })}
          onClose={() => { setShowBrowser(false); setBrowserDir(''); }}
        />
      )}
    </>
  );
}
