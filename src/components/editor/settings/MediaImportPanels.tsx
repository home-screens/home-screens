'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { useICloudImport } from '@/hooks/useICloudImport';
import { useGooglePhotosImport } from '@/hooks/useGooglePhotosImport';
import { GooglePhotosAction, GooglePhotosProgress } from '@/components/editor/photo-source/GooglePhotosAdd';
import { useTranslate } from '@/i18n';

const PANEL_CLASS = 'mb-4 flex flex-col gap-2.5 rounded-[10px] border border-hs-border-strong bg-hs-card p-3';

/** The "Save into" folder control both panels share with the upload panel. */
function SaveInto({ value, onChange, directories }: { value: string; onChange: (folder: string) => void; directories: readonly { path: string }[] }) {
  const t = useTranslate('editor');
  return (
    <label className="flex items-center gap-2 text-xs text-hs-text-muted">
      {t('settings.mediaPage.saveInto')}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS} data-testid="media-import-folder">
        <option value="">{t('settings.mediaPage.topLevel')}</option>
        {directories.map((d) => (
          <option key={d.path} value={d.path}>{d.path}</option>
        ))}
      </select>
    </label>
  );
}

/**
 * Add from an iCloud link on the Pictures & videos page: a Shared Album
 * link or a Copy iCloud Link link, everything in it saved into one folder,
 * worded like the phone's sheet.
 */
export function ICloudImportSheet({ initialFolder, directories, onImported }: {
  initialFolder: string;
  directories: readonly { path: string }[];
  onImported: () => void;
}) {
  const t = useTranslate('editor');
  const [url, setUrl] = useState('');
  const [folder, setFolder] = useState(initialFolder);
  const { start, running, finished, job, errorKey } = useICloudImport(() => {
    setUrl('');
    onImported();
  });
  return (
    <div className={PANEL_CLASS} data-testid="media-icloud-panel">
      <p className="text-xs font-semibold text-hs-text-primary">{t('photoSources.import.icloudTitle')}</p>
      <p className="text-[11px] leading-[1.45] text-hs-text-muted">{t('photoSources.import.icloudIntro')}</p>
      <div className="flex gap-1.5">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void start(url, folder); }}
          placeholder={t('icloudImport.placeholder')}
          disabled={running}
          className={INPUT_CLASS}
          data-testid="media-icloud-url"
        />
        <Button size="sm" variant="primary" onClick={() => void start(url, folder)} disabled={running || !url.trim()}>
          {t('photoSources.import.add')}
        </Button>
      </div>
      <SaveInto value={folder} onChange={setFolder} directories={directories} />
      {running && job && (
        <p className="text-[11px] text-hs-text-muted">{t('photoSources.import.progress', { done: job.done + job.skipped, total: job.total })}</p>
      )}
      {finished && job && (
        <p className="text-[11px] text-hs-text-muted">
          {job.total === 0
            ? t('icloudImport.empty')
            : [
                job.done > 0 ? t('photoSources.google.added', { count: job.done }) : null,
                job.skipped > 0 ? t('photoSources.google.alreadyHere', { count: job.skipped }) : null,
                job.failed > 0 ? t('photoSources.google.notSaved', { count: job.failed }) : null,
              ].filter(Boolean).join(' ')}
        </p>
      )}
      {errorKey && <p className="text-[11px] text-hs-warning">{t(`icloudImport.errors.${errorKey}`)}</p>}
    </div>
  );
}

/**
 * Add from Google Photos on the Pictures & videos page: sign in once right
 * here if needed, then Google Photos' own picker; the picks are saved into
 * the chosen folder.
 */
export function GooglePhotosImportSheet({ initialFolder, directories, onImported }: {
  initialFolder: string;
  directories: readonly { path: string }[];
  onImported: () => void;
}) {
  const t = useTranslate('editor');
  const [folder, setFolder] = useState(initialFolder);
  const google = useGooglePhotosImport({ folder, onImported });
  return (
    <div className={PANEL_CLASS} data-testid="media-google-panel">
      <p className="text-xs font-semibold text-hs-text-primary">{t('photoSources.google.add')}</p>
      <p className="text-[11px] leading-[1.45] text-hs-text-muted">
        {google.connected ? t('photoSources.import.googleIntro') : t('photoSources.import.googleSignInIntro')}
      </p>
      {google.connected && <SaveInto value={folder} onChange={setFolder} directories={directories} />}
      <div><GooglePhotosAction google={google} label={t('photoSources.import.openGoogle')} /></div>
      <GooglePhotosProgress google={google} folderLabel={folder || t('settings.mediaPage.topLevel')} />
      {google.connected && (
        <button type="button" onClick={google.disconnect} className="self-start text-[10px] text-hs-text-faint hover:text-hs-text-muted">
          {t('configSections.googlePhotosImport.disconnect')}
        </button>
      )}
    </div>
  );
}
