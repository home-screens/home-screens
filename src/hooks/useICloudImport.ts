'use client';

import { useEffect, useRef, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { displayCache } from '@/lib/display-cache';

export interface ICloudImportJobStatus {
  state: 'running' | 'done' | 'error';
  total: number;
  done: number;
  skipped: number;
  failed: number;
  /** Library-relative paths of the link's videos now present locally. */
  videoFiles?: string[];
}

/** Maps to the `icloudImport.errors.*` translation keys. */
export type ICloudImportErrorKey = 'invalid' | 'expired' | 'busy' | 'tooMany' | 'lost';

const POLL_MS = 1000;

/**
 * Start-and-poll client for /api/icloud/import, shared by every surface that
 * offers "download this Apple link into the library" (the media library strip
 * and the slideshow wrong-link bridge), so they can't drift on job semantics.
 * `onFinished` fires once per job when it leaves the running state.
 */
export function useICloudImport(onFinished?: (job: ICloudImportJobStatus) => void) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ICloudImportJobStatus | null>(null);
  const [errorKey, setErrorKey] = useState<ICloudImportErrorKey | null>(null);
  const [starting, setStarting] = useState(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const running = starting || (!!jobId && job?.state === 'running');
  const finished = !jobId && !!job && (job.state === 'done' || job.state === 'error');

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await editorFetch(`/api/icloud/import?jobId=${encodeURIComponent(jobId)}`);
        if (cancelled) return;
        if (!res.ok) {
          clearInterval(timer);
          setJobId(null);
          setErrorKey('lost');
          return;
        }
        const status: ICloudImportJobStatus = await res.json();
        setJob(status);
        if (status.state !== 'running') {
          clearInterval(timer);
          setJobId(null);
          // The import just changed the library's contents on disk — any
          // module preview holding a fresh-cached backgrounds list would
          // otherwise show the pre-import state for up to a full TTL.
          displayCache.invalidateByPrefix('/api/backgrounds');
          onFinishedRef.current?.(status);
        }
      } catch {
        // Transient poll failure — keep polling; the job runs server-side.
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId]);

  const start = async (url: string, folder: string) => {
    if (!url.trim() || running) return;
    setStarting(true);
    setErrorKey(null);
    setJob(null);
    try {
      const res = await editorFetch('/api/icloud/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), folder }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorKey(
          data.error === 'link-expired' ? 'expired'
            : data.error === 'busy' ? 'busy'
              : data.error === 'too-many-items' ? 'tooMany'
                : 'invalid',
        );
      } else {
        setJob({ state: 'running', total: data.total, done: 0, skipped: 0, failed: 0 });
        setJobId(data.jobId);
      }
    } catch {
      setErrorKey('invalid');
    }
    setStarting(false);
  };

  const reset = () => {
    setJob(null);
    setErrorKey(null);
  };

  return { start, reset, running, finished, job, errorKey };
}
