import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { withAuth, withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { listLibraryFolder, safeLibraryPath, writeLibraryFile } from '@/lib/library-files';
import {
  IMAGE_FILE_RE,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_FILE_RE,
  VIDEO_MIME_TYPES,
} from '@/lib/media-formats';
import { mintMediaToken } from '@/lib/media-token';
import { updateConfigAtomic } from '@/lib/config';
import { blockedRemovals, scanMediaUsage, type MediaUse } from '@/lib/media-usage';
import { LIBRARY_REVISION_HEADER, bumpLibraryRevision, libraryRevision } from '@/lib/library-revision';
import { referencedRotationFiles, rotationCacheStore } from '@/lib/background-rotation-cache';
import { removeThumbnails } from '@/lib/thumbnails';
import { ROTATION_FILE_RE, extensionOf, fileNameOf, folderOf, isRotationFile, serveUrlFor } from '@/lib/media-paths';
import { listLibraryMedia } from '@/lib/photo-sources/library';
import { isMediaTypes } from '@/lib/photo-source';
import { enqueueCommand } from '@/lib/display-commands';
import { svgDeclaresSize } from '@/lib/svg-intrinsic-size';
import type { MediaListItem } from '@/types/config';

export const dynamic = 'force-dynamic';

const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

/** Helper: resolve a background filename to its serve URL */
function serveUrl(filename: string, directory?: string) {
  return serveUrlFor(directory ? `${directory}/${filename}` : filename);
}

export const GET = withDisplayAuth(async (request: NextRequest) => {
  const directory = request.nextUrl.searchParams.get('directory') || '';
  const media = request.nextUrl.searchParams.get('media');
  if (media && !['photos', 'videos', 'both'].includes(media)) {
    return NextResponse.json({ error: 'Invalid media parameter' }, { status: 400 });
  }

  // `file=` is a point lookup: resolve one known relative path to a
  // single-item MediaListItem[] (always the typed shape, never the legacy
  // string[]) without enumerating — or minting tokens for — its whole
  // directory. Missing or media-filtered files return [] like an empty list.
  const file = request.nextUrl.searchParams.get('file');
  if (file) {
    const resolved = safeLibraryPath(file);
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid file' }, { status: 400 });
    }
    const isVideo = VIDEO_FILE_RE.test(file);
    const isImage = IMAGE_FILE_RE.test(file);
    const matchesMedia = media === 'videos' ? isVideo : media === 'photos' ? isImage : isVideo || isImage;
    if (!matchesMedia) return NextResponse.json([]);
    try {
      if (!(await fs.stat(resolved)).isFile()) return NextResponse.json([]);
    } catch {
      return NextResponse.json([]);
    }
    let url = `/api/backgrounds/serve?file=${encodeURIComponent(file)}`;
    if (isVideo) {
      // Bind the token to the same `file` value the serve route reads back.
      const token = await mintMediaToken(file);
      if (token) url += `&mt=${encodeURIComponent(token)}`;
    }
    const item: MediaListItem = { url, type: isVideo ? 'video' : 'image' };
    return NextResponse.json([item]);
  }

  // Which library revision this list reflects, taken before the folder is
  // read so the list is at least that new.
  const listHeaders = { [LIBRARY_REVISION_HEADER]: libraryRevision() };
  // The same listing a library slideshow plays (photo-sources/library), so
  // the editor's grid and the wall can never disagree about a folder.
  const items = await listLibraryMedia(directory, isMediaTypes(media) ? media : 'photos');
  if (!items) return NextResponse.json({ error: 'Invalid directory' }, { status: 400 });
  return NextResponse.json(items, { headers: listHeaders });
}, 'Failed to list backgrounds');

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * An SVG with no viewBox and no absolute width/height has no shape the
 * browser can scale, so it stretches to whatever box it is painted in (a day
 * cell at "Picture size 40", a screen background). Refuse it with a plain
 * explanation rather than store a picture that only looks right by accident.
 */
async function svgSizeProblem(file: File): Promise<string | null> {
  if (file.type !== 'image/svg+xml') return null;
  if (svgDeclaresSize(await file.text())) return null;
  return `${file.name} has no size information. Add a viewBox to the SVG and try again.`;
}

/**
 * Overwrite one library file with an upload of the same type. The name (and
 * so every reference to it) stays; the extension must match because the
 * references carry it. Written beside the original and renamed over it, so
 * a display fetching mid-upload sees the old file or the new one, never a
 * partial one.
 */
async function replaceLibraryFile(target: string, files: File[]): Promise<NextResponse> {
  if (files.length !== 1) {
    return NextResponse.json({ error: 'Pick one file to replace with' }, { status: 400 });
  }
  const file = files[0];
  const relativePath = libraryRelativePath(fileNameOf(target), folderOf(target));
  const filePath = relativePath ? safeLibraryPath(relativePath) : null;
  if (!relativePath || !filePath) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  try {
    if (!(await fs.stat(filePath)).isFile()) throw new Error('not a file');
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
  const ext = extensionOf(relativePath);
  if (extensionOf(file.name) !== ext) {
    return NextResponse.json(
      { error: `The new file needs to end in ${ext} like the one it replaces` },
      { status: 400 },
    );
  }
  const isVideo = VIDEO_MIME_TYPES.includes(file.type);
  if (!isVideo && !IMAGE_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Invalid file type: ${file.name}` }, { status: 400 });
  }
  const maxSize = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: `File too large: ${file.name} (max ${isVideo ? '200 MB' : '10 MB'})` },
      { status: 413 },
    );
  }
  const svgProblem = await svgSizeProblem(file);
  if (svgProblem) return NextResponse.json({ error: svgProblem }, { status: 400 });
  // Lands under the final name only once whole, so a replaced picture
  // stays whole until the new one is complete.
  await writeLibraryFile(filePath, file.stream(), maxSize);
  await removeThumbnails(relativePath);
  bumpLibraryRevision();
  // The wall keeps a picture in an <img> that never re-requests an unchanged
  // URL, and the config did not change, so nothing else would tell it. A
  // reload makes every display show the new file at once.
  enqueueCommand('all', 'reload');
  return NextResponse.json({ path: serveUrl(fileNameOf(relativePath), folderOf(relativePath) || undefined) });
}

export const POST = withAuth(async (request: NextRequest) => {
  // Reject oversized uploads before parsing: a genuinely oversized multipart
  // body makes request.formData() throw (surfacing as a 500), so the per-file
  // 413 below never runs for them. Capping the whole body at the video max
  // keeps "max 200 MB" truthful; the few hundred bytes of multipart overhead
  // only shave a byte-exact 200 MB file, which the friendly message still covers.
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: 'File too large (max 200 MB)' }, { status: 413 });
  }

  const formData = await request.formData();
  const directory = (formData.get('directory') as string) || '';

  let dir: string;
  if (directory) {
    const resolved = safeLibraryPath(directory);
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid directory' }, { status: 400 });
    }
    dir = resolved;
  } else {
    dir = BGS;
  }

  const files = formData.getAll('file') as File[];

  if (files.length === 0 || !files[0]?.name) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // `replace=<library path>` swaps one existing file in place, keeping its
  // name so every screen and module that points at it keeps working.
  const replaceTarget = formData.get('replace');
  if (typeof replaceTarget === 'string' && replaceTarget) {
    return replaceLibraryFile(replaceTarget, files);
  }

  // Validate all files first
  for (const file of files) {
    const isVideo = VIDEO_MIME_TYPES.includes(file.type);
    if (!isVideo && !IMAGE_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Invalid file type: ${file.name}` }, { status: 400 });
    }
    const maxSize = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    const maxLabel = isVideo ? '200 MB' : '10 MB';
    if (file.size > maxSize) {
      return NextResponse.json({ error: `File too large: ${file.name} (max ${maxLabel})` }, { status: 413 });
    }
    const svgProblem = await svgSizeProblem(file);
    if (svgProblem) return NextResponse.json({ error: svgProblem }, { status: 400 });
  }

  // The top-level `rotation-` names belong to the background rotation, which
  // prunes anything unreferenced under that prefix; a user file there would
  // be listed nowhere and deleted on the next rotation.
  if (!directory) {
    const reserved = files.find((file) => ROTATION_FILE_RE.test(sanitizeName(file.name)));
    if (reserved) {
      return NextResponse.json(
        { error: `Names starting with "rotation-" are kept for rotating backgrounds. Please rename ${reserved.name} and try again.` },
        { status: 400 },
      );
    }
  }

  await fs.mkdir(dir, { recursive: true });

  const uploadedPaths: string[] = [];

  for (const file of files) {
    // A name already in the folder keeps its file: screens and slideshows point
    // at it, and a different picture with the same name (two cameras both make
    // IMG_0001.jpg) must not replace it. The new one gets the next free name.
    const safeName = await freeName(dir, sanitizeName(file.name));
    const filePath = path.join(dir, safeName);
    // Stream to disk in chunks. formData() above already holds the one
    // unavoidable in-memory copy; buffering again via arrayBuffer() would
    // peak at 2-3x the file size, enough to OOM a Pi hub on a 200 MB video.
    const isVideo = VIDEO_MIME_TYPES.includes(file.type);
    await writeLibraryFile(filePath, file.stream(), isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES);
    uploadedPaths.push(serveUrl(safeName, directory || undefined));
  }
  bumpLibraryRevision();

  if (files.length === 1) {
    return NextResponse.json({ path: uploadedPaths[0] }, { status: 201 });
  }

  return NextResponse.json({ paths: uploadedPaths }, { status: 201 });
}, 'Failed to upload background');

/** `name`, or `name-2`, `name-3`... before the extension, whichever is not taken in `dir`. */
async function freeName(dir: string, name: string): Promise<string> {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? name : `${stem}-${n}${ext}`;
    try {
      await fs.access(path.join(dir, candidate));
    } catch {
      return candidate;
    }
  }
}

/**
 * The library-relative path a DELETE body names, in the exact spelling the
 * inventory and the usage scan use (`folder/name`, no empty or dot segments),
 * or null when the directory carries a traversal or an absolute prefix. The
 * usage check keys on this string, so it must be the same string the
 * filesystem resolves; a trailing slash or `./` in `directory` would
 * otherwise slip a referenced file past the guard.
 */
function libraryRelativePath(file: string, directory: string | undefined): string | null {
  const segments = (directory ?? '').split('/').filter((seg) => seg !== '' && seg !== '.');
  if (segments.some((seg) => seg === '..')) return null;
  const base = path.basename(file);
  if (!base || base === '.' || base === '..') return null;
  return [...segments, base].join('/');
}

export const DELETE = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ file?: unknown; directory?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const { file, directory } = body;
  if (!file || typeof file !== 'string') {
    return NextResponse.json({ error: 'file parameter required' }, { status: 400 });
  }
  if (directory != null && typeof directory !== 'string') {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const relativePath = libraryRelativePath(file, directory ?? undefined);
  const filePath = relativePath ? safeLibraryPath(relativePath) : null;
  if (!relativePath || !filePath) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    await fs.access(filePath);
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Refuse to delete a file a screen still depends on (a background, a day
  // rule, a single-photo module) or the last picture a slideshow has to
  // show: a stale page or a quick edit must never blank a screen. The rest
  // of a slideshow's pictures can go; the wall skips a picture that vanishes.
  // The check and the unlink run inside the queued config update, so an
  // editor save adding a reference, or a second delete emptying the same
  // slideshow, cannot land between them.
  const outcome: { refusal?: MediaUse[] } = {};
  await updateConfigAtomic(async (config) => {
    // The whole folder, not just this file: a slideshow's last picture is
    // only "last" relative to the others still in it.
    const known = new Set([relativePath, ...await listLibraryFolder(folderOf(relativePath))]);
    const usage = scanMediaUsage(config, known);
    const blocking = blockedRemovals(usage, [relativePath], 'delete').get(relativePath);
    if (blocking) {
      outcome.refusal = blocking;
      return config;
    }
    // Rotation files are owned by the background rotation, which records them
    // in its own cache rather than in the config. One a screen is showing right
    // now must survive too; the rotation prunes the rest itself.
    if (isRotationFile(relativePath)) {
      const referenced = referencedRotationFiles(await rotationCacheStore.read());
      if (referenced.has(relativePath)) {
        outcome.refusal = [{ kind: 'rotation', configPath: 'rotation' }];
        return config;
      }
    }
    await fs.unlink(filePath);
    return config;
  });
  if (outcome.refusal) {
    return NextResponse.json({ error: 'in use', usage: outcome.refusal }, { status: 409 });
  }

  await removeThumbnails(relativePath);
  bumpLibraryRevision();
  return NextResponse.json({ deleted: path.basename(relativePath) });
}, 'Failed to delete background');
