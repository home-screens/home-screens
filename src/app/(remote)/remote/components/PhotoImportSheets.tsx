'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { useLibraryImportJob, type LibraryImportJobStatus } from '@/hooks/useLibraryImportJob';
import { useGooglePickerSession } from '@/hooks/useGooglePickerSession';
import { useICloudImport } from '@/hooks/useICloudImport';
import BottomSheet from './BottomSheet';
import { GHOST_BUTTON, HELPER_TEXT, SHEET_FIELD, primaryButtonStyle } from './remote-styles';
import PrimaryButton from './PrimaryButton';
import type { PhotoKind } from './photo-words';
import PhoneSpinner from './PhoneSpinner';

/** The kinds a finished import brought in, for "They'll show on Kitchen". */
export function importedKinds(job: LibraryImportJobStatus): PhotoKind[] {
  const videos = job.videoFiles?.length ?? 0;
  const kinds: PhotoKind[] = [];
  if (job.done + job.skipped > videos) kinds.push('image');
  if (videos > 0) kinds.push('video');
  return kinds;
}

const TEXT: React.CSSProperties = { fontSize: 14, color: 'var(--hs-text-muted)', lineHeight: 1.5, margin: 0 };

function Working({ label }: { label: string }) {
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600, color: 'var(--hs-text-primary)', minHeight: 48 }}>
      <PhoneSpinner />
      {label}
    </div>
  );
}

/** What a finished import did: added, already there, and couldn't. */
function ImportResult({ job, whereTheyShow }: { job: LibraryImportJobStatus; whereTheyShow: (kinds: PhotoKind[], count: number) => string }) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const unsaved = Math.max(job.total - job.done - job.skipped, 0);
  return (
    <div data-testid="photo-import-result" style={{ fontSize: 14, color: 'var(--hs-text-primary)', lineHeight: 1.45 }}>
      {job.done > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <CircleCheck size={18} style={{ color: 'var(--hs-success)', marginTop: 1, flex: 'none' }} aria-hidden="true" />
          <span><b>{t('photosTab.upload.added', { count: job.done })}</b> {whereTheyShow(importedKinds(job), job.done)}</span>
        </div>
      )}
      {job.skipped > 0 && <p style={{ ...TEXT, marginTop: 6 }}>{tCore('imports.alreadyHere', { count: job.skipped })}</p>}
      {unsaved > 0 && <p style={{ ...TEXT, marginTop: 6, color: 'var(--hs-warning-ink)' }}>{t('photosTab.imports.couldNotAdd', { count: unsaved })}</p>}
      {job.done === 0 && job.skipped === 0 && unsaved === 0 && <p style={TEXT}>{tCore('imports.nothingFound')}</p>}
    </div>
  );
}

/**
 * Add from Google Photos. The session is asked for as soon as the sheet
 * opens, so the tap that opens Google Photos is a plain link: a phone blocks
 * a window a page opens after waiting on the network. On a phone the link
 * opens the Google Photos app; once the picks are in, the hub downloads them
 * into the folder being viewed. Signing in to Google stays on a computer.
 */
export function PhotoGoogleSheet({
  folder,
  folderLabel,
  whereTheyShow,
  onImported,
  onClose,
}: {
  folder: string;
  folderLabel: string;
  whereTheyShow: (kinds: PhotoKind[], count: number) => string;
  onImported: () => void;
  onClose: () => void;
}) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const importJob = useLibraryImportJob('/api/google-picker/import', () => onImported());
  const { session, open, cancel } = useGooglePickerSession((end, sessionId) => {
    if (end === 'picked') void importJob.start({ sessionId, folder });
    else setError(t(end === 'expired' ? 'photosTab.imports.googleExpired' : 'photosTab.imports.googleFailed'));
  });

  const startedRef = useRef(false);
  const begin = () => {
    setError(null);
    setOpened(false);
    // An import that could not start (busy, nothing picked) would otherwise
    // keep its message over the new session's link.
    importJob.reset();
    open().catch(() => setError(t('photosTab.imports.googleFailed')));
  };
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one session per opening of the sheet
  }, []);

  const close = () => {
    cancel();
    onClose();
  };

  const startError = importJob.errorCode === null ? null
    : importJob.errorCode === 'nothing-picked' ? t('photosTab.imports.nothingPicked')
      : importJob.errorCode === 'busy' ? t('photosTab.imports.busy')
        : importJob.errorCode === 'too-many-items' ? t('photosTab.imports.tooMany')
          : importJob.errorCode === 'lost' ? t('photosTab.imports.lost')
            : t('photosTab.imports.googleFailed');
  const done = !importJob.running && importJob.job && importJob.job.state !== 'running';

  return (
    <BottomSheet title={t('photosTab.imports.googleTitle')} onClose={close} testId="photo-google-sheet">
      {importJob.running ? (
        <Working label={t('photosTab.imports.progress', {
          done: (importJob.job?.done ?? 0) + (importJob.job?.skipped ?? 0),
          total: importJob.job?.total ?? 0,
        })} />
      ) : done && importJob.job ? (
        <ImportResult job={importJob.job} whereTheyShow={whereTheyShow} />
      ) : error || startError ? (
        <>
          <p style={{ ...TEXT, color: 'var(--hs-warning-ink)' }} data-testid="photo-import-error">{error ?? startError}</p>
          <PrimaryButton onClick={begin} style={{ marginTop: 16 }}>
            {t('photosTab.imports.tryAgain')}
          </PrimaryButton>
        </>
      ) : session ? (
        <>
          <p style={TEXT}>{t('photosTab.imports.googleIntro', { folder: folderLabel })}</p>
          <a
            href={session.pickerUri}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpened(true)}
            data-testid="photo-google-open"
            className="press-btn"
            style={{ ...primaryButtonStyle(), marginTop: 16, textDecoration: 'none' }}
          >
            {t('photosTab.imports.googleOpen')}
          </a>
          {opened && (
            <p style={{ ...HELPER_TEXT, marginTop: 12 }} className="animate-pulse">{tCore('imports.googleWaiting')}</p>
          )}
        </>
      ) : (
        <Working label={t('photosTab.imports.googlePreparing')} />
      )}
      <button type="button" onClick={close} className="press-scale" style={{ ...GHOST_BUTTON, marginTop: 12 }}>
        {done ? tCore('actions.done') : tCore('actions.cancel')}
      </button>
    </BottomSheet>
  );
}

/**
 * Add from an iCloud link: paste a Shared Album link, or the link the Photos
 * app's Copy iCloud Link makes, and everything in it is downloaded into the
 * folder being viewed. iCloud links run out after a while, which is why this
 * copies the photos rather than pointing at them.
 */
export function PhotoICloudSheet({
  folder,
  folderLabel,
  whereTheyShow,
  onImported,
  onClose,
}: {
  folder: string;
  folderLabel: string;
  whereTheyShow: (kinds: PhotoKind[], count: number) => string;
  onImported: () => void;
  onClose: () => void;
}) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const [url, setUrl] = useState('');
  const { start, running, finished, job, errorKey } = useICloudImport(() => onImported());
  const canStart = url.trim() !== '' && !running;

  return (
    <BottomSheet title={tCore('imports.icloudTitle')} onClose={onClose} testId="photo-icloud-sheet">
      {running ? (
        <Working label={t('photosTab.imports.progress', { done: (job?.done ?? 0) + (job?.skipped ?? 0), total: job?.total ?? 0 })} />
      ) : finished && job ? (
        <ImportResult job={job} whereTheyShow={whereTheyShow} />
      ) : (
        <>
          <p style={TEXT}>{t('photosTab.imports.icloudIntro', { folder: folderLabel })}</p>
          <input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canStart) void start(url, folder); }}
            placeholder={t('photosTab.imports.icloudPlaceholder')}
            aria-label={t('photosTab.imports.icloudPlaceholder')}
            autoComplete="off"
            data-testid="photo-icloud-url"
            style={{ ...SHEET_FIELD, marginTop: 14 }}
          />
          {errorKey && (
            <p style={{ ...TEXT, marginTop: 10, color: 'var(--hs-warning-ink)' }} data-testid="photo-import-error">
              {t(`photosTab.imports.icloudErrors.${errorKey}`)}
            </p>
          )}
          <PrimaryButton onClick={() => void start(url, folder)} disabled={!canStart} data-testid="photo-icloud-start" style={{ marginTop: 16 }}>
            {t('photosTab.imports.icloudAdd')}
          </PrimaryButton>
        </>
      )}
      <button type="button" onClick={onClose} className="press-scale" style={GHOST_BUTTON}>
        {finished ? tCore('actions.done') : tCore('actions.cancel')}
      </button>
    </BottomSheet>
  );
}
