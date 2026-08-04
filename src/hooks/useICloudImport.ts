'use client';

import { useLibraryImportJob, type LibraryImportJobStatus } from './useLibraryImportJob';

export type ICloudImportJobStatus = LibraryImportJobStatus;

/** Maps to the `icloudImport.errors.*` translation keys. */
export type ICloudImportErrorKey = 'invalid' | 'expired' | 'busy' | 'tooMany' | 'lost';

/**
 * Start-and-poll client for /api/icloud/import, shared by every surface that
 * offers "download this Apple link into the library" (the media library strip
 * and the slideshow wrong-link bridge), so they can't drift on job semantics.
 * `onFinished` fires once per job when it leaves the running state.
 * Job polling (and the backgrounds-cache invalidation) lives in
 * useLibraryImportJob, shared with the Google Photos importer.
 */
export function useICloudImport(onFinished?: (job: ICloudImportJobStatus) => void) {
  const { start: startJob, reset, running, finished, job, errorCode } = useLibraryImportJob('/api/icloud/import', onFinished);

  const errorKey: ICloudImportErrorKey | null = errorCode === null ? null
    : errorCode === 'link-expired' ? 'expired'
      : errorCode === 'busy' ? 'busy'
        : errorCode === 'too-many-items' ? 'tooMany'
          : errorCode === 'lost' ? 'lost'
            : 'invalid';

  const start = async (url: string, folder: string) => {
    if (!url.trim() || running) return;
    await startJob({ url: url.trim(), folder });
  };

  return { start, reset, running, finished, job, errorKey };
}
