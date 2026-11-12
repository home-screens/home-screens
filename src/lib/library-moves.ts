import { promises as fs } from 'fs';
import path from 'path';
import { configRevision, updateConfigAtomic } from '@/lib/config';
import { blockedRemovals, rewriteMediaRefs, scanMediaUsage, type MediaUse } from '@/lib/media-usage';
import { libraryRoot, listLibraryFolder, safeLibraryPath } from '@/lib/library-files';
import { bumpLibraryRevision } from '@/lib/library-revision';
import { sanitizeFolderName } from '@/lib/library-folder-name';
import { removeThumbnails } from '@/lib/thumbnails';
import { ROTATION_FILE_RE, fileNameOf, folderOf } from '@/lib/media-paths';
import type { ScreenConfiguration } from '@/types/config';
import { RefusalError, type RefusalParams } from '@/lib/refusal';

/**
 * Moving files between folders and renaming folders, with the config
 * following: every screen background, day rule, module file and slideshow
 * folder that named the old path is rewritten to the new one.
 *
 * Disk and config change as one step. The file moves run inside the queued
 * config update editor saves go through, so nothing else can read or write
 * the config between the move and the rewrite; if a move fails, the ones
 * already done are put back and the config is left untouched, and if the
 * config write fails after the moves, they are put back too. No path can
 * end with files in one place and references pointing at another.
 */

export const MAX_FOLDER_DEPTH = 2;

/**
 * Why a move, rename or folder change was turned down. Each one has a
 * sentence in the `editor` dictionary under `refusals.library`; the phone's
 * Photos tab phrases the same refusals from the status alone.
 */
export type LibraryRefusalCode =
  | 'library.badFolder'
  | 'library.folderGone'
  | 'library.badPath'
  | 'library.fileGone'
  | 'library.fileExists'
  | 'library.nameClash'
  | 'library.reservedName'
  | 'library.badName'
  | 'library.tooDeep'
  | 'library.folderExists'
  | 'library.folderNotEmpty';

/** Thrown by the operations below and the folder routes; the route wrapper answers with its code. */
export class LibraryMoveError extends RefusalError {
  constructor(status: number, code: LibraryRefusalCode, message: string, params?: RefusalParams) {
    super(status, code, message, params ? { params } : {});
    this.name = 'LibraryMoveError';
  }
}

/** A clean `folder/name` (no empty or dot segments), or null. */
export function cleanLibraryPath(raw: string): string | null {
  const segments = raw.split('/').filter((seg) => seg !== '' && seg !== '.');
  if (segments.length === 0 || segments.some((seg) => seg === '..')) return null;
  return segments.join('/');
}

/** A clean folder path: '' for the top level, else `a` or `a/b`. */
export function cleanFolderPath(raw: string): string | null {
  if (raw === '' || raw === '/' || raw === '.') return '';
  return cleanLibraryPath(raw);
}

async function requireFolder(folder: string): Promise<string> {
  const abs = folder === '' ? libraryRoot() : safeLibraryPath(folder);
  if (!abs) throw new LibraryMoveError(400, 'library.badFolder', 'Invalid folder');
  try {
    if (!(await fs.stat(abs)).isDirectory()) throw new Error('not a dir');
  } catch {
    throw new LibraryMoveError(404, 'library.folderGone', 'Folder not found');
  }
  return abs;
}

/**
 * Move a file without ever overwriting: a hard link refuses with EEXIST when
 * the target already exists (atomically, unlike a check followed by a
 * rename), then the source is unlinked. On a filesystem that cannot link,
 * fall back to a rename guarded by a fresh existence check.
 */
async function moveNoClobber(from: string, to: string): Promise<void> {
  try {
    await fs.link(from, to);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') throw new LibraryMoveError(409, 'library.fileExists', `${path.basename(to)} is already in that folder`, { name: path.basename(to) });
    if (code !== 'EXDEV' && code !== 'EPERM' && code !== 'ENOTSUP') throw err;
    try {
      await fs.access(to);
      throw new LibraryMoveError(409, 'library.fileExists', `${path.basename(to)} is already in that folder`, { name: path.basename(to) });
    } catch (accessErr) {
      if (accessErr instanceof LibraryMoveError) throw accessErr;
    }
    await fs.rename(from, to);
    return;
  }
  await fs.unlink(from);
}

export interface MoveResult {
  moved: { from: string; to: string }[];
  /** Files left where they were because each is the last picture a
   *  slideshow has to show, with that slideshow's use. */
  kept: { path: string; usage: MediaUse[] }[];
  /** Config references rewritten to follow the moves. */
  rewritten: number;
  /** Revision of the config after the rewrite, for an editor holding a copy. */
  revision: string;
  /** Revision of the config the rewrite was applied to, read in the same write. */
  previousRevision: string;
}

interface PlannedMove {
  from: string;
  to: string;
  absFrom: string;
  absTo: string;
}

/**
 * Move library files into `directory` under their own names. Every move is
 * checked before any file moves: a name already in the target folder, two
 * selected files sharing a name, or a top-level `rotation-` name refuses the
 * whole batch. A file leaving a slideshow's folder leaves that slideshow, so
 * the last picture a slideshow has to show stays behind (reported in `kept`)
 * and the rest move, the same rule a delete follows.
 */
export async function moveLibraryFiles(files: string[], directory: string): Promise<MoveResult> {
  const folder = cleanFolderPath(directory);
  if (folder == null) throw new LibraryMoveError(400, 'library.badFolder', 'Invalid folder');
  const targetDir = await requireFolder(folder);

  const plan: PlannedMove[] = [];
  const seenSources = new Set<string>();
  const targetNames = new Map<string, string>();
  for (const raw of files) {
    const from = cleanLibraryPath(raw);
    const absFrom = from ? safeLibraryPath(from) : null;
    if (!from || !absFrom) throw new LibraryMoveError(400, 'library.badPath', 'Invalid path');
    if (seenSources.has(from)) continue;
    seenSources.add(from);
    try {
      if (!(await fs.stat(absFrom)).isFile()) throw new Error('not a file');
    } catch {
      throw new LibraryMoveError(404, 'library.fileGone', `File not found: ${raw}`, { name: fileNameOf(from) });
    }
    const name = fileNameOf(from);
    const to = folder ? `${folder}/${name}` : name;
    if (to === from) continue;
    if (!folder && ROTATION_FILE_RE.test(name)) {
      throw new LibraryMoveError(400, 'library.reservedName', `Names starting with "rotation-" are kept for rotating backgrounds at the top level. Rename ${name} first.`, { name });
    }
    const clash = targetNames.get(name);
    if (clash) {
      throw new LibraryMoveError(409, 'library.nameClash', `${clash} and ${from} are both called ${name}; only one can go there`, { name });
    }
    targetNames.set(name, from);
    const absTo = path.join(targetDir, name);
    try {
      await fs.access(absTo);
      throw new LibraryMoveError(409, 'library.fileExists', `${name} is already in that folder`, { name });
    } catch (err) {
      if (err instanceof LibraryMoveError) throw err;
    }
    plan.push({ from, to, absFrom, absTo });
  }

  if (plan.length === 0) {
    const revision = configRevision(await readCurrentConfig());
    return { moved: [], kept: [], rewritten: 0, revision, previousRevision: revision };
  }

  const done: PlannedMove[] = [];
  const kept: MoveResult['kept'] = [];
  let moving: PlannedMove[] = plan;
  const rollback = async () => {
    for (const step of done.splice(0).reverse()) {
      await moveNoClobber(step.absTo, step.absFrom).catch(() => { /* best effort */ });
    }
  };

  let rewritten = 0;
  let previousRevision = '';
  let next: ScreenConfiguration | null = null;
  try {
    next = await updateConfigAtomic(async (current) => {
      previousRevision = configRevision(current);
      moving = await withoutLastPictures(current, plan, kept);
      try {
        for (const step of moving) {
          await moveNoClobber(step.absFrom, step.absTo);
          done.push(step);
        }
      } catch (err) {
        await rollback();
        throw err;
      }
      const byFrom = new Map(moving.map((m) => [m.from, m.to]));
      const result = rewriteMediaRefs(current, (p) => byFrom.get(p) ?? null, () => null);
      rewritten = result.changed;
      return result.config;
    });
  } catch (err) {
    // Either the moves threw (already rolled back) or the config write did.
    await rollback();
    throw err;
  }
  await Promise.all(moving.map((step) => removeThumbnails(step.from)));
  if (moving.length > 0) bumpLibraryRevision();
  return { moved: moving.map(({ from, to }) => ({ from, to })), kept, rewritten, revision: configRevision(next), previousRevision };
}

/**
 * The planned moves minus each slideshow's last picture, which stays so no
 * wall is left with nothing to show; those land in `kept`. Every file in the
 * source folders is scanned, since "last" is relative to what else is there.
 */
async function withoutLastPictures(
  config: ScreenConfiguration,
  plan: PlannedMove[],
  kept: MoveResult['kept'],
): Promise<PlannedMove[]> {
  const known = new Set(plan.map((step) => step.from));
  for (const folder of new Set(plan.map((step) => folderOf(step.from)))) {
    for (const file of await listLibraryFolder(folder)) known.add(file);
  }
  const blocked = blockedRemovals(scanMediaUsage(config, known), plan.map((step) => step.from), 'move');
  for (const [path, usage] of blocked) kept.push({ path, usage });
  return plan.filter((step) => !blocked.has(step.from));
}

async function readCurrentConfig(): Promise<ScreenConfiguration> {
  return updateConfigAtomic((current) => current);
}

export interface RenameResult {
  from: string;
  to: string;
  rewritten: number;
  revision: string;
  /** Revision of the config the rewrite was applied to, read in the same write. */
  previousRevision: string;
}

/**
 * Rename one folder (its last segment; the parent stays). Files inside and
 * in any subfolder keep their names, and every reference to them, plus any
 * slideshow showing the folder or a subfolder, follows the new spelling.
 */
export async function renameLibraryFolder(current: string, newName: string): Promise<RenameResult> {
  const from = cleanFolderPath(current);
  if (!from) throw new LibraryMoveError(400, 'library.badFolder', 'Invalid folder');
  const absFrom = await requireFolder(from);
  const safeName = sanitizeFolderName(newName);
  if (!safeName) throw new LibraryMoveError(400, 'library.badName', 'Invalid folder name');
  const parent = folderOf(from);
  const to = parent ? `${parent}/${safeName}` : safeName;
  if (to === from) {
    const revision = configRevision(await readCurrentConfig());
    return { from, to, rewritten: 0, revision, previousRevision: revision };
  }
  if (to.split('/').length > MAX_FOLDER_DEPTH) throw new LibraryMoveError(400, 'library.tooDeep', `Maximum folder depth is ${MAX_FOLDER_DEPTH}`, { max: MAX_FOLDER_DEPTH });
  const absTo = safeLibraryPath(to);
  if (!absTo) throw new LibraryMoveError(400, 'library.badName', 'Invalid folder name');
  try {
    await fs.access(absTo);
    throw new LibraryMoveError(409, 'library.folderExists', `A folder called ${safeName} is already there`, { name: safeName });
  } catch (err) {
    if (err instanceof LibraryMoveError) throw err;
  }

  const files = await listFilesUnder(absFrom, from);
  const prefix = `${from}/`;
  let renamed = false;
  let rewritten = 0;
  let previousRevision = '';
  let next: ScreenConfiguration;
  try {
    next = await updateConfigAtomic(async (config) => {
      previousRevision = configRevision(config);
      await fs.rename(absFrom, absTo);
      renamed = true;
      const result = rewriteMediaRefs(
        config,
        (p) => (p.startsWith(prefix) ? to + p.slice(from.length) : null),
        (folder) => (folder === from ? to : folder.startsWith(prefix) ? to + folder.slice(from.length) : null),
      );
      rewritten = result.changed;
      return result.config;
    });
  } catch (err) {
    if (renamed) await fs.rename(absTo, absFrom).catch(() => { /* best effort */ });
    throw err;
  }
  // Thumbnails are keyed by path, so every copy under the old name is dead.
  await Promise.all(files.map((f) => removeThumbnails(f)));
  bumpLibraryRevision();
  return { from, to, rewritten, revision: configRevision(next), previousRevision };
}

async function listFilesUnder(absDir: string, rel: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const relPath = `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await listFilesUnder(path.join(absDir, entry.name), relPath));
    else if (entry.isFile()) out.push(relPath);
  }
  return out;
}
