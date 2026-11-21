'use client';

import { useCallback, useRef, useState } from 'react';
import { isSessionExpired } from '@/lib/editor-fetch';
import { libraryFileFromServeUrl, uploadLibraryFile } from '@/lib/library-client';
import { downscaleForUpload } from '@/lib/image-downscale';
import {
  companionsLast,
  liveUploadPairing,
  IMAGE_MIME_BY_EXT,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  VIDEO_MIME_BY_EXT,
  VIDEO_MIME_TYPES,
  mediaKindOf,
} from '@/lib/media-formats';
import { extensionOf, fileNameOf } from '@/lib/media-paths';
import { isUnplayableVideo } from '@/lib/video-codec';

/**
 * The biggest video a phone sends. The hub holds a whole upload in memory,
 * several times over, before it stores it: a 200 MB clip can wake the
 * out-of-memory killer on a 2 GB hub, and phones are where 200 MB clips come
 * from. Half the hub's own limit keeps the peak well clear of that until
 * uploads stream straight to disk.
 */
export const PHONE_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

/** Why one picked file was not added. `wontPlay` is an HEVC video (what
 *  iPhones record by default), which the wall's Chromium cannot play. */
export type UploadProblem = 'tooBigPhoto' | 'tooBigVideo' | 'notMedia' | 'wontPlay' | 'failed';

export interface UploadFailure {
  /** The name the file had on the phone. */
  name: string;
  problem: UploadProblem;
}

export interface UploadRun {
  /** The folder the batch goes into. */
  folder: string;
  total: number;
  /** Index of the file being prepared or sent; `total` once finished. */
  current: number;
  /** Share of the batch sent so far, 0 to 1. */
  progress: number;
  /** Bytes still to send, counting unsent photos at their picked size. */
  bytesLeft: number;
  /** The batch holds photos, which are made smaller before they go. */
  hasPhotos: boolean;
  added: { path: string; kind: 'image' | 'video' }[];
  failures: UploadFailure[];
  finished: boolean;
}

/** How often a byte-progress event may redraw the tab. */
const PROGRESS_REDRAW_MS = 150;

/** The picked file's kind, with a missing MIME type filled in from its name
 *  (some pickers leave it empty, and the hub checks it). */
function prepare(file: File): { file: File; kind: 'image' | 'video' } | null {
  const byName = mediaKindOf(file.name);
  if (file.type === '') {
    if (!byName) return null;
    const type = (byName === 'image' ? IMAGE_MIME_BY_EXT : VIDEO_MIME_BY_EXT)[extensionOf(file.name)];
    return { file: new File([file], file.name, { type, lastModified: file.lastModified }), kind: byName };
  }
  if (file.type.startsWith('video/')) return { file, kind: 'video' };
  if (file.type.startsWith('image/')) return { file, kind: 'image' };
  return null;
}

/**
 * Why a picked file cannot go, when that is known before anything is read or
 * sent: not a picture or video, a video the hub does not take, or one over
 * the phone's size cap. Photos are only judged after they are made smaller,
 * and HEVC only once the file is read, so both answer null here.
 */
function refusedUpFront(prepared: ReturnType<typeof prepare>): UploadProblem | null {
  if (!prepared) return 'notMedia';
  if (prepared.kind === 'video') {
    if (!VIDEO_MIME_TYPES.includes(prepared.file.type)) return 'notMedia';
    if (prepared.file.size > PHONE_VIDEO_MAX_BYTES) return 'tooBigVideo';
  }
  return null;
}

/**
 * Sends picked photos and videos into a library folder one at a time, with a
 * real progress bar. Each photo is made smaller on the phone first
 * (`downscaleForUpload`). A file that cannot go is listed with its reason and
 * the rest carry on, so a batch reports every failure, not only the last.
 * `onAdded` fires after each file lands, so the grid fills in as it goes.
 */
export function usePhotoUploads(onAdded: () => void) {
  const [run, setRun] = useState<UploadRun | null>(null);
  const activeRef = useRef(false);
  const onAddedRef = useRef(onAdded);
  onAddedRef.current = onAdded;

  const start = useCallback(async (chosen: File[], folder: string) => {
    if (activeRef.current || chosen.length === 0) return;
    activeRef.current = true;
    // A Live Photo clip goes after its picture, and follows it to the name it
    // was saved under.
    const picked = companionsLast(chosen);
    const pairing = liveUploadPairing();
    const total = picked.length;
    const prepared = picked.map(prepare);
    const refused = prepared.map(refusedUpFront);
    // Files turned away before sending never count toward what is left to send.
    const sizes = picked.map((f, i) => (refused[i] ? 0 : f.size));
    const added: UploadRun['added'] = [];
    const failures: UploadFailure[] = [];
    let lastDraw = 0;

    const draw = (current: number, sentOfCurrent: number, finished = false) => {
      const currentSize = sizes[current] || 1;
      const later = sizes.slice(current + 1).reduce((sum, size) => sum + size, 0);
      setRun({
        folder,
        total,
        current,
        progress: finished ? 1 : Math.min(1, (current + Math.min(1, sentOfCurrent / currentSize)) / total),
        bytesLeft: finished ? 0 : Math.max(0, currentSize - sentOfCurrent) + later,
        hasPhotos: picked.some((f) => f.type.startsWith('image/') || mediaKindOf(f.name) === 'image'),
        added: [...added],
        failures: [...failures],
        finished,
      });
    };

    try {
      for (let i = 0; i < total; i++) {
        draw(i, 0);
        const name = picked[i].name;
        const problem = refused[i];
        const ready = prepared[i];
        if (problem || !ready) {
          failures.push({ name, problem: problem ?? 'notMedia' });
          continue;
        }
        let { file } = ready;
        const { kind } = ready;
        if (kind === 'video') {
          // It would upload fine and then show as a black slide.
          if (await isUnplayableVideo(file)) {
            failures.push({ name, problem: 'wontPlay' });
            continue;
          }
        } else {
          file = await downscaleForUpload(file);
          if (!IMAGE_MIME_TYPES.includes(file.type)) {
            failures.push({ name, problem: 'notMedia' });
            continue;
          }
          if (file.size > MAX_IMAGE_BYTES) {
            failures.push({ name, problem: 'tooBigPhoto' });
            continue;
          }
        }
        const pairedName = pairing.nameFor(file.name);
        if (pairedName !== file.name) file = new File([file], pairedName, { type: file.type, lastModified: file.lastModified });
        sizes[i] = file.size;
        draw(i, 0);
        try {
          const result = await uploadLibraryFile(file, folder, (sent) => {
            const now = Date.now();
            if (now - lastDraw < PROGRESS_REDRAW_MS) return;
            lastDraw = now;
            draw(i, sent);
          });
          const path = result.ok && result.path ? libraryFileFromServeUrl(result.path) : null;
          if (path) {
            pairing.landed(file.name, fileNameOf(path));
            added.push({ path, kind });
            onAddedRef.current();
          } else {
            failures.push({
              name,
              problem: result.status === 413 ? (kind === 'video' ? 'tooBigVideo' : 'tooBigPhoto') : 'failed',
            });
          }
        } catch (err) {
          // The login redirect is already underway; nothing more to say.
          if (isSessionExpired(err)) return;
          failures.push({ name, problem: 'failed' });
        }
      }
      draw(total, 0, true);
    } finally {
      activeRef.current = false;
    }
  }, []);

  const dismiss = useCallback(() => {
    if (!activeRef.current) setRun(null);
  }, []);

  return { run, start, dismiss, busy: run !== null && !run.finished };
}
