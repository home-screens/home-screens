'use client';

import { useCallback, useEffect, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { errorWithDetail } from '@/lib/hub-request';
import { useLibraryImportJob, type LibraryImportJobStatus } from '@/hooks/useLibraryImportJob';
import { useGooglePickerSession } from '@/hooks/useGooglePickerSession';
import { useGoogleApps } from '@/hooks/useGoogleApps';
import { useTranslate } from '@/i18n';

interface PickerStatus {
  connected: boolean;
  credentialsConfigured: boolean;
}

/** How often to look for a sign-in landing while the Google tab is open. */
const SIGN_IN_POLL_MS = 3000;
/** A Google sign-in link is good for 10 minutes; stop looking after that. */
const SIGN_IN_POLL_LIMIT_MS = 10 * 60_000;

/**
 * Everything "add from Google Photos" needs, for any library folder: the
 * sign-in (Home Screens' own app or the household's, with the paste-a-code
 * fallback), opening Google Photos' own picker, and the download into
 * `folder`. Shared by a slideshow's settings card, the Image Library's Local
 * tab and the Pictures & videos page, so the three can't drift.
 *
 * Google's Picker API only shares hand-picked items with short-lived URLs,
 * so importing into the library is the only durable shape for a
 * self-hosted display. Job polling lives in useLibraryImportJob (shared with
 * the iCloud importer) and session polling in useGooglePickerSession (shared
 * with the phone's Photos tab).
 *
 * `active` false keeps it quiet (no status request) until a surface that
 * shows it behind a button is opened.
 */
export function useGooglePhotosImport({ folder, active = true, onImported }: {
  /** Library folder picks land in. */
  folder: string;
  active?: boolean;
  /** Fired when an import finishes with photos actually present in the folder. */
  onImported?: (job: LibraryImportJobStatus) => void;
}) {
  const t = useTranslate('editor');
  const { apps, loading: appsLoading } = useGoogleApps();
  const hosted = apps?.photos?.mode === 'hosted';
  // With the switch on, sign-in links bring people back here on their own.
  const returnsToHub = apps?.photos?.hostedAvailable === true;
  const [status, setStatus] = useState<PickerStatus | null>(null);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // With the switch on, signing in is a step of its own, not a paste box.
  const [signInStep, setSignInStep] = useState<'start' | 'waiting' | 'paste'>('start');

  const {
    start: startImportJob, running: importing, job, errorCode, reset: resetJob,
  } = useLibraryImportJob('/api/google-picker/import', (finishedJob) => {
    // Only report photos that are actually in the folder: a fully failed
    // import must not repoint a working slideshow at nothing.
    if (finishedJob.done + finishedJob.skipped > 0) onImported?.(finishedJob);
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
    if (active || hosted) void refreshStatus();
  }, [active, hosted, refreshStatus]);

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
      void startImportJob({ sessionId, folder });
    } else if (end === 'expired') {
      setError(t('configSections.googlePhotosImport.sessionExpired'));
    } else {
      setError(t('configSections.googlePhotosImport.genericError'));
      void refreshStatus();
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
      if (!res.ok) throw new Error(errorWithDetail(data));
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
      // A dead grant is the most likely cause: the status endpoint checks the
      // token, so re-checking drops the panel back to sign-in.
      void refreshStatus();
    }
    setBusy(false);
  };

  const disconnect = async () => {
    await editorFetch('/api/google-picker/status', { method: 'DELETE' });
    setSignInStep('start');
    await refreshStatus();
  };

  const startOver = () => {
    setPasted('');
    setError(null);
    setSignInStep('start');
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

  return {
    appsLoading, hosted, returnsToHub,
    status, connected, refreshStatus,
    signInStep, setSignInStep, pasted, setPasted, signIn, finishSignIn, startOver,
    busy, error,
    session, choosePhotos, cancelPicking,
    importing, job, savedCount, unsavedCount, jobFailed, jobSucceeded, startErrorText,
    disconnect,
  };
}

export type GooglePhotosImport = ReturnType<typeof useGooglePhotosImport>;
