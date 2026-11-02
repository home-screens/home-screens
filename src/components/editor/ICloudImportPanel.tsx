'use client';

import { useState, type ReactNode } from 'react';
import Button from '@/components/ui/Button';
import { useICloudImport } from '@/hooks/useICloudImport';
import { detectICloudSource } from '@/lib/icloud-parse';
import { useTranslate } from '@/i18n';

interface Props {
  /** Library folder the import downloads into ('' = root). */
  selectedDir: string;
  /** Called when a job finishes so the caller can refresh its listings. */
  onImported: () => void;
  /** Another way in, on the right of the same row (Add from Google Photos). */
  trailing?: ReactNode;
  /** That other way's progress lines, under the row. */
  below?: ReactNode;
}

/**
 * "Add from an iCloud link" strip for the media library: paste a Shared
 * Album link or a "Copy iCloud Link" photo link, and everything it contains
 * is downloaded into the currently selected folder. iCloud Links expire after
 * ~30 days, which is exactly why this imports instead of linking live.
 */
export default function ICloudImportPanel({ selectedDir, onImported, trailing, below }: Props) {
  const t = useTranslate('editor');
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const { start, running, finished, job, errorKey } = useICloudImport(() => {
    setUrl('');
    onImported();
  });

  // Shared Albums also work live, without downloading — worth a pointer,
  // since the user may not know the slideshow can play the album directly.
  const showAlbumTip = detectICloudSource(url) === 'album' && !running && !finished;

  return (
    <div className="border-b border-hs-border">
      <div className="flex items-center gap-2 pr-3">
        <button
          onClick={() => setOpen(!open)}
          className="flex-1 text-left text-xs px-3 py-1.5 text-hs-text-muted hover:text-hs-text-body flex items-center gap-1.5"
        >
          <span className="text-hs-text-faint">{open ? '▾' : '▸'}</span>
          {t('icloudImport.toggle')}
        </button>
        {trailing}
      </div>
      {below && <div className="px-3 pb-2">{below}</div>}

      {open && (
        <div className="px-3 pb-2.5 space-y-1.5">
          <div className="flex gap-1.5">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') start(url, selectedDir); }}
              placeholder={t('icloudImport.placeholder')}
              disabled={running}
              className="flex-1 min-w-0 px-2 py-1 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-body focus:outline-none focus:border-hs-accent"
            />
            <Button
              size="sm"
              variant="primary"
              onClick={() => start(url, selectedDir)}
              disabled={running || !url.trim()}
            >
              {running ? t('icloudImport.importing') : t('icloudImport.start')}
            </Button>
          </div>

          {running && job && (
            <p className="text-[11px] text-hs-text-muted">
              {t('icloudImport.progress', { done: job.done + job.skipped, total: job.total })}
            </p>
          )}

          {finished && job && (
            <p className="text-[11px] text-hs-text-muted">
              {job.total === 0
                ? t('icloudImport.empty')
                : [
                    job.done > 0 ? t('icloudImport.summaryAdded', { count: job.done }) : null,
                    job.skipped > 0 ? t('icloudImport.summarySkipped', { count: job.skipped }) : null,
                    job.failed > 0 ? t('icloudImport.summaryFailed', { count: job.failed }) : null,
                  ].filter(Boolean).join(' ')}
            </p>
          )}

          {errorKey && <p className="text-[11px] text-hs-warning">{t(`icloudImport.errors.${errorKey}`)}</p>}

          {showAlbumTip && (
            <p className="text-[10px] text-hs-text-faint leading-relaxed">
              {t('icloudImport.albumTip')}
            </p>
          )}

          {!running && !finished && !errorKey && !showAlbumTip && (
            <p className="text-[10px] text-hs-text-faint leading-relaxed">
              {t('icloudImport.help')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
