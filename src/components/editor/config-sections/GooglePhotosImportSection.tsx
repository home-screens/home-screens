'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { useGooglePhotosImport } from '@/hooks/useGooglePhotosImport';
import GooglePhotosSignIn from '@/components/editor/photo-source/GooglePhotosSignIn';
import { useTranslate } from '@/i18n';

/** Where Google Photos picks land in the media library. */
export const GOOGLE_PHOTOS_IMPORT_FOLDER = 'google-photos';

interface Props {
  /** Fired when an import finishes with photos actually present in the folder. */
  onImported: (folder: string) => void;
}

/**
 * "Import from Google Photos" — the Picker API flow. The user signs in once
 * (auth-code flow; the code comes back via the homescreens.dev helper page
 * because Google won't redirect to LAN addresses), then each import opens
 * Google Photos' own picker; picked photos download into the library and
 * the module points its library-folder source at them. The sign-in and
 * import logic is `useGooglePhotosImport`, shared with the Image Library's
 * Local tab and the Pictures & videos page; this is the slideshow card's
 * layout of it.
 *
 * With Home Screens' own Google app (HS_GOOGLE_HOSTED) there is nothing to
 * set up, so the panel offers Google's sign-in button straight away instead
 * of behind a button. With the switch on, every sign-in (the household's own
 * app too) comes straight back to the hub (/editor/connect/google), so the
 * panel waits for it to land while the Google tab is open and keeps the paste
 * box only as a fallback. A hub with the switch off gets exactly the flow
 * below.
 */
export function GooglePhotosImportSection({ onImported }: Props) {
  const t = useTranslate('editor');
  const [open, setOpen] = useState(false);
  const google = useGooglePhotosImport({
    folder: GOOGLE_PHOTOS_IMPORT_FOLDER,
    active: open,
    onImported: () => onImported(GOOGLE_PHOTOS_IMPORT_FOLDER),
  });
  const {
    appsLoading, hosted, returnsToHub, status, connected, pasted, setPasted, busy, error,
    signIn, finishSignIn, session, choosePhotos, cancelPicking, importing, job,
    unsavedCount, jobFailed, jobSucceeded, startErrorText, disconnect,
  } = google;

  // Which app signs in decides which panel this is; show neither until it's known.
  if (appsLoading) return null;

  if (hosted && !connected) {
    return (
      <div className="rounded-lg border border-hs-border-strong bg-hs-card/40 p-2.5" data-testid="google-photos-hosted">
        <p className="text-xs font-semibold text-hs-text-primary">
          {t('configSections.googlePhotosImport.importButton')}
        </p>
        {!status ? (
          <p className="mt-1 text-[11px] text-hs-text-muted">{t('configSections.googlePhotosImport.checking')}</p>
        ) : <GooglePhotosSignIn google={google} />}
        {error && <p className="mt-2 text-[11px] text-hs-warning leading-relaxed">{error}</p>}
      </div>
    );
  }

  if (!open && !hosted) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        {t('configSections.googlePhotosImport.importButton')}
      </Button>
    );
  }

  return (
    <div className="space-y-1.5 p-2 rounded bg-hs-card border border-hs-border-strong">
      {!status ? (
        <p className="text-[11px] text-hs-text-muted">{t('configSections.googlePhotosImport.checking')}</p>
      ) : !status.credentialsConfigured ? (
        <p className="text-[11px] text-hs-text-muted leading-relaxed">
          {t('configSections.googlePhotosImport.credentialsNeeded')}
        </p>
      ) : !status.connected && returnsToHub ? (
        <GooglePhotosSignIn google={google} />
      ) : !status.connected ? (
        <>
          <p className="text-[11px] text-hs-text-muted leading-relaxed">
            {t('configSections.googlePhotosImport.signInIntro')}
          </p>
          <Button size="sm" variant="primary" onClick={signIn} disabled={busy}>
            {t('configSections.googlePhotosImport.signIn')}
          </Button>
          <input
            type="text"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={t('configSections.googlePhotosImport.pastePlaceholder')}
            className={INPUT_CLASS}
          />
          {pasted.trim() && (
            <Button size="sm" onClick={finishSignIn} disabled={busy}>
              {t('configSections.googlePhotosImport.finishSignIn')}
            </Button>
          )}
        </>
      ) : session ? (
        <>
          <p className="text-[11px] text-hs-text-muted animate-pulse">
            {t('configSections.googlePhotosImport.waitingForPicks')}
          </p>
          <div className="flex gap-2 items-center">
            <a href={session.pickerUri} target="_blank" rel="noreferrer" className="text-[11px] text-hs-accent hover:text-hs-accent-hover">
              {t('configSections.googlePhotosImport.reopenPicker')}
            </a>
            <button onClick={cancelPicking} className="text-[11px] text-hs-text-faint hover:text-hs-text-muted">
              {t('configSections.googlePhotosImport.cancel')}
            </button>
          </div>
        </>
      ) : importing ? (
        <p className="text-[11px] text-hs-text-muted">
          {t('configSections.googlePhotosImport.importing', {
            done: (job?.done ?? 0) + (job?.skipped ?? 0),
            total: job?.total ?? 0,
          })}
        </p>
      ) : (
        <>
          {jobSucceeded && (
            <p className="text-[11px] text-hs-success">
              {[
                job!.done > 0 ? t('configSections.googlePhotosImport.importDone', { count: job!.done }) : null,
                job!.skipped > 0 ? t('configSections.googlePhotosImport.alreadyInLibrary', { count: job!.skipped }) : null,
              ].filter(Boolean).join(' ')}
            </p>
          )}
          {jobSucceeded && unsavedCount > 0 && (
            <p className="text-[11px] text-hs-warning">
              {t('configSections.googlePhotosImport.failedNote', { failed: unsavedCount })}
            </p>
          )}
          {jobFailed && (
            <p className="text-[11px] text-hs-warning">
              {t('configSections.googlePhotosImport.allFailed')}
            </p>
          )}
          <Button size="sm" variant="primary" onClick={choosePhotos} disabled={busy}>
            {t('configSections.googlePhotosImport.choosePhotos')}
          </Button>
          <button onClick={disconnect} className="block text-[10px] text-hs-text-faint hover:text-hs-text-muted">
            {t('configSections.googlePhotosImport.disconnect')}
          </button>
        </>
      )}
      {startErrorText && <p className="text-[11px] text-hs-warning leading-relaxed">{startErrorText}</p>}
      {error && <p className="text-[11px] text-hs-warning leading-relaxed">{error}</p>}
    </div>
  );
}
