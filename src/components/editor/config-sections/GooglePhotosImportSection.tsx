'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { editorFetch } from '@/lib/editor-fetch';
import { errorWithDetail } from '@/lib/hub-request';
import GoogleSignInButton from '@/components/ui/GoogleSignInButton';
import { useLibraryImportJob } from '@/hooks/useLibraryImportJob';
import { useGooglePickerSession } from '@/hooks/useGooglePickerSession';
import { useGoogleApps } from '@/hooks/useGoogleApps';
import { useTranslate } from '@/i18n';

/** Where Google Photos picks land in the media library. */
export const GOOGLE_PHOTOS_IMPORT_FOLDER = 'google-photos';

interface Props {
  /** Fired when an import finishes with photos actually present in the folder. */
  onImported: (folder: string) => void;
}

interface PickerStatus {
  connected: boolean;
  credentialsConfigured: boolean;
}

/** How often the panel looks for a sign-in landing while the Google tab is open. */
const SIGN_IN_POLL_MS = 3000;
/** A Google sign-in link is good for 10 minutes; stop looking after that. */
const SIGN_IN_POLL_LIMIT_MS = 10 * 60_000;

/**
 * "Import from Google Photos" — the Picker API flow. The user signs in once
 * (auth-code flow; the code comes back via the homescreens.dev helper page
 * because Google won't redirect to LAN addresses), then each import opens
 * Google Photos' own picker; picked photos download into the local library
 * and the module keeps using the plain `local` source. Google's Picker API
 * only shares hand-picked items with short-lived URLs, so import-into-library
 * is the only durable shape for a self-hosted display.
 *
 * Job polling lives in useLibraryImportJob (shared with the iCloud importer)
 * and session polling in useGooglePickerSession (shared with the phone's
 * Photos tab); an expired session ends with a clear message instead of
 * polling forever.
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
  const { apps, loading: appsLoading } = useGoogleApps();
  const hosted = apps?.photos.mode === 'hosted';
  // With the switch on, sign-in links bring people back here on their own.
  const returnsToHub = apps?.photos.hostedAvailable === true;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PickerStatus | null>(null);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // With the switch on, signing in is a step of its own, not a paste box.
  const [signInStep, setSignInStep] = useState<'start' | 'waiting' | 'paste'>('start');

  const {
    start: startImportJob, running: importing, job, errorCode, reset: resetJob,
  } = useLibraryImportJob('/api/google-picker/import', (finishedJob) => {
    // Only repoint the module when the folder actually has these photos —
    // a fully failed import must not flip a working slideshow to nothing.
    if (finishedJob.done + finishedJob.skipped > 0) onImported(GOOGLE_PHOTOS_IMPORT_FOLDER);
  });

  const refreshStatus = useCallback(async () => {
    try {
      const res = await editorFetch('/api/google-picker/status');
      setStatus(res.ok ? await res.json() : null);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    if (open || hosted) refreshStatus();
  }, [open, hosted, refreshStatus]);

  // While the Google tab is open, look for the sign-in landing, so the panel
  // moves on by itself once the hub has it.
  const connected = status?.connected === true;
  useEffect(() => {
    if (signInStep !== 'waiting' || connected) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > SIGN_IN_POLL_LIMIT_MS) {
        clearInterval(timer);
        return;
      }
      void refreshStatus();
    }, SIGN_IN_POLL_MS);
    return () => clearInterval(timer);
  }, [signInStep, connected, refreshStatus]);

  const { session, open: openSession, cancel: cancelPicking } = useGooglePickerSession((end, sessionId) => {
    if (end === 'picked') {
      void startImportJob({ sessionId, folder: GOOGLE_PHOTOS_IMPORT_FOLDER });
    } else if (end === 'expired') {
      setError(t('configSections.googlePhotosImport.sessionExpired'));
    } else {
      setError(t('configSections.googlePhotosImport.genericError'));
      refreshStatus();
    }
  });

  const signIn = async () => {
    setError(null);
    setBusy(true);
    try {
      // The address this editor is on, so the sign-in can come back to it.
      const res = await editorFetch(`/api/google-picker/auth?origin=${encodeURIComponent(window.location.origin)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(errorWithDetail(data));
      window.open(data.url, '_blank', 'noopener');
      // A link without this hub's address ends on the copy-a-code page.
      setSignInStep(data.returnsToHub ? 'waiting' : 'paste');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('configSections.googlePhotosImport.genericError'));
    }
    setBusy(false);
  };

  const finishSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await editorFetch('/api/google-picker/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: pasted }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPasted('');
      setSignInStep('start');
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('configSections.googlePhotosImport.genericError'));
    }
    setBusy(false);
  };

  const choosePhotos = async () => {
    setError(null);
    resetJob();
    setBusy(true);
    try {
      const data = await openSession();
      window.open(data.pickerUri, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('configSections.googlePhotosImport.genericError'));
      // A dead grant is the most likely cause — the status endpoint verifies
      // token liveness, so re-checking drops the panel back to sign-in.
      refreshStatus();
    }
    setBusy(false);
  };

  const disconnect = async () => {
    await editorFetch('/api/google-picker/status', { method: 'DELETE' });
    setSignInStep('start');
    await refreshStatus();
  };

  const startErrorText = errorCode === null ? null
    : errorCode === 'nothing-picked' ? t('configSections.googlePhotosImport.nothingPicked')
      : errorCode === 'busy' ? t('configSections.googlePhotosImport.busy')
        : errorCode === 'too-many-items' ? t('configSections.googlePhotosImport.tooMany')
          : errorCode === 'lost' ? t('configSections.googlePhotosImport.jobLost')
            : t('configSections.googlePhotosImport.genericError');

  // A finished job where nothing landed (all downloads failed, or auth was
  // lost immediately) is a failure whatever the job state says; a job that
  // saved some photos before stopping reports what it saved plus what it
  // couldn't.
  const savedCount = (job?.done ?? 0) + (job?.skipped ?? 0);
  const unsavedCount = Math.max((job?.total ?? 0) - savedCount, 0);
  const jobFailed = !!job && !importing && savedCount === 0;
  const jobSucceeded = !!job && !importing && savedCount > 0;

  // Which app signs in decides which panel this is; show neither until it's known.
  if (appsLoading) return null;

  // Signing in once links come back to the hub (switch on): the Google
  // button, then waiting for the sign-in to land, with the paste box as a
  // fallback. Home Screens' app and the household's own app share it.
  const signInSteps = (
    <div>
      {signInStep === 'waiting' ? (
        <>
          <p className="mt-2 mb-2.5 flex items-center gap-2 text-xs text-hs-text-muted">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-hs-border-strong border-t-hs-accent-hover"
            />
            {t('configSections.googlePhotosImport.hosted.finishOnGoogle')}
          </p>
          <p className="text-[11px] leading-[1.45] text-hs-text-muted">
            {t('configSections.googlePhotosImport.hosted.comesBack')}{' '}
            <button
              type="button"
              onClick={() => setSignInStep('paste')}
              className="text-hs-text-faint underline hover:text-hs-text-muted"
            >
              {t('configSections.googlePhotosImport.hosted.pasteInstead')}
            </button>
          </p>
        </>
      ) : signInStep === 'paste' ? (
        <>
          <p className="mt-0.5 text-[11px] leading-[1.45] text-hs-text-muted">
            {t('configSections.googlePhotosImport.hosted.pasteIntro')}
          </p>
          <input
            type="text"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={t('configSections.googlePhotosImport.pastePlaceholder')}
            className={`${INPUT_CLASS} mt-2`}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <Button size="sm" variant="primary" onClick={finishSignIn} disabled={busy || !pasted.trim()}>
              {t('configSections.googlePhotosImport.finishSignIn')}
            </Button>
            <button
              type="button"
              onClick={() => { setPasted(''); setError(null); setSignInStep('start'); }}
              className="text-[11px] text-hs-text-faint underline hover:text-hs-text-muted"
            >
              {t('configSections.googlePhotosImport.hosted.startOver')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-0.5 mb-2.5 text-[11px] leading-[1.45] text-hs-text-muted">
            {t('configSections.googlePhotosImport.hosted.intro')}
          </p>
          <GoogleSignInButton
            size="sm"
            label={t('configSections.googlePhotosImport.hosted.signIn')}
            onClick={signIn}
            disabled={busy}
          />
        </>
      )}
    </div>
  );

  if (hosted && !connected) {
    return (
      <div className="rounded-lg border border-hs-border-strong bg-hs-card/40 p-2.5" data-testid="google-photos-hosted">
        <p className="text-xs font-semibold text-hs-text-primary">
          {t('configSections.googlePhotosImport.importButton')}
        </p>
        {!status ? (
          <p className="mt-1 text-[11px] text-hs-text-muted">{t('configSections.googlePhotosImport.checking')}</p>
        ) : signInSteps}
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
        signInSteps
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
