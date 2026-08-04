import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fetchWithTimeout } from './api-utils';
import { safeLibraryPath, writeLibraryFile, MAX_VIDEO_BYTES, MAX_IMPORT_IMAGE_BYTES } from './library-files';
import { logger } from './logger';

const log = logger('library-import');

/**
 * Shared "download a batch of remote media into the local library" engine,
 * used by the iCloud importer (Shared Albums / iCloud Links) and the Google
 * Photos importer (Picker sessions). One module on purpose:
 *
 * - The jobs map below is the process-wide busy lock. Downloads are
 *   sequential because the hub is often itself a Pi; ONE import at a time
 *   across ALL sources keeps peak memory flat and library writes
 *   uninterleaved. Source-private job maps would silently repeal that.
 * - `MAX_IMPORT_ITEMS` is the shared ceiling: enough photos to fill a Pi SD
 *   card should fail loudly ("too many"), never truncate silently.
 * - Files land with deterministic names, so re-running an import only
 *   fetches what's new (dedup by name stem).
 *
 * Jobs are in-memory (like display command queues): the editor polls the
 * source's import route while the download loop runs server-side.
 */

export interface LibraryImportJob {
  id: string;
  state: 'running' | 'done' | 'error';
  total: number;
  /** Files downloaded this run. */
  done: number;
  /** Files that already existed locally (dedup by deterministic name). */
  skipped: number;
  /** Files that failed to download (counted, never fatal to the job). */
  failed: number;
  folder: string;
  /**
   * Library-relative paths (folder/name.ext) of the batch's videos that are
   * in the library after this run — downloaded or already present. Lets a
   * video module auto-select the clip when a batch contains exactly one.
   */
  videoFiles: string[];
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface LibraryImportPlan {
  url: string;
  type: 'image' | 'video';
  /** Full filename when known up front; otherwise the stem — the extension
   *  comes from the response Content-Type. */
  filename?: string;
  stem?: string;
}

export interface LibraryImportRunOptions {
  /**
   * Defense-in-depth: plan URLs come from upstream RESPONSE bodies — never
   * fetch one outside the source's own content domains.
   */
  allowUrl: (url: string) => boolean;
  /**
   * Extra request headers, re-evaluated per item so a long job survives an
   * access-token refresh. Returning null (or throwing) means auth is gone —
   * every remaining item would fail identically, so the job ABORTS with
   * state 'error' instead of grinding through the batch one failure (and one
   * upstream token round-trip) at a time while holding the process-wide
   * import lock.
   */
  getHeaders?: () => Promise<Record<string, string> | null>;
  /** Runs after the job leaves 'running' (e.g. close the upstream session). */
  onFinished?: (job: LibraryImportJob) => void | Promise<void>;
}

const FINISHED_JOB_TTL_MS = 60 * 60_000;
const PER_FILE_TIMEOUT_MS = 120_000;

/**
 * Hard ceiling on items per import. Shared Albums cap at ~5000 photos and
 * CloudKit shares can be larger still — enough to silently fill a Pi SD
 * card. Anyone with a genuinely bigger batch gets a clear "too many"
 * message instead of a mystery full disk.
 */
export const MAX_IMPORT_ITEMS = 2000;

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const jobs = new Map<string, LibraryImportJob>();

/** Test hook. */
export function clearLibraryImportJobs(): void {
  jobs.clear();
}

function evictStaleJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > FINISHED_JOB_TTL_MS) jobs.delete(id);
  }
}

export function getLibraryImport(jobId: string): LibraryImportJob | null {
  evictStaleJobs();
  return jobs.get(jobId) ?? null;
}

/**
 * Reserve the process-wide import slot and register a running job BEFORE any
 * (possibly slow) upstream listing — the jobs map IS the busy lock, and
 * reserving synchronously closes the window where two near-simultaneous
 * requests both pass the busy check and run concurrently.
 */
export function reserveLibraryImport(
  folder: string,
): { job: LibraryImportJob; dir: string } | { error: 'busy' | 'invalid-folder' } {
  evictStaleJobs();
  for (const job of jobs.values()) {
    if (job.state === 'running') return { error: 'busy' };
  }

  const dir = safeLibraryPath(folder);
  if (!dir) return { error: 'invalid-folder' };

  const job: LibraryImportJob = {
    id: randomUUID(),
    state: 'running',
    total: 0,
    done: 0,
    skipped: 0,
    failed: 0,
    folder,
    videoFiles: [],
    startedAt: Date.now(),
  };
  jobs.set(job.id, job);
  return { job, dir };
}

/** Release a reservation whose listing failed or produced nothing usable. */
export function abandonLibraryImport(jobId: string): void {
  jobs.delete(jobId);
}

async function downloadOne(
  plan: LibraryImportPlan,
  dir: string,
  existingByStem: Map<string, string>,
  allowUrl: (url: string) => boolean,
  headers: Record<string, string> | undefined,
): Promise<{ outcome: 'done' | 'skipped'; filename: string }> {
  const stem = plan.stem ?? plan.filename!.replace(/\.[^.]+$/, '');
  const existing = existingByStem.get(stem);
  if (existing) return { outcome: 'skipped', filename: existing };

  if (!allowUrl(plan.url)) throw new Error('download blocked: URL outside the source content domains');

  const res = await fetchWithTimeout(plan.url, { timeout: PER_FILE_TIMEOUT_MS, retries: 1, headers });
  if (!res.ok) throw new Error(`download failed with status ${res.status}`);

  // The extension is always drawn from a closed known-safe set, so no
  // upstream value can ever name a file something the library and serve
  // route don't expect.
  let filename = plan.filename;
  if (!filename) {
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    const ext = EXT_BY_CONTENT_TYPE[contentType] ?? (plan.type === 'video' ? 'mp4' : 'jpg');
    filename = `${stem}.${ext}`;
  }

  const maxBytes = plan.type === 'video' ? MAX_VIDEO_BYTES : MAX_IMPORT_IMAGE_BYTES;
  await writeLibraryFile(path.join(dir, filename), res.body, maxBytes);
  existingByStem.set(stem, filename);
  return { outcome: 'done', filename };
}

async function runJob(
  job: LibraryImportJob,
  plans: LibraryImportPlan[],
  dir: string,
  opts: LibraryImportRunOptions,
): Promise<void> {
  await fs.mkdir(dir, { recursive: true });

  // One readdir up front: dedup compares name stems, so a re-import skips
  // already-downloaded items without re-fetching a single byte. Mapping stem
  // → filename (not a bare Set) lets skipped items still report their real
  // name into job.videoFiles.
  const existingByStem = new Map<string, string>();
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) existingByStem.set(entry.name.replace(/\.[^.]+$/, ''), entry.name);
    }
  } catch { /* fresh folder */ }

  // Sequential on purpose — see module docblock.
  for (const plan of plans) {
    // Auth is resolved outside the per-item catch: losing it is fatal to the
    // whole job (see getHeaders docs), while a single failed download isn't.
    let headers: Record<string, string> | undefined;
    if (opts.getHeaders) {
      let fresh: Record<string, string> | null = null;
      try {
        fresh = await opts.getHeaders();
      } catch {
        fresh = null;
      }
      if (!fresh) {
        job.state = 'error';
        job.error = 'connection lost';
        job.finishedAt = Date.now();
        return;
      }
      headers = fresh;
    }
    try {
      const { outcome, filename } = await downloadOne(plan, dir, existingByStem, opts.allowUrl, headers);
      if (outcome === 'skipped') job.skipped++;
      else job.done++;
      if (plan.type === 'video') {
        job.videoFiles.push(job.folder ? `${job.folder}/${filename}` : filename);
      }
    } catch (err) {
      job.failed++;
      log.warn('import item failed:', err instanceof Error ? err.message : err);
    }
  }

  job.state = 'done';
  job.finishedAt = Date.now();
}

/**
 * Start the download loop for a reserved job. Empty plans complete the job
 * immediately (a successful import of nothing). Callers enforce their own
 * pre-checks (item ceiling, "nothing picked") via abandonLibraryImport.
 */
export function beginLibraryImport(
  job: LibraryImportJob,
  dir: string,
  plans: LibraryImportPlan[],
  opts: LibraryImportRunOptions,
): void {
  job.total = plans.length;

  if (plans.length === 0) {
    job.state = 'done';
    job.finishedAt = Date.now();
    void opts.onFinished?.(job);
    return;
  }

  void runJob(job, plans, dir, opts)
    .catch((err) => {
      job.state = 'error';
      job.error = err instanceof Error ? err.message : 'Import failed';
      job.finishedAt = Date.now();
      log.error('import job failed:', err);
    })
    .finally(() => {
      void opts.onFinished?.(job);
    });
}
