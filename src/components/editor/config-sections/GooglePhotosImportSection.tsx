'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { editorFetch } from '@/lib/editor-fetch';
import { useLibraryImportJob } from '@/hooks/useLibraryImportJob';
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

interface PickerSession {
  id: string;
  pickerUri: string;
  pollIntervalMs: number;
}

/**
 * "Import from Google Photos" — the Picker API flow. The user signs in once
 * (auth-code flow; the code comes back via the homescreens.dev helper page
 * because Google won't redirect to LAN addresses), then each import opens
 * Google Photos' own picker; picked photos download into the local library
 * and the module keeps using the plain `local` source. Google's Picker API
 * only shares hand-picked items with short-lived URLs, so import-into-library
 * is the only durable shape for a self-hosted display.
 *
 * Job polling lives in useLibraryImportJob (shared with the iCloud importer);
 * session polling below is a state-driven effect so Cancel / unmount tears
 * down the loop even mid-request, and an expired session ends with a clear
 * message instead of polling forever.
 */
export function GooglePhotosImportSection({ onImported }: Props) {
  const t = useTranslate('editor');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PickerStatus | null>(null);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<PickerSession | null>(null);

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
    if (open) refreshStatus();
  }, [open, refreshStatus]);

  // Poll the picking session while one is open. State-driven so the cleanup
  // runs on cancel/unmount, and the `cancelled` flag discards an in-flight
  // response that resolves after teardown (it must neither re-arm the loop
  // nor start an import for a session the user abandoned). The local latches
  // keep overlapping ticks from double-handling one session, and repeated
  // failures end the wait with a message instead of pulsing forever.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let inFlight = false;
    let settled = false;
    let failures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;

    const finish = (timer: ReturnType<typeof setInterval>, message?: string) => {
      settled = true;
      clearInterval(timer);
      setSession(null);
      if (message) setError(message);
    };

    const timer = setInterval(async () => {
      if (inFlight || settled) return;
      inFlight = true;
      try {
        const res = await editorFetch(`/api/google-picker/session?id=${encodeURIComponent(session.id)}`);
        if (cancelled || settled) return;
        if (!res.ok) {
          // A vanished session is terminal immediately; anything else
          // (including 500s from a lost Google connection) is terminal after
          // a few consecutive failures — never an endless silent wait.
          if (res.status === 404) {
            finish(timer, t('configSections.googlePhotosImport.sessionExpired'));
          } else if (++failures >= MAX_CONSECUTIVE_FAILURES) {
            finish(timer, t('configSections.googlePhotosImport.genericError'));
            refreshStatus();
          }
          return;
        }
        failures = 0;
        const data = await res.json();
        if (data.mediaItemsSet) {
          finish(timer);
          await startImportJob({ sessionId: session.id, folder: GOOGLE_PHOTOS_IMPORT_FOLDER });
        }
      } catch {
        // Thrown fetch = editor-side network blip — keep polling, but not
        // forever.
        if (!cancelled && !settled && ++failures >= MAX_CONSECUTIVE_FAILURES) {
          finish(timer, t('configSections.googlePhotosImport.genericError'));
        }
      } finally {
        inFlight = false;
      }
    }, Math.max(session.pollIntervalMs || 5000, 2000));
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session, startImportJob, refreshStatus, t]);

  const signIn = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await editorFetch('/api/google-picker/auth');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.open(data.url, '_blank', 'noopener');
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
      const res = await editorFetch('/api/google-picker/session', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSession(data);
      window.open(data.pickerUri, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('configSections.googlePhotosImport.genericError'));
      // A dead grant is the most likely cause — the status endpoint verifies
      // token liveness, so re-checking drops the panel back to sign-in.
      refreshStatus();
    }
    setBusy(false);
  };

  const cancelPicking = () => {
    const abandoned = session;
    // Clearing state tears the polling effect down; the DELETE is best-effort.
    setSession(null);
    if (abandoned) {
      editorFetch(`/api/google-picker/session?id=${encodeURIComponent(abandoned.id)}`, { method: 'DELETE' }).catch(() => {});
    }
  };

  const disconnect = async () => {
    await editorFetch('/api/google-picker/status', { method: 'DELETE' });
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

  if (!open) {
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
              {job!.skipped > 0
                ? t('configSections.googlePhotosImport.importDoneWithSkipped', { done: job!.done, skipped: job!.skipped })
                : t('configSections.googlePhotosImport.importDone', { done: job!.done })}
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
