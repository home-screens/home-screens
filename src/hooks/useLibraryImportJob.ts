'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { displayCache } from '@/lib/display-cache';

export interface LibraryImportJobStatus {
  state: 'running' | 'done' | 'error';
  total: number;
  done: number;
  skipped: number;
  failed: number;
  /** Library-relative paths of the batch's videos now present locally. */
  videoFiles?: string[];
}

const POLL_MS = 1000;

/**
 * Start-and-poll client for a library-import route (POST body starts a job →
 * { jobId, total }; GET ?jobId= polls it), shared by the iCloud and Google
 * Photos importers so job semantics — including the backgrounds-cache
 * invalidation every library-mutating path owes — can't drift.
 *
 * `errorCode` is the raw server error string ('busy', 'too-many-items', …) or
 * 'lost' when a polled job disappears (hub restart wipes the in-memory job
 * registry); callers map codes to their own translation keys. A non-OK poll
 * is terminal on purpose — only thrown fetches (network blips) keep polling.
 */
export function useLibraryImportJob(endpoint: string, onFinished?: (job: LibraryImportJobStatus) => void) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<LibraryImportJobStatus | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  // Synchronous re-entrancy latch spanning start() through job completion —
  // React state is too slow for two calls in the same tick (e.g. overlapping
  // session-poll responses both trying to start the import), and a second
  // POST would 409 against the process-wide lock and pin a false "busy".
  const activeRef = useRef(false);

  const running = starting || (!!jobId && job?.state === 'running');
  const finished = !jobId && !!job && (job.state === 'done' || job.state === 'error');

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    // Local latches (not state): an interval callback can still be past its
    // await when the terminal one clears the interval — without these, two
    // in-flight polls could both observe the terminal state and fire
    // onFinished twice for one job.
    let inFlight = false;
    let done = false;
    const timer = setInterval(async () => {
      if (inFlight || done) return;
      inFlight = true;
      try {
        const res = await editorFetch(`${endpoint}?jobId=${encodeURIComponent(jobId)}`);
        if (cancelled || done) return;
        if (!res.ok) {
          done = true;
          clearInterval(timer);
          activeRef.current = false;
          setJobId(null);
          setErrorCode('lost');
          return;
        }
        const status: LibraryImportJobStatus = await res.json();
        setJob(status);
        if (status.state !== 'running') {
          done = true;
          clearInterval(timer);
          activeRef.current = false;
          setJobId(null);
          // The import just changed the library's contents on disk — any
          // module preview holding a fresh-cached backgrounds list would
          // otherwise show the pre-import state for up to a full TTL.
          displayCache.invalidateByPrefix('/api/backgrounds');
          onFinishedRef.current?.(status);
        }
      } catch {
        // Transient poll failure — keep polling; the job runs server-side.
      } finally {
        inFlight = false;
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, endpoint]);

  const start = useCallback(async (body: Record<string, unknown>) => {
    if (activeRef.current) return;
    activeRef.current = true;
    setStarting(true);
    setErrorCode(null);
    setJob(null);
    try {
      const res = await editorFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorCode(typeof data.error === 'string' ? data.error : 'request-failed');
        activeRef.current = false;
      } else {
        setJob({ state: 'running', total: data.total, done: 0, skipped: 0, failed: 0 });
        setJobId(data.jobId);
      }
    } catch {
      setErrorCode('request-failed');
      activeRef.current = false;
    }
    setStarting(false);
  }, [endpoint]);

  const reset = useCallback(() => {
    setJob(null);
    setErrorCode(null);
  }, []);

  return { start, reset, running, finished, job, errorCode };
}
