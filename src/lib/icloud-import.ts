import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fetchWithTimeout } from './api-utils';
import { safeLibraryPath, writeLibraryFile, MAX_VIDEO_BYTES, MAX_IMPORT_IMAGE_BYTES } from './library-files';
import { fetchICloudMedia } from './icloud-media';
import { listICloudLinkItems } from './icloud-link';
import { detectICloudSource, parseICloudLinkToken } from './icloud-parse';
import { logger } from './logger';

const log = logger('icloud-import');

/**
 * One-shot "download everything into the local library" jobs for the two
 * Apple link kinds: Shared Albums (live source that can also be mirrored)
 * and iCloud Links (expiring shares — import is the only sensible mode).
 * Files land in the media library (public/backgrounds/<folder>/) with
 * deterministic names, so re-running an import only fetches what's new.
 *
 * Jobs are in-memory (like display command queues): the editor polls
 * GET /api/icloud/import?jobId= while the download loop runs server-side.
 */

export interface ICloudImportJob {
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
   * Library-relative paths (folder/name.ext) of the link's videos that are in
   * the library after this run — downloaded or already present. Lets a video
   * module auto-select the clip when a link contains exactly one.
   */
  videoFiles: string[];
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export type ICloudImportStart =
  | { jobId: string; total: number }
  | { error: 'invalid-link' | 'link-expired' | 'invalid-folder' | 'busy' | 'too-many-items' };

interface DownloadPlan {
  url: string;
  type: 'image' | 'video';
  /** Full filename when known up front (iCloud Links); otherwise the stem —
   *  the extension comes from the response Content-Type (Shared Albums). */
  filename?: string;
  stem?: string;
}

const FINISHED_JOB_TTL_MS = 60 * 60_000;
const PER_FILE_TIMEOUT_MS = 120_000;

/**
 * Hard ceiling on items per import. Shared Albums cap at ~5000 photos and
 * CloudKit shares can be larger still — enough to silently fill a Pi SD card.
 * Anyone with a genuinely bigger album gets a clear "too many" message
 * instead of a mystery full disk.
 */
const MAX_IMPORT_ITEMS = 2000;

const jobs = new Map<string, ICloudImportJob>();

/** Test hook. */
export function clearICloudImportJobs(): void {
  jobs.clear();
}

function evictStaleJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > FINISHED_JOB_TTL_MS) jobs.delete(id);
  }
}

export function getICloudImport(jobId: string): ICloudImportJob | null {
  evictStaleJobs();
  return jobs.get(jobId) ?? null;
}

/**
 * Every download URL comes from an Apple RESPONSE body (webasseturls or
 * CloudKit rendition fields). Upstream requests are pinned to Apple hosts,
 * so this is defense-in-depth: never fetch a response-supplied URL outside
 * Apple's content domains.
 */
function isAppleContentUrl(rawUrl: string): boolean {
  try {
    const { protocol, hostname } = new URL(rawUrl);
    return protocol === 'https:' && /(^|\.)(icloud-content\.com|icloud\.com|cdn-apple\.com)$/i.test(hostname);
  } catch {
    return false;
  }
}

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

async function buildPlans(url: string): Promise<DownloadPlan[] | 'invalid-link' | 'link-expired'> {
  const source = detectICloudSource(url);
  if (source === 'album') {
    // fetchICloudMedia dispatches both album backends (legacy sharedstreams and
    // new-format CloudKit), so importing works for either album link shape.
    const items = await fetchICloudMedia(url);
    return items.map((item) => ({
      url: item.url,
      type: item.type,
      stem: `icloud-${item.guid.replace(/[^A-Za-z0-9-]/g, '')}`,
    }));
  }
  if (source === 'link') {
    const token = parseICloudLinkToken(url)!;
    const items = await listICloudLinkItems(token);
    if (items === null) return 'link-expired';
    return items.map((item) => ({ url: item.downloadUrl, type: item.type, filename: item.filename }));
  }
  return 'invalid-link';
}

async function downloadOne(
  plan: DownloadPlan,
  dir: string,
  existingByStem: Map<string, string>,
): Promise<{ outcome: 'done' | 'skipped'; filename: string }> {
  const stem = plan.stem ?? plan.filename!.replace(/\.[^.]+$/, '');
  const existing = existingByStem.get(stem);
  if (existing) return { outcome: 'skipped', filename: existing };

  if (!isAppleContentUrl(plan.url)) throw new Error('download blocked: not an Apple content URL');

  const res = await fetchWithTimeout(plan.url, { timeout: PER_FILE_TIMEOUT_MS, retries: 1 });
  if (!res.ok) throw new Error(`download failed with status ${res.status}`);

  // The extension is always drawn from a closed known-safe set (this map for
  // albums, EXT_BY_FILE_TYPE for links), so no upstream value can ever name
  // a file something the library and serve route don't expect.
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

async function runJob(job: ICloudImportJob, plans: DownloadPlan[], dir: string): Promise<void> {
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

  // Sequential on purpose: the hub is often itself a Pi, and Apple's CDN is
  // fast enough that parallelism buys little for the memory it risks.
  for (const plan of plans) {
    try {
      const { outcome, filename } = await downloadOne(plan, dir, existingByStem);
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
 * Start an import. Listing happens synchronously (so a bad or expired link
 * fails the POST with a clear reason); downloads run in the background and
 * the caller polls getICloudImport.
 */
export async function startICloudImport(url: string, folder: string): Promise<ICloudImportStart> {
  evictStaleJobs();
  // One import at a time, process-wide, on purpose: downloads are sequential
  // for Pi memory reasons, and a second concurrent job would double peak
  // memory and interleave writes. In multi-editor setups the second editor
  // gets a clear "busy" and retries — that 409 is the queue.
  for (const job of jobs.values()) {
    if (job.state === 'running') return { error: 'busy' };
  }

  const dir = safeLibraryPath(folder);
  if (!dir) return { error: 'invalid-folder' };

  // Register the job BEFORE the (15-30s) listing await — the jobs map IS the
  // busy lock, and reserving it synchronously closes the window where two
  // near-simultaneous POSTs both pass the check above and run concurrently.
  const job: ICloudImportJob = {
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

  let plans: Awaited<ReturnType<typeof buildPlans>>;
  try {
    plans = await buildPlans(url);
  } catch (err) {
    jobs.delete(job.id);
    throw err;
  }
  if (plans === 'invalid-link' || plans === 'link-expired') {
    jobs.delete(job.id);
    return { error: plans };
  }
  if (plans.length > MAX_IMPORT_ITEMS) {
    jobs.delete(job.id);
    return { error: 'too-many-items' };
  }

  job.total = plans.length;

  if (plans.length === 0) {
    job.state = 'done';
    job.finishedAt = Date.now();
    return { jobId: job.id, total: 0 };
  }

  void runJob(job, plans, dir).catch((err) => {
    job.state = 'error';
    job.error = err instanceof Error ? err.message : 'Import failed';
    job.finishedAt = Date.now();
    log.error('import job failed:', err);
  });

  return { jobId: job.id, total: plans.length };
}
