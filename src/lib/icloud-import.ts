import {
  reserveLibraryImport,
  abandonLibraryImport,
  beginLibraryImport,
  getLibraryImport,
  clearLibraryImportJobs,
  MAX_IMPORT_ITEMS,
  type LibraryImportJob,
  type LibraryImportPlan,
} from './library-import';
import { fetchICloudMedia } from './icloud-media';
import { listICloudLinkItems } from './icloud-link';
import { detectICloudSource, parseICloudLinkToken } from './icloud-parse';

/**
 * One-shot "download everything into the local library" jobs for the two
 * Apple link kinds: Shared Albums (live source that can also be mirrored)
 * and iCloud Links (expiring shares — import is the only sensible mode).
 * Files land in the media library (public/backgrounds/<folder>/) with
 * deterministic names, so re-running an import only fetches what's new.
 *
 * The job engine (registry, process-wide busy lock, item ceiling, download
 * loop) lives in `library-import.ts`, shared with the Google Photos
 * importer; this module contributes the Apple-specific listing and URL
 * pinning.
 */

export type ICloudImportJob = LibraryImportJob;

export type ICloudImportStart =
  | { jobId: string; total: number }
  | { error: 'invalid-link' | 'link-expired' | 'invalid-folder' | 'busy' | 'too-many-items' };

export function clearICloudImportJobs(): void {
  clearLibraryImportJobs();
}

export function getICloudImport(jobId: string): ICloudImportJob | null {
  return getLibraryImport(jobId);
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

async function buildPlans(url: string): Promise<LibraryImportPlan[] | 'invalid-link' | 'link-expired'> {
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

/**
 * Start an import. Listing happens synchronously (so a bad or expired link
 * fails the POST with a clear reason); downloads run in the background and
 * the caller polls getICloudImport.
 */
export async function startICloudImport(url: string, folder: string): Promise<ICloudImportStart> {
  const reserved = reserveLibraryImport(folder);
  if ('error' in reserved) return { error: reserved.error };
  const { job, dir } = reserved;

  let plans: Awaited<ReturnType<typeof buildPlans>>;
  try {
    plans = await buildPlans(url);
  } catch (err) {
    abandonLibraryImport(job.id);
    throw err;
  }
  if (plans === 'invalid-link' || plans === 'link-expired') {
    abandonLibraryImport(job.id);
    return { error: plans };
  }
  if (plans.length > MAX_IMPORT_ITEMS) {
    abandonLibraryImport(job.id);
    return { error: 'too-many-items' };
  }

  beginLibraryImport(job, dir, plans, { allowUrl: isAppleContentUrl });
  return { jobId: job.id, total: plans.length };
}
